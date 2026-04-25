import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { ProceduralMemory } from "./procedural-memory.js";
import { SemanticCompressor, createSemanticCompressor } from "./semantic-compressor.js";
import { TripleIndex, createTripleIndex } from "./triple-index.js";
import { SemanticSynthesizer, createSemanticSynthesizer } from "./semantic-synthesizer.js";
import { QueryPlanner, createQueryPlanner } from "./query-planner.js";
import { SessionManager, createSessionManager } from "./session-manager.js";
import { TokenOptimizer, createTokenOptimizer } from "./token-optimizer.js";
import { SQLiteStorage, createSQLiteStorage } from "./sqlite-storage.js";
import { HNSWVectorIndex, createHNSWVectorIndex } from "./hnsw-vector-index.js";
import { KnowledgeGraph, createKnowledgeGraph } from "./knowledge-graph.js";
import { ConfidenceScorer, createConfidenceScorer } from "./confidence-scorer.js";
import { ConsolidationScheduler, createConsolidationScheduler } from "./consolidation-scheduler.js";
import { IntentRecognizer, createIntentRecognizer } from "./intent-recognizer.js";
import { GoalTracker, createGoalTracker } from "./goal-tracker.js";
import { SafetyChecker, createSafetyChecker } from "./safety-checker.js";
import type { ProceduralMemoryEntry, SkillExecutionRecord } from "./procedural-memory.js";
import type { DialogueTurn } from "./semantic-compressor.js";
import type { SearchResult } from "./triple-index.js";
import type { RetrievalPlan } from "./query-planner.js";
import type { SessionEvent } from "./session-manager.js";
import type { CompressionStats, TokenBudget } from "./token-optimizer.js";
import type { MemoryEntry } from "./sqlite-storage.js";
import type { IntentRecognitionResult, ConversationContext, ConversationMessage, GoalEntry } from "./intent-recognizer.js";

export interface SkillDocument {
  frontmatter: {
    name: string;
    description: string;
    triggers: string[];
    allowedTools: string[];
    version: string;
    createdAt: string;
    updatedAt: string;
    usageCount: number;
  };
  overview: string;
  body: string;
  references: Array<{ title: string; content: string }>;
}

export interface MemoryNudgeConfig {
  interval: number;
  threshold: number;
  maxItemsPerNudge: number;
}

export interface TaskResult {
  goal: string;
  success: boolean;
  trace: Record<string, unknown>;
  feedback?: string;
  timestamp?: string;
}

export interface EnhancedMemoryConfig {
  memoryDir: string;
  enableVectorSearch: boolean;
  vectorDimensions: number;
  vectorBackend: "memory" | "hnsw";
  enableSemanticCompression: boolean;
  enableTokenOptimization: boolean;
  maxContextTokens: number;
  maxMemoryTokens: number;
  nudgeInterval: number;
  enableKnowledgeGraph: boolean;
  enableConfidenceScoring: boolean;
  enableConsolidationScheduler: boolean;
  consolidationIntervalMs: number;
}

const DEFAULT_CONFIG: EnhancedMemoryConfig = {
  memoryDir: ".openflow/memory",
  enableVectorSearch: true,
  vectorDimensions: 384,
  vectorBackend: "hnsw",
  enableSemanticCompression: true,
  enableTokenOptimization: true,
  maxContextTokens: 4000,
  maxMemoryTokens: 2000,
  nudgeInterval: 30,
  enableKnowledgeGraph: true,
  enableConfidenceScoring: true,
  enableConsolidationScheduler: true,
  consolidationIntervalMs: 30 * 60 * 1000,
};

export interface MemoryAddResult {
  id: string;
  tokenCount: number;
  compressionStats?: CompressionStats;
}

export interface MemorySearchResult {
  results: SearchResult[];
  tokenBudget: TokenBudget;
  retrievalPlan: RetrievalPlan;
}

