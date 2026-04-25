import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EventEmitter } from "node:events";

export interface MemoryEntry {
  id: string;
  type: "fact" | "preference" | "experience" | "context";
  content: string;
  tags: string[];
  importance: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  accessCount: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionMemory {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  entries: MemoryEntry[];
  summary?: string;
  metadata: Record<string, unknown>;
}

export interface MemoryQuery {
  query?: string;
  tags?: string[];
  type?: MemoryEntry["type"];
  minImportance?: number;
  limit?: number;
  sessionId?: string;
}

export class PersistentMemory extends EventEmitter {
  private memoryDir: string;
  private entries: Map<string, MemoryEntry> = new Map();
  private sessionMemories: Map<string, SessionMemory> = new Map();
  private currentSessionId: string | null = null;
  private maxEntries: number;

  constructor(memoryDir: string, maxEntries = 5000) {
    super();
    this.memoryDir = resolve(memoryDir);
    this.maxEntries = maxEntries;
  }

  async initialize(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await mkdir(join(this.memoryDir, "sessions"), { recursive: true });
    await this.loadAllMemories();
  }

  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;

    const sessionMemory: SessionMemory = {
      sessionId,
      startedAt: Date.now(),
      entries: [],
      metadata: {},
    };

    this.sessionMemories.set(sessionId, sessionMemory);
  }

  async addEntry(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount">): Promise<string> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      sessionId: this.currentSessionId || undefined,
    };

    this.entries.set(id, fullEntry);

    if (this.currentSessionId) {
      const sessionMemory = this.sessionMemories.get(this.currentSessionId);
      if (sessionMemory) {
        sessionMemory.entries.push(fullEntry);
      }
    }

    await this.persistEntry(fullEntry);
    await this.enforceMaxEntries();

    this.emit("entry:added", { id, entry: fullEntry });

