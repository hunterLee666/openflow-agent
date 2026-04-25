import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { SemanticMemory } from "./semantic-memory.js";
import { ProceduralMemory } from "./procedural-memory.js";
import { PersistentMemory } from "./persistent-memory.js";
import type { SemanticMemoryEntry } from "./semantic-memory.js";
import type { ProceduralMemoryEntry, SkillExecutionRecord } from "./procedural-memory.js";
import type { MemoryEntry } from "./persistent-memory.js";

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
  steps: Array<{ tool: string; input: unknown; output: unknown }>;
  outcome: "success" | "failure" | "partial";
  duration?: number;
}

export class MemoryCore {
  private workingMemory = new Map<string, unknown>();
  private semanticMemory: SemanticMemory;
  private proceduralMemory: ProceduralMemory;
  private persistentMemory: PersistentMemory;
  private memoryDir: string;
  private nudgeConfig: MemoryNudgeConfig;
  private nudgeInterval: ReturnType<typeof setInterval> | null = null;

  constructor(memoryDir: string, nudgeConfig?: Partial<MemoryNudgeConfig>) {
    this.memoryDir = resolve(memoryDir);
    this.semanticMemory = new SemanticMemory(1000);
    this.proceduralMemory = new ProceduralMemory(500);
    this.persistentMemory = new PersistentMemory(memoryDir, 5000);
    this.nudgeConfig = {
      interval: nudgeConfig?.interval || 30,
      threshold: nudgeConfig?.threshold || 0.7,
      maxItemsPerNudge: nudgeConfig?.maxItemsPerNudge || 5,
    };
  }

  async initialize(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await mkdir(join(this.memoryDir, "skills"), { recursive: true });
    await this.persistentMemory.initialize();
    await this.load();
  }

  async get(key: string): Promise<unknown> {
    return this.workingMemory.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.workingMemory.set(key, value);
    await this.persistentMemory.addEntry({
      type: "context",
      content: JSON.stringify(value),
      tags: ["working-memory", key],
      importance: 0.5,
      metadata: { key },
    });
  }

  async delete(key: string): Promise<void> {
    this.workingMemory.delete(key);
  }

  async search(query: string, limit = 10): Promise<SemanticMemoryEntry[]> {
    const lowerQuery = query.toLowerCase();
    const tags = lowerQuery.split(/\s+/).filter((t) => t.length > 0);
    
    const semanticResults = await this.semanticMemory.searchByTags(tags, limit);
    const persistentResults = await this.persistentMemory.searchByContent(query, limit);
    
    const combined = [...semanticResults];
    
    for (const entry of persistentResults) {
      const exists = combined.some((s) => s.id === entry.id);
      if (!exists) {
        combined.push({
          id: entry.id,
          content: entry.content,
          tags: entry.tags,
          importance: entry.importance,
          createdAt: entry.createdAt,
          lastAccessedAt: entry.lastAccessedAt || Date.now(),
          accessCount: entry.accessCount,
        });
      }
    }
    
    combined.sort((a, b) => b.importance - a.importance);
    return combined.slice(0, limit);
  }

  async persist(): Promise<void> {
    await this.saveMemoryMD();
    await this.saveUserMD();
    await this.saveSkills();
    
    const semanticEntries = await this.semanticMemory.searchByImportance(0.5, 100);
    for (const entry of semanticEntries) {
      await this.persistentMemory.addEntry({
        type: "fact",
        content: entry.content,
        tags: entry.tags,
        importance: entry.importance,
      });
    }
  }

  async storeSkill(skill: SkillDocument): Promise<void> {
    const entry: Omit<ProceduralMemoryEntry, "successCount" | "failureCount" | "lastUsedAt" | "createdAt" | "version" | "confidence"> = {
      id: skill.frontmatter.name,
      skillName: skill.frontmatter.name,
      description: skill.frontmatter.description,
      steps: this.parseSkillBody(skill.body),
    };

    await this.proceduralMemory.learnSkill(entry);

    const skillPath = join(this.memoryDir, "skills", `${skill.frontmatter.name}.md`);
    await writeFile(skillPath, this.formatSkillMarkdown(skill), "utf-8");
  }