export class EnhancedMemoryCore {
  private config: EnhancedMemoryConfig;
  private workingMemory = new Map<string, unknown>();
  private proceduralMemory: ProceduralMemory;
  private semanticCompressor: SemanticCompressor;
  private tripleIndex: TripleIndex;
  private semanticSynthesizer: SemanticSynthesizer;
  private queryPlanner: QueryPlanner;
  private sessionManager: SessionManager;
  private tokenOptimizer: TokenOptimizer;
  private sqliteStorage: SQLiteStorage;
  private hnswIndex: HNSWVectorIndex | null = null;
  private knowledgeGraph: KnowledgeGraph | null = null;
  private confidenceScorer: ConfidenceScorer | null = null;
  private consolidationScheduler: ConsolidationScheduler | null = null;
  private intentRecognizer: IntentRecognizer;
  private goalTracker: GoalTracker;
  private safetyChecker: SafetyChecker;
  private conversationContext: ConversationContext | null = null;
  private memoryDir: string;
  private nudgeInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor(config?: Partial<EnhancedMemoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryDir = resolve(this.config.memoryDir);

    this.proceduralMemory = new ProceduralMemory(500);
    this.semanticCompressor = createSemanticCompressor();
    this.semanticSynthesizer = createSemanticSynthesizer();
    this.queryPlanner = createQueryPlanner();
    this.sessionManager = createSessionManager({
      sessionDir: join(this.memoryDir, "sessions"),
    });
    this.tokenOptimizer = createTokenOptimizer({
      maxContextTokens: this.config.maxContextTokens,
      maxMemoryTokens: this.config.maxMemoryTokens,
    });

    this.sqliteStorage = createSQLiteStorage(join(this.memoryDir, "memories.db"));

    this.intentRecognizer = createIntentRecognizer();
    this.goalTracker = createGoalTracker();
    this.safetyChecker = createSafetyChecker();

    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.conversationContext = {
      sessionId: this.sessionId,
      currentGoal: "",
      goalHistory: [],
      recentMessages: [],
      turnCount: 0,
    };

    if (this.config.enableVectorSearch && this.config.vectorBackend === "hnsw") {
      this.hnswIndex = createHNSWVectorIndex({
        dimensions: this.config.vectorDimensions,
        storagePath: join(this.memoryDir, "hnsw"),
        metric: "cosine",
      });
    }

    if (this.config.enableKnowledgeGraph) {
      this.knowledgeGraph = createKnowledgeGraph();
    }

    if (this.config.enableConfidenceScoring) {
      this.confidenceScorer = createConfidenceScorer();
    }

    this.tripleIndex = createTripleIndex(
      this.hnswIndex
        ? {
            vectorConfig: {
              backend: "hnsw",
              hnswIndex: this.hnswIndex,
            },
          }
        : undefined
    );

    if (this.config.enableConsolidationScheduler) {
      this.consolidationScheduler = createConsolidationScheduler({
        intervalMs: this.config.consolidationIntervalMs,
      });

      this.consolidationScheduler.setConsolidateFn(async (batchSize, similarityThreshold) => {
        const consolidated = await this.semanticSynthesizer.consolidateBatch(batchSize, similarityThreshold);
        return { consolidated: consolidated.length, merged: consolidated.length };
      });

      if (this.confidenceScorer) {
        this.consolidationScheduler.setApplyDecayFn(async () => {
          this.confidenceScorer!.applyDecayAll();
        });

        this.consolidationScheduler.setPruneFn(async (threshold) => {
          return this.confidenceScorer!.pruneBelow(threshold);
        });
      }
    }
  }

  async initialize(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await mkdir(join(this.memoryDir, "skills"), { recursive: true });

    await this.sqliteStorage.initialize();
    await this.sessionManager.initialize();

    if (this.hnswIndex) {
      await this.hnswIndex.initialize();
    }

    if (this.consolidationScheduler) {
      this.consolidationScheduler.start();
    }

    await this.load();
  }

  async addMemory(
    content: string,
    options?: {
      type?: "fact" | "preference" | "experience" | "context";
      tags?: string[];
      importance?: number;
      embedding?: number[];
      sessionId?: string;
    }
  ): Promise<MemoryAddResult> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const type = options?.type || "fact";
    const tags = options?.tags || [];
    const importance = options?.importance || 0.5;

    let compressionStats: CompressionStats | undefined;
    let processedContent = content;

    if (this.config.enableSemanticCompression) {
      const compressed = this.tokenOptimizer.compressMemory(content);
      processedContent = compressed.compressed;
      compressionStats = compressed.stats;
    }

    const tokenCount = this.tokenOptimizer.countTokens(processedContent).tokenCount;

    await this.sqliteStorage.insert({
      id,
      type,
      content: processedContent,
      tags,
      importance,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionId: options?.sessionId,
    });

    await this.tripleIndex.addLexicalEntry(id, processedContent);

