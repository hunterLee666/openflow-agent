import type { MemoryEntry } from "./memory-truncator.js";

export interface MemorySummary {
  id: string;
  originalId?: string;
  type: "working" | "episodic" | "semantic";
  content: string;
  keyPoints: string[];
  entities: string[];
  timestamp: number;
  tokenCount: number;
  compressionRatio: number;
}

export interface MemoryHierarchyConfig {
  workingMemoryLimit: number;
  episodicMemoryLimit: number;
  semanticMemoryLimit: number;
  summaryTriggerThreshold: number;
  maxSummaryLength: number;
  consolidationIntervalMs: number;
  importanceThreshold: number;
}

export const DEFAULT_HIERARCHY_CONFIG: MemoryHierarchyConfig = {
  workingMemoryLimit: 100,
  episodicMemoryLimit: 500,
  semanticMemoryLimit: 2000,
  summaryTriggerThreshold: 50,
  maxSummaryLength: 500,
  consolidationIntervalMs: 5 * 60 * 1000,
  importanceThreshold: 0.7,
};

export interface HierarchicalMemoryLevel {
  name: "working" | "episodic" | "semantic";
  entries: MemoryEntry[];
  summaries: MemorySummary[];
  capacity: number;
  accessCount: number;
  lastAccess: number;
}

export class MemoryConsolidator {
  private levels: Map<string, HierarchicalMemoryLevel> = new Map();
  private config: MemoryHierarchyConfig;
  private importanceScorer?: (entry: MemoryEntry) => number;

  constructor(
    config: Partial<MemoryHierarchyConfig> = {},
    importanceScorer?: (entry: MemoryEntry) => number
  ) {
    this.config = { ...DEFAULT_HIERARCHY_CONFIG, ...config };
    this.importanceScorer = importanceScorer;
    this.initLevels();
  }

  private initLevels(): void {
    this.levels.set("working", {
      name: "working",
      entries: [],
      summaries: [],
      capacity: this.config.workingMemoryLimit,
      accessCount: 0,
      lastAccess: Date.now(),
    });

    this.levels.set("episodic", {
      name: "episodic",
      entries: [],
      summaries: [],
      capacity: this.config.episodicMemoryLimit,
      accessCount: 0,
      lastAccess: Date.now(),
    });

    this.levels.set("semantic", {
      name: "semantic",
      entries: [],
      summaries: [],
      capacity: this.config.semanticMemoryLimit,
      accessCount: 0,
      lastAccess: Date.now(),
    });
  }

  addEntry(entry: MemoryEntry): void {
    const level = this.levels.get(entry.type);
    if (!level) {
      return;
    }

    level.entries.push(entry);

    if (level.entries.length > level.capacity) {
      this.consolidateLevel(entry.type);
    }
  }

  private consolidateLevel(type: "working" | "episodic" | "semantic"): void {
    const level = this.levels.get(type);
    if (!level) {
      return;
    }

    const importanceScores = level.entries.map((entry, index) => ({
      entry,
      score: this.calculateImportance(entry, index),
      index,
    }));

    importanceScores.sort((a, b) => b.score - a.score);

    const keepCount = Math.floor(level.capacity * 0.7);
    const toConsolidate = importanceScores.slice(keepCount);
    const toKeep = importanceScores.slice(0, keepCount).map(s => s.entry);

    if (toConsolidate.length > 0) {
      const summary = this.createSummary(toConsolidate.map(s => s.entry), type);
      level.summaries.push(summary);
    }

    level.entries = toKeep;
  }

  private calculateImportance(entry: MemoryEntry, index: number): number {
    if (this.importanceScorer) {
      return this.importanceScorer(entry);
    }

    let score = 0.5;

    if (entry.metadata) {
      if (entry.metadata.isUserAcknowledged) {
        score += 0.2;
      }
      if (entry.metadata.toolUseCount) {
        score += Math.min(0.3, (entry.metadata.toolUseCount as number) * 0.05);
      }
      if (entry.metadata.hasErrors) {
        score -= 0.2;
      }
    }

    const recencyWeight = 0.2;
    const age = Date.now() - entry.timestamp;
    const maxAge = 24 * 60 * 60 * 1000;
    score += recencyWeight * (1 - Math.min(1, age / maxAge));

    return Math.max(0, Math.min(1, score));
  }