    return id;
  }

  async addFact(content: string, tags: string[] = [], importance = 0.5): Promise<string> {
    return this.addEntry({
      type: "fact",
      content,
      tags,
      importance,
    });
  }

  async addPreference(content: string, tags: string[] = [], importance = 0.7): Promise<string> {
    return this.addEntry({
      type: "preference",
      content,
      tags,
      importance,
    });
  }

  async addExperience(content: string, tags: string[] = [], importance = 0.8): Promise<string> {
    return this.addEntry({
      type: "experience",
      content,
      tags,
      importance,
    });
  }

  async getEntry(id: string): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
      entry.updatedAt = Date.now();
    }
    return entry || null;
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values());

    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter((e) =>
        query.tags!.some((tag) => e.tags.includes(tag))
      );
    }

    if (query.minImportance !== undefined) {
      results = results.filter((e) => e.importance >= query.minImportance!);
    }

    if (query.sessionId) {
      results = results.filter((e) => e.sessionId === query.sessionId);
    }

    if (query.query) {
      const lowerQuery = query.query.toLowerCase();
      results = results
        .map((e) => ({
          ...e,
          score: this.computeRelevanceScore(e, lowerQuery),
        }))
        .filter((e) => (e as MemoryEntry & { score: number }).score > 0)
        .sort((a, b) => (b as MemoryEntry & { score: number }).score - (a as MemoryEntry & { score: number }).score) as MemoryEntry[];
    }

    results.sort((a, b) => {
      const aScore = a.importance * (a.accessCount + 1);
      const bScore = b.importance * (b.accessCount + 1);
      return bScore - aScore;
    });

    const limit = query.limit || 20;
    return results.slice(0, limit);
  }

  async searchByContent(query: string, limit = 10): Promise<MemoryEntry[]> {
    const lowerQuery = query.toLowerCase();
    const results = Array.from(this.entries.values())
      .filter((e) => e.content.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);

    for (const entry of results) {
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
    }

    return results;
  }

  async getSessionSummary(sessionId: string): Promise<string | null> {
    const sessionMemory = this.sessionMemories.get(sessionId);
    return sessionMemory?.summary || null;
  }

  async endSession(sessionId: string, summary?: string): Promise<void> {
    const sessionMemory = this.sessionMemories.get(sessionId);
    if (sessionMemory) {
      sessionMemory.endedAt = Date.now();
      sessionMemory.summary = summary;

      await this.persistSessionMemory(sessionMemory);
    }

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }

    this.emit("session:ended", { sessionId, summary });
  }

  async getRecentSessions(limit = 10): Promise<SessionMemory[]> {
    return Array.from(this.sessionMemories.values())
      .filter((s) => s.endedAt)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
      .slice(0, limit);
  }

  async getCrossSessionInsights(): Promise<Array<{ type: string; content: string; count: number }>> {
    const insights: Array<{ type: string; content: string; count: number }> = [];

    const tagCounts = new Map<string, number>();
    for (const entry of this.entries.values()) {
      for (const tag of entry.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    for (const [tag, count] of tagCounts.entries()) {
      if (count >= 3) {
        const entries = Array.from(this.entries.values()).filter((e) =>
          e.tags.includes(tag)
        );
        const content = entries.slice(0, 3).map((e) => e.content).join("; ");

        insights.push({
          type: "frequent_topic",
          content,
          count,
        });
      }
    }

    return insights.sort((a, b) => b.count - a.count);
  }

  async updateEntry(id: string, updates: Partial<Pick<MemoryEntry, "content" | "tags" | "importance" | "metadata">>): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    Object.assign(entry, updates, { updatedAt: Date.now() });
    await this.persistEntry(entry);

    this.emit("entry:updated", { id });
    return true;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const deleted = this.entries.delete(id);
    if (deleted) {
      await this.deletePersistedEntry(id);
      this.emit("entry:deleted", { id });
    }
    return deleted;
  }

  async getStats(): Promise<{
    totalEntries: number;
    entriesByType: Record<string, number>;
    sessionsCount: number;
    averageImportance: number;
    mostAccessed: MemoryEntry | null;
  }> {
    const entriesByType: Record<string, number> = {};
    let totalImportance = 0;
    let mostAccessed: MemoryEntry | null = null;

    for (const entry of this.entries.values()) {
      entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
      totalImportance += entry.importance;

      if (!mostAccessed || entry.accessCount > mostAccessed.accessCount) {
        mostAccessed = entry;
      }
    }

    return {
      totalEntries: this.entries.size,
      entriesByType,
      sessionsCount: this.sessionMemories.size,
      averageImportance: this.entries.size > 0 ? totalImportance / this.entries.size : 0,
      mostAccessed,
    };
  }

  private async loadAllMemories(): Promise<void> {
    const indexPath = join(this.memoryDir, "memory-index.json");
    const indexExists = await this.pathExists(indexPath);

    if (indexExists) {
      try {
        const content = await readFile(indexPath, "utf-8");
        const index = JSON.parse(content) as Record<string, MemoryEntry>;

        for (const [id, entry] of Object.entries(index)) {
          this.entries.set(id, entry);
        }
      } catch {
        // Corrupted index, start fresh
      }
    }

    const sessionsDir = join(this.memoryDir, "sessions");
    const sessionsExist = await this.pathExists(sessionsDir);

    if (sessionsExist) {
      const files = await readdir(sessionsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await readFile(join(sessionsDir, file), "utf-8");
            const sessionMemory = JSON.parse(content) as SessionMemory;
            this.sessionMemories.set(sessionMemory.sessionId, sessionMemory);
          } catch {
            // Skip corrupted session files
          }
        }
      }
    }
  }

  private async persistEntry(entry: MemoryEntry): Promise<void> {
    const indexPath = join(this.memoryDir, "memory-index.json");
    const indexExists = await this.pathExists(indexPath);

    let index: Record<string, MemoryEntry> = {};

    if (indexExists) {
      try {
        const content = await readFile(indexPath, "utf-8");
        index = JSON.parse(content) as Record<string, MemoryEntry>;
      } catch {
        // Start fresh
      }
    }

    index[entry.id] = entry;
    await writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  private async persistSessionMemory(session: SessionMemory): Promise<void> {
    const sessionsDir = join(this.memoryDir, "sessions");
    const filePath = join(sessionsDir, `${session.sessionId}.json`);
    await writeFile(filePath, JSON.stringify(session, null, 2));
  }

  private async deletePersistedEntry(id: string): Promise<void> {
    const indexPath = join(this.memoryDir, "memory-index.json");
    const indexExists = await this.pathExists(indexPath);

    if (indexExists) {
      try {
        const content = await readFile(indexPath, "utf-8");
        const index = JSON.parse(content) as Record<string, MemoryEntry>;
        delete index[id];
        await writeFile(indexPath, JSON.stringify(index, null, 2));
      } catch {
        // Ignore errors
      }
    }
  }

  private async enforceMaxEntries(): Promise<void> {
    if (this.entries.size <= this.maxEntries) return;

    const sorted = Array.from(this.entries.values()).sort((a, b) => {
      const aScore = a.importance * (a.accessCount + 1);
      const bScore = b.importance * (b.accessCount + 1);
      return aScore - bScore;
    });

    const toRemove = sorted.slice(0, this.entries.size - this.maxEntries);
    for (const entry of toRemove) {
      this.entries.delete(entry.id);
    }
  }

  private computeRelevanceScore(entry: MemoryEntry, lowerQuery: string): number {
    let score = 0;

    if (entry.content.toLowerCase().includes(lowerQuery)) {
      score += 10;
    }

    for (const tag of entry.tags) {
      if (tag.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }
    }

    score += entry.importance * 2;
    score += Math.min(entry.accessCount, 10);

    return score;
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

export function createPersistentMemory(memoryDir: string, maxEntries?: number): PersistentMemory {
  return new PersistentMemory(memoryDir, maxEntries);
}