    if (options?.embedding) {
      await this.tripleIndex.addSemanticEntry(id, options.embedding, {
        content: processedContent,
        type,
        importance,
      });

      await this.tripleIndex.addSymbolicEntry(id, {
        type,
        importance,
        timestamp: new Date().toISOString(),
      });
    }

    const unit = await this.semanticCompressor.compressFact(processedContent, {
      type,
      tags,
      importance,
    });

    await this.semanticSynthesizer.addUnit(unit);

    if (this.confidenceScorer) {
      this.confidenceScorer.createScore(id, importance);
    }

    if (this.knowledgeGraph && tags.length > 0) {
      for (const tag of tags) {
        const entityId = `entity_${tag.toLowerCase().replace(/\s+/g, "_")}`;
        const existingEntity = this.knowledgeGraph.getEntity(entityId);

        if (existingEntity) {
          this.knowledgeGraph.incrementMentionCount(entityId);
        } else {
          this.knowledgeGraph.addEntity({
            id: entityId,
            name: tag,
            type: this.inferEntityType(tag),
            description: `Entity extracted from memory: ${processedContent.slice(0, 100)}`,
            properties: { memoryId: id, type },
          });
        }
      }
    }

    return {
      id,
      tokenCount,
      compressionStats,
    };
  }

  async addDialogue(
    dialogue: DialogueTurn[],
    options?: {
      sessionId?: string;
      context?: Map<string, string>;
      referenceTime?: string;
    }
  ): Promise<MemoryAddResult[]> {
    const units = await this.semanticCompressor.compressToUnits(
      dialogue,
      options?.context,
      options?.referenceTime
    );

    const results: MemoryAddResult[] = [];

    for (const unit of units) {
      const result = await this.addMemory(unit.content, {
        type: "experience",
        tags: unit.entities,
        importance: unit.salience,
        sessionId: options?.sessionId,
      });

      results.push(result);
    }

    return results;
  }

  async searchMemories(query: string, options?: { limit?: number; budget?: number }): Promise<MemorySearchResult> {
    const limit = options?.limit || 10;
    const intentResult = await this.recognizeIntent(query);
    const plan = await this.queryPlanner.generateRetrievalPlan(query, intentResult);

    const hybridResults = await this.tripleIndex.hybridSearch(query, undefined, undefined, limit);

    const memories = hybridResults.map((r) => ({
      content: r.content,
      importance: r.score,
      source: String(r.metadata.type || "unknown"),
      timestamp: new Date().toISOString(),
    }));

    const contextResult = this.tokenOptimizer.buildContextWindow(memories, query, options?.budget);

    return {
      results: hybridResults.slice(0, limit),
      tokenBudget: contextResult.budget,
      retrievalPlan: plan,
    };
  }

  async searchWithEmbedding(
    query: string,
    embedding: number[],
    options?: { limit?: number }
  ): Promise<MemorySearchResult> {
    const limit = options?.limit || 10;
    const plan = await this.queryPlanner.generateRetrievalPlan(query);

    const hybridResults = await this.tripleIndex.hybridSearch(query, embedding, undefined, limit);

    const memories = hybridResults.map((r) => ({
      content: r.content,
      importance: r.score,
      source: String(r.metadata.type || "unknown"),
      timestamp: new Date().toISOString(),
    }));

    const contextResult = this.tokenOptimizer.buildContextWindow(memories, query);

    return {
      results: hybridResults.slice(0, limit),
      tokenBudget: contextResult.budget,
      retrievalPlan: plan,
    };
  }

  async startSession(sessionId: string, prompt?: string) {
    return this.sessionManager.startSession(sessionId, prompt);
  }

  async recordSessionEvent(sessionId: string, event: SessionEvent) {
    return this.sessionManager.recordEvent(sessionId, event);
  }

  async endSession(sessionId: string, summary?: string) {
    return this.sessionManager.endSession(sessionId, summary);
  }

  async getSessionInsights() {
    return this.sessionManager.getSessionInsights();
  }

  async consolidateMemories() {
    const consolidated = await this.semanticSynthesizer.consolidateAll();

    for (const unit of consolidated) {
      await this.addMemory(unit.content, {
        type: "fact",
        tags: unit.entities,
        importance: unit.salience,
      });
    }

    return consolidated.length;
  }

  async getMemoryStats() {
    const tripleStats = this.tripleIndex.getStats();
    const synthesizerStats = this.semanticSynthesizer.getStats();
    const sessionStats = this.sessionManager.getStats();
    const sqliteStats = await this.sqliteStorage.getStats();
    const hnswStats = this.hnswIndex ? await this.hnswIndex.getStats() : null;
    const knowledgeGraphStats = this.knowledgeGraph ? this.knowledgeGraph.getStats() : null;
    const confidenceStats = this.confidenceScorer ? this.confidenceScorer.getStats() : null;
    const consolidationStats = this.consolidationScheduler ? this.consolidationScheduler.getStats() : null;

    return {
      tripleIndex: tripleStats,
      synthesizer: synthesizerStats,
      sessions: sessionStats,
      sqlite: sqliteStats,
      vectors: hnswStats,
      knowledgeGraph: knowledgeGraphStats,
      confidence: confidenceStats,
      consolidation: consolidationStats,
    };
  }

  getKnowledgeGraph() {
    return this.knowledgeGraph;
  }

  getConfidenceScorer() {
    return this.confidenceScorer;
  }

  getConsolidationScheduler() {
    return this.consolidationScheduler;
  }

  getIntentRecognizer() {
    return this.intentRecognizer;
  }

  getGoalTracker() {
    return this.goalTracker;
  }

  getSafetyChecker() {
    return this.safetyChecker;
  }

  getConversationContext(): ConversationContext | null {
    return this.conversationContext;
  }

  setLLMClient(llmClient: any): void {
    this.intentRecognizer.setLLMClient(llmClient);
    this.goalTracker.setLLMClient(llmClient);
    this.safetyChecker.setLLMClient(llmClient);
    this.queryPlanner.setIntentRecognizer(this.intentRecognizer);
  }

  async recognizeIntent(userInput: string): Promise<IntentRecognitionResult> {
    if (!this.conversationContext) {
      this.conversationContext = {
        sessionId: this.sessionId,
        currentGoal: "",
        goalHistory: [],
        recentMessages: [],
        turnCount: 0,
      };
    }

    const result = await this.intentRecognizer.recognizeIntent(userInput, this.conversationContext);

    this.conversationContext.recentMessages.push({
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    });

    if (this.conversationContext.recentMessages.length > 20) {
      this.conversationContext.recentMessages = this.conversationContext.recentMessages.slice(-10);
    }

    this.conversationContext.turnCount++;
    this.conversationContext.lastIntent = result;

    return result;
  }

  async recordAssistantResponse(content: string): Promise<void> {
    if (!this.conversationContext) return;

    this.conversationContext.recentMessages.push({
      role: "assistant",
      content,
      timestamp: Date.now(),
    });

    if (this.conversationContext.recentMessages.length > 20) {
      this.conversationContext.recentMessages = this.conversationContext.recentMessages.slice(-10);
    }
  }

  async startNewSession(goal?: string): Promise<string> {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.conversationContext = {
      sessionId: this.sessionId,
      currentGoal: goal || "",
      goalHistory: goal ? [{
        goal,
        timestamp: Date.now(),
        confidence: 1.0,
        isActive: true,
      }] : [],
      recentMessages: [],
      turnCount: 0,
    };

    return this.sessionId;
  }

  async resetSession(): Promise<void> {
    this.conversationContext = {
      sessionId: this.sessionId,
      currentGoal: "",
      goalHistory: [],
      recentMessages: [],
      turnCount: 0,
    };
  }

  startNudgeCycle(): void {
    if (this.nudgeInterval) return;

    this.nudgeInterval = setInterval(
      () => this.runNudge(),
      this.config.nudgeInterval * 60 * 1000
    );
  }

  stopNudgeCycle(): void {
    if (this.nudgeInterval) {
      clearInterval(this.nudgeInterval);
      this.nudgeInterval = null;
    }
  }

  async close(): Promise<void> {
    this.stopNudgeCycle();

    if (this.consolidationScheduler) {
      this.consolidationScheduler.stop();
    }

    await this.sqliteStorage.close();

    if (this.hnswIndex) {
      await this.hnswIndex.close();
    }
  }

  private inferEntityType(tag: string): "person" | "project" | "concept" | "tool" | "location" | "event" | "organization" | "other" {
    const lowerTag = tag.toLowerCase();

    if (lowerTag.includes("user") || lowerTag.includes("person") || lowerTag.includes("team")) {
      return "person";
    }
    if (lowerTag.includes("project") || lowerTag.includes("app") || lowerTag.includes("service")) {
      return "project";
    }
    if (lowerTag.includes("tool") || lowerTag.includes("library") || lowerTag.includes("package")) {
      return "tool";
    }
    if (lowerTag.includes("location") || lowerTag.includes("place") || lowerTag.includes("city")) {
      return "location";
    }
    if (lowerTag.includes("event") || lowerTag.includes("meeting") || lowerTag.includes("conference")) {
      return "event";
    }
    if (lowerTag.includes("org") || lowerTag.includes("company") || lowerTag.includes("organization")) {
      return "organization";
    }

    return "concept";
  }

  private async runNudge(): Promise<void> {
    const highImportanceEntries = await this.sqliteStorage.query({
      minImportance: 0.7,
      limit: 5,
    });

    for (const entry of highImportanceEntries) {
      if (entry.importance >= 0.9) {
        await this.persistFact(entry.content);
      }
    }
  }

  private async persistFact(fact: string): Promise<void> {
    const memoryPath = join(this.memoryDir, "MEMORY.md");
    const content = existsSync(memoryPath) ? await readFile(memoryPath, "utf-8") : "";
    const newContent = `${content}\n- ${fact} (${new Date().toISOString()})`;
    await writeFile(memoryPath, newContent, "utf-8");
  }

  private async load(): Promise<void> {
    await this.loadMemoryMD();
    await this.loadUserMD();
    await this.loadDailyLogs();
    await this.loadProjectMemories();
    await this.loadEntityProfiles();
    await this.loadSessionArchives();
    await this.loadSkills();
  }

  private async loadMemoryMD(): Promise<void> {
    const path = join(this.memoryDir, "MEMORY.md");
    if (existsSync(path)) {
      const content = await readFile(path, "utf-8");
      await this.addMemory(content, {
        type: "fact",
        tags: ["environment", "facts"],
        importance: 0.8,
      });
    }
  }

  private async loadUserMD(): Promise<void> {
    const path = join(this.memoryDir, "USER.md");
    if (existsSync(path)) {
      const content = await readFile(path, "utf-8");
      await this.addMemory(content, {
        type: "preference",
        tags: ["user", "preferences"],
        importance: 0.9,
      });
    }
  }

  private async loadDailyLogs(): Promise<void> {
    const dailyDir = join(this.memoryDir, "daily");
    if (!existsSync(dailyDir)) return;

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dailyDir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 7);

    for (const file of mdFiles) {
      const content = await readFile(join(dailyDir, file), "utf-8");
      const date = file.replace(".md", "");
      await this.addMemory(content, {
        type: "experience",
        tags: ["daily-log", date],
        importance: 0.6,
      });
    }
  }

  private async loadProjectMemories(): Promise<void> {
    const projectsDir = join(this.memoryDir, "projects");
    if (!existsSync(projectsDir)) return;

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(projectsDir);

    for (const file of files) {
      if (file.endsWith(".md")) {
        const content = await readFile(join(projectsDir, file), "utf-8");
        const projectName = file.replace(".md", "");
        await this.addMemory(content, {
          type: "context",
          tags: ["project", projectName],
          importance: 0.7,
        });

        if (this.knowledgeGraph) {
          const entityId = `project_${projectName.toLowerCase().replace(/\s+/g, "_")}`;
          this.knowledgeGraph.addEntity({
            id: entityId,
            name: projectName,
            type: "project",
            description: content.slice(0, 200),
            properties: { sourceFile: file },
          });
        }
      }
    }
  }

  private async loadEntityProfiles(): Promise<void> {
    const entitiesDir = join(this.memoryDir, "entities");
    if (!existsSync(entitiesDir)) return;

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(entitiesDir);

    for (const file of files) {
      if (file.endsWith(".md")) {
        const content = await readFile(join(entitiesDir, file), "utf-8");
        const entityName = file.replace(".md", "");

        await this.addMemory(content, {
          type: "fact",
          tags: ["entity", entityName],
          importance: 0.75,
        });

        if (this.knowledgeGraph) {
          const entityId = `entity_${entityName.toLowerCase().replace(/\s+/g, "_")}`;
          const entityType = this.inferEntityType(entityName);
          this.knowledgeGraph.addEntity({
            id: entityId,
            name: entityName,
            type: entityType,
            description: content.slice(0, 200),
            properties: { sourceFile: file, isProfile: true },
          });
        }
      }
    }
  }

  private async loadSessionArchives(): Promise<void> {
    const sessionsDir = join(this.memoryDir, "sessions");
    if (!existsSync(sessionsDir)) return;

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(sessionsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 10);

    for (const file of mdFiles) {
      const content = await readFile(join(sessionsDir, file), "utf-8");
      await this.addMemory(content, {
        type: "experience",
        tags: ["session-archive", file.replace(".md", "")],
        importance: 0.5,
      });
    }
  }

  private async loadSkills(): Promise<void> {
    const skillsDir = join(this.memoryDir, "skills");
    if (!existsSync(skillsDir)) return;

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(skillsDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const content = await readFile(join(skillsDir, file), "utf-8");
        const skill = this.parseSkillMarkdown(content);
        if (skill) {
          await this.proceduralMemory.learnSkill({
            id: skill.frontmatter.name,
            skillName: skill.frontmatter.name,
            description: skill.frontmatter.description,
            steps: this.parseSkillBody(skill.body),
          });
        }
      }
    }
  }

  async writeDailyLog(entry: string): Promise<void> {
    const dailyDir = join(this.memoryDir, "daily");
    await mkdir(dailyDir, { recursive: true });

    const today = new Date().toISOString().split("T")[0];
    const path = join(dailyDir, `${today}.md`);
    const existing = existsSync(path) ? await readFile(path, "utf-8") : `# Daily Log: ${today}\n\n`;
    const timestamp = new Date().toLocaleTimeString();
    const newContent = `${existing}\n## ${timestamp}\n\n${entry}\n`;
    await writeFile(path, newContent, "utf-8");
  }

  async writeProjectMemory(projectName: string, content: string): Promise<void> {
    const projectsDir = join(this.memoryDir, "projects");
    await mkdir(projectsDir, { recursive: true });

    const path = join(projectsDir, `${projectName.toLowerCase().replace(/\s+/g, "-")}.md`);
    const existing = existsSync(path) ? await readFile(path, "utf-8") : `# Project: ${projectName}\n\n`;
    const newContent = `${existing}\n## ${new Date().toISOString()}\n\n${content}\n`;
    await writeFile(path, newContent, "utf-8");

    await this.addMemory(content, {
      type: "context",
      tags: ["project", projectName],
      importance: 0.7,
    });
  }

  async writeEntityProfile(entityName: string, content: string, type?: string): Promise<void> {
    const entitiesDir = join(this.memoryDir, "entities");
    await mkdir(entitiesDir, { recursive: true });

    const path = join(entitiesDir, `${entityName.toLowerCase().replace(/\s+/g, "-")}.md`);
    const entityType = type || this.inferEntityType(entityName);
    const header = `# ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}: ${entityName}\n\n`;
    await writeFile(path, `${header}${content}`, "utf-8");

    await this.addMemory(content, {
      type: "fact",
      tags: ["entity", entityName],
      importance: 0.75,
    });
  }

  async writeSessionArchive(sessionId: string, content: string): Promise<void> {
    const sessionsDir = join(this.memoryDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });

    const path = join(sessionsDir, `${sessionId}.md`);
    await writeFile(path, content, "utf-8");
  }

  private parseSkillMarkdown(content: string) {
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) return null;

    const frontMatter = frontMatterMatch[1];
    const body = content.slice(frontMatterMatch[0].length).trim();

    const name = frontMatter.match(/name: (.*)/)?.[1] || "unknown";
    const description = frontMatter.match(/description: (.*)/)?.[1] || "";
    const triggers = frontMatter.match(/triggers: (.*)/)?.[1]?.split(", ").map((t) => t.trim()) || [];
    const allowedTools = frontMatter.match(/allowed-tools: (.*)/)?.[1]?.split(", ").map((t) => t.trim()) || [];

    return {
      frontmatter: {
        name,
        description,
        triggers,
        allowedTools,
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
      },
      overview: "",
      body,
      references: [],
    };
  }

  private parseSkillBody(body: string): Array<{ order: number; action: string }> {
    const lines = body.split("\n").filter((line) => line.trim().length > 0);
    return lines.map((line, index) => ({
      order: index + 1,
      action: line.replace(/^\d+\.\s*/, "").trim(),
    }));
  }
}

export function createEnhancedMemoryCore(config?: Partial<EnhancedMemoryConfig>): EnhancedMemoryCore {
  return new EnhancedMemoryCore(config);
}