  private createSummary(entries: MemoryEntry[], type: "working" | "episodic" | "semantic"): MemorySummary {
    const concatenated = entries
      .map(e => e.content)
      .join("\n---\n");

    const keyPoints = this.extractKeyPoints(concatenated);
    const entities = this.extractEntities(concatenated);

    const originalLength = concatenated.length;
    const summaryContent = this.generateSummaryText(entries, keyPoints, type);

    return {
      id: `summary_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      originalId: entries[0]?.id,
      type,
      content: summaryContent,
      keyPoints,
      entities,
      timestamp: Date.now(),
      tokenCount: this.estimateTokens(summaryContent),
      compressionRatio: summaryContent.length / originalLength,
    };
  }

  private extractKeyPoints(content: string): string[] {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyPoints: string[] = [];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (
        trimmed.includes("important") ||
        trimmed.includes("critical") ||
        trimmed.includes("remember") ||
        trimmed.includes("note") ||
        trimmed.includes("key") ||
        trimmed.includes("essential")
      ) {
        keyPoints.push(trimmed.slice(0, 100));
      }
    }

    return [...new Set(keyPoints)].slice(0, 5);
  }

  private extractEntities(content: string): string[] {
    const entityPatterns = [
      /(?:file|directory|path):\s*([^\s,]+)/gi,
      /`([^`]+)`/g,
      /"([^"]+)"/g,
      /'([^']+)'/g,
    ];

    const entities = new Set<string>();

    for (const pattern of entityPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const entity = match[1].trim();
        if (entity.length > 2 && entity.length < 50) {
          entities.add(entity);
        }
      }
    }

    return Array.from(entities).slice(0, 20);
  }

  private generateSummaryText(
    entries: MemoryEntry[],
    keyPoints: string[],
    type: "working" | "episodic" | "semantic"
  ): string {
    const summaries: string[] = [];

    summaries.push(`[${type.toUpperCase()} MEMORY SUMMARY]`);
    summaries.push(`Time range: ${this.formatTimestamp(entries[0]?.timestamp)} - ${this.formatTimestamp(entries[entries.length - 1]?.timestamp)}`);
    summaries.push(`Entries consolidated: ${entries.length}`);

    if (keyPoints.length > 0) {
      summaries.push("\nKey Points:");
      for (const point of keyPoints) {
        summaries.push(`- ${point}`);
      }
    }

    const uniqueCommands = [...new Set(
      entries
        .map(e => {
          const match = e.content.match(/^(?:bash|git|node|python| npm |yarn)/);
          return match ? match[0].trim() : null;
        })
        .filter(Boolean)
    )].slice(0, 5);

    if (uniqueCommands.length > 0) {
      summaries.push(`\nCommands used: ${uniqueCommands.join(", ")}`);
    }

    return summaries.join("\n");
  }

  private formatTimestamp(timestamp?: number): string {
    if (!timestamp) {
      return "unknown";
    }
    return new Date(timestamp).toISOString().replace("T", " ").slice(0, 19);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getLevel(type: "working" | "episodic" | "semantic"): HierarchicalMemoryLevel | undefined {
    const level = this.levels.get(type);
    if (level) {
      level.lastAccess = Date.now();
      level.accessCount++;
    }
    return level;
  }

  retrieve(query: string, type?: "working" | "episodic" | "semantic"): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    const types = type ? [type] : ["working", "episodic", "semantic"];

    for (const t of types) {
      const level = this.levels.get(t);
      if (!level) {
        continue;
      }

      const queryLower = query.toLowerCase();

      for (const entry of level.entries) {
        if (entry.content.toLowerCase().includes(queryLower)) {
          results.push(entry);
        }
      }

      for (const summary of level.summaries) {
        if (
          summary.content.toLowerCase().includes(queryLower) ||
          summary.keyPoints.some(kp => kp.toLowerCase().includes(queryLower)) ||
          summary.entities.some(e => e.toLowerCase().includes(queryLower))
        ) {
          results.push({
            id: summary.id,
            type: summary.type,
            content: summary.content,
            timestamp: summary.timestamp,
            metadata: {
              isSummary: true,
              originalId: summary.originalId,
              keyPoints: summary.keyPoints,
              entities: summary.entities,
            },
          });
        }
      }
    }

    return results;
  }

  setImportanceScorer(scorer: (entry: MemoryEntry) => number): void {
    this.importanceScorer = scorer;
  }

  getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [type, level] of this.levels) {
      stats[type] = {
        entries: level.entries.length,
        summaries: level.summaries.length,
        capacity: level.capacity,
        utilization: level.entries.length / level.capacity,
        accessCount: level.accessCount,
        lastAccess: level.lastAccess,
      };
    }

    return stats;
  }
}

export class LLMSummarizer {
  private apiEndpoint?: string;
  private apiKey?: string;
  private model: string;

  constructor(apiEndpoint?: string, apiKey?: string, model: string = "claude-3-sonnet") {
    this.apiEndpoint = apiEndpoint;
    this.apiKey = apiKey;
    this.model = model;
  }

  async summarize(content: string, context?: string): Promise<string> {
    if (this.apiEndpoint && this.apiKey) {
      return this.summarizeViaAPI(content, context);
    }

    return this.simpleSummarize(content);
  }

  private async summarizeViaAPI(content: string, context?: string): Promise<string> {
    const prompt = this.buildSummaryPrompt(content, context);

    try {
      const response = await fetch(this.apiEndpoint!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || this.simpleSummarize(content);
    } catch (error) {
      console.error("LLM summarization failed:", error);
      return this.simpleSummarize(content);
    }
  }

  private buildSummaryPrompt(content: string, context?: string): string {
    return `You are a memory consolidation assistant. Summarize the following content into a concise summary that preserves the most important information.

${context ? `Context: ${context}\n` : ""}
Content to summarize:
---
${content}
---

Please provide a summary that:
1. Captures the main topics and key points
2. Preserves important details like file paths, commands, and configurations
3. Is no longer than 500 tokens
4. Uses bullet points for clarity

Summary:`;
  }

  private simpleSummarize(content: string): string {
    const lines = content.split("\n").filter(l => l.trim());
    const firstLine = lines[0] || "";
    const lastLine = lines[lines.length - 1] || "";

    const wordCount = content.split(/\s+/).length;
    const lineCount = lines.length;

    return `[Memory Summary] ${lineCount} entries, ${wordCount} words. Range: "${firstLine.slice(0, 50)}..." to "${lastLine.slice(0, 50)}..."`;
  }

  async extractActionItems(content: string): Promise<string[]> {
    const actionPatterns = [
      /(?:TODO|FIXME|NOTE|ACTION|IMPORTANT):\s*([^\n]+)/gi,
      /- \[ \]\s*([^\n]+)/g,
      /\*\s*([^\n]+)/g,
    ];

    const items: string[] = [];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        items.push(match[1].trim());
      }
    }

    return [...new Set(items)];
  }
}

export const defaultConsolidator = new MemoryConsolidator();
export const defaultSummarizer = new LLMSummarizer();