  async retrieveSkill(query: string): Promise<ProceduralMemoryEntry[]> {
    const skill = await this.proceduralMemory.getSkill(query);
    if (skill) {
      return [skill];
    }

    const allSkills = await this.proceduralMemory.getTopSkills(100);
    const lowerQuery = query.toLowerCase();
    return allSkills.filter(
      (s) =>
        s.skillName.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery)
    );
  }

  async distillSkill(taskResult: TaskResult): Promise<SkillDocument> {
    const skill: SkillDocument = {
      frontmatter: {
        name: this.generateSkillName(taskResult.goal),
        description: `Auto-generated skill for: ${taskResult.goal}`,
        triggers: [taskResult.goal.toLowerCase()],
        allowedTools: [...new Set(taskResult.steps.map((s) => s.tool))],
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
      },
      overview: this.generateSkillOverview(taskResult),
      body: this.generateSkillBody(taskResult),
      references: [],
    };

    await this.storeSkill(skill);

    await this.proceduralMemory.recordExecution({
      skillName: skill.frontmatter.name,
      success: taskResult.outcome === "success",
      duration: taskResult.duration || 0,
      timestamp: Date.now(),
    });

    return skill;
  }

  async addSemanticEntry(entry: Omit<SemanticMemoryEntry, "lastAccessedAt" | "accessCount">): Promise<void> {
    await this.semanticMemory.add(entry);
  }

  async getSemanticEntry(id: string): Promise<SemanticMemoryEntry | null> {
    return this.semanticMemory.get(id);
  }

  async recordSkillExecution(record: SkillExecutionRecord): Promise<void> {
    await this.proceduralMemory.recordExecution(record);
  }

  async getSkillStats(skillName: string) {
    return this.proceduralMemory.getSkillStats(skillName);
  }

  async getTopSkills(limit = 10): Promise<ProceduralMemoryEntry[]> {
    return this.proceduralMemory.getTopSkills(limit);
  }

  async getPersistentMemory(): Promise<PersistentMemory> {
    return this.persistentMemory;
  }

  async queryPersistentMemory(query: {
    type?: MemoryEntry["type"];
    tags?: string[];
    minImportance?: number;
    limit?: number;
  }): Promise<MemoryEntry[]> {
    return this.persistentMemory.query({
      type: query.type,
      tags: query.tags,
      minImportance: query.minImportance,
      limit: query.limit || 20,
    });
  }

  async setCurrentSession(sessionId: string): Promise<void> {
    this.persistentMemory.setCurrentSession(sessionId);
  }

  async endSession(sessionId: string, summary?: string): Promise<void> {
    await this.persistentMemory.endSession(sessionId, summary);
  }

  async getRecentSessions(limit = 10): Promise<Array<{
    sessionId: string;
    startedAt: number;
    endedAt?: number;
    summary?: string;
  }>> {
    const sessions = await this.persistentMemory.getRecentSessions(limit);
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      summary: s.summary,
    }));
  }

  startNudgeCycle(): void {
    if (this.nudgeInterval) return;

    this.nudgeInterval = setInterval(
      () => this.runNudge(),
      this.nudgeConfig.interval * 60 * 1000
    );
  }

  stopNudgeCycle(): void {
    if (this.nudgeInterval) {
      clearInterval(this.nudgeInterval);
      this.nudgeInterval = null;
    }
  }

  private async runNudge(): Promise<void> {
    const highImportanceEntries = await this.semanticMemory.searchByTags(["important"], this.nudgeConfig.maxItemsPerNudge);

    for (const entry of highImportanceEntries) {
      if (entry.importance >= 0.9) {
        await this.persistFact(entry.content);
      } else if (entry.importance >= 0.7) {
        await this.summarizeAndPersist(entry);
      }
    }
  }

  private async persistFact(fact: string): Promise<void> {
    const memoryPath = join(this.memoryDir, "MEMORY.md");
    const content = existsSync(memoryPath) ? await readFile(memoryPath, "utf-8") : "";
    const newContent = `${content}\n- ${fact} (${new Date().toISOString()})`;
    await writeFile(memoryPath, newContent, "utf-8");
  }

  private async summarizeAndPersist(_entry: SemanticMemoryEntry): Promise<void> {
    // Would use LLM to summarize, simplified for now
  }

  private async load(): Promise<void> {
    await this.loadMemoryMD();
    await this.loadUserMD();
    await this.loadSkills();
  }

  private async loadMemoryMD(): Promise<void> {
    const path = join(this.memoryDir, "MEMORY.md");
    if (existsSync(path)) {
      const content = await readFile(path, "utf-8");
      await this.semanticMemory.add({
        id: "memory_md",
        content,
        tags: ["environment", "facts"],
        importance: 0.8,
        createdAt: Date.now(),
      });
    }
  }

  private async loadUserMD(): Promise<void> {
    const path = join(this.memoryDir, "USER.md");
    if (existsSync(path)) {
      const content = await readFile(path, "utf-8");
      await this.semanticMemory.add({
        id: "user_md",
        content,
        tags: ["user", "preferences"],
        importance: 0.9,
        createdAt: Date.now(),
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

  private async saveMemoryMD(): Promise<void> {
    // Persist semantic memory to MEMORY.md
  }

  private async saveUserMD(): Promise<void> {
    // Persist user preferences to USER.md
  }

  private async saveSkills(): Promise<void> {
    // Already saved on storeSkill
  }

  private formatSkillMarkdown(skill: SkillDocument): string {
    return `---
name: ${skill.frontmatter.name}
description: ${skill.frontmatter.description}
triggers: ${skill.frontmatter.triggers.join(", ")}
allowed-tools: ${skill.frontmatter.allowedTools.join(", ")}
version: ${skill.frontmatter.version}
created: ${skill.frontmatter.createdAt}
updated: ${skill.frontmatter.updatedAt}
---

# ${skill.frontmatter.name}

## Overview

${skill.overview}

## Steps

${skill.body}

${skill.references.map((ref) => `## ${ref.title}\n\n${ref.content}`).join("\n\n")}
`;
  }

  private parseSkillMarkdown(content: string): SkillDocument | null {
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

  private parseSkillBody(body: string): Array<{ order: number; action: string; parameters?: Record<string, unknown> }> {
    const lines = body.split("\n").filter((line) => line.trim().length > 0);
    return lines.map((line, index) => ({
      order: index + 1,
      action: line.replace(/^\d+\.\s*/, "").trim(),
    }));
  }

  private generateSkillName(goal: string): string {
    return goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "unnamed-skill";
  }

  private generateSkillOverview(taskResult: TaskResult): string {
    return `This skill handles the task: "${taskResult.goal}". It uses ${taskResult.steps.length} steps to achieve the goal.`;
  }

  private generateSkillBody(taskResult: TaskResult): string {
    return taskResult.steps
      .map((step, i) => `${i + 1}. Call \`${step.tool}\` with input: ${JSON.stringify(step.input)}`)
      .join("\n");
  }
}

export function createMemoryCore(memoryDir: string, nudgeConfig?: Partial<MemoryNudgeConfig>): MemoryCore {
  return new MemoryCore(memoryDir, nudgeConfig);
}
