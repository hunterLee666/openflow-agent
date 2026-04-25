export interface SemanticMemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  tags: string[];
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface SemanticMemoryIndex {
  entries: Map<string, SemanticMemoryEntry>;
  tagIndex: Map<string, Set<string>>;
  importanceIndex: Map<number, Set<string>>;
}

export class SemanticMemory {
  private index: SemanticMemoryIndex;
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.index = {
      entries: new Map(),
      tagIndex: new Map(),
      importanceIndex: new Map(),
    };
    this.maxEntries = maxEntries;
  }

  async add(entry: Omit<SemanticMemoryEntry, "lastAccessedAt" | "accessCount">): Promise<void> {
    if (this.index.entries.size >= this.maxEntries) {
      await this.evictLeastImportant();
    }

    const fullEntry: SemanticMemoryEntry = {
      ...entry,
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };

    this.index.entries.set(entry.id, fullEntry);

    for (const tag of entry.tags) {
      if (!this.index.tagIndex.has(tag)) {
        this.index.tagIndex.set(tag, new Set());
      }
      this.index.tagIndex.get(tag)!.add(entry.id);
    }

    if (!this.index.importanceIndex.has(entry.importance)) {
      this.index.importanceIndex.set(entry.importance, new Set());
    }
    this.index.importanceIndex.get(entry.importance)!.add(entry.id);
  }

  async get(id: string): Promise<SemanticMemoryEntry | null> {
    const entry = this.index.entries.get(id);
    if (!entry) return null;

    entry.lastAccessedAt = Date.now();
    entry.accessCount++;

    return entry;
  }

  async searchByTags(tags: string[], limit = 10): Promise<SemanticMemoryEntry[]> {
    const candidateIds = new Set<string>();

    for (const tag of tags) {
      const ids = this.index.tagIndex.get(tag);
      if (ids) {
        for (const id of ids) {
          candidateIds.add(id);
        }
      }
    }

    const results: SemanticMemoryEntry[] = [];
    for (const id of candidateIds) {
      const entry = this.index.entries.get(id);
      if (entry) {
        results.push(entry);
      }
    }

    results.sort((a, b) => {
      const importanceDiff = b.importance - a.importance;
      if (importanceDiff !== 0) return importanceDiff;
      return b.lastAccessedAt - a.lastAccessedAt;
    });

    return results.slice(0, limit);
  }

  async searchByImportance(minImportance: number, limit = 10): Promise<SemanticMemoryEntry[]> {
    const results: SemanticMemoryEntry[] = [];

    for (const [importance, ids] of this.index.importanceIndex) {
      if (importance >= minImportance) {
        for (const id of ids) {
          const entry = this.index.entries.get(id);
          if (entry) {
            results.push(entry);
          }
        }
      }
    }

    results.sort((a, b) => b.importance - a.importance);
    return results.slice(0, limit);
  }

  async update(id: string, updates: Partial<SemanticMemoryEntry>): Promise<boolean> {
    const entry = this.index.entries.get(id);
    if (!entry) return false;

    if (updates.tags && updates.tags !== entry.tags) {
      for (const tag of entry.tags) {
        const tagSet = this.index.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(id);
          if (tagSet.size === 0) {
            this.index.tagIndex.delete(tag);
          }
        }
      }

      entry.tags = updates.tags;

      for (const tag of updates.tags) {
        if (!this.index.tagIndex.has(tag)) {
          this.index.tagIndex.set(tag, new Set());
        }
        this.index.tagIndex.get(tag)!.add(id);
      }
    }

    if (updates.importance !== undefined && updates.importance !== entry.importance) {
      const oldImportance = entry.importance;
      const oldSet = this.index.importanceIndex.get(oldImportance);
      if (oldSet) {
        oldSet.delete(id);
        if (oldSet.size === 0) {
          this.index.importanceIndex.delete(oldImportance);
        }
      }

      entry.importance = updates.importance;

      if (!this.index.importanceIndex.has(updates.importance)) {
        this.index.importanceIndex.set(updates.importance, new Set());
      }
      this.index.importanceIndex.get(updates.importance)!.add(id);
    }

    if (updates.content !== undefined) {
      entry.content = updates.content;
    }

    return true;
  }

  async delete(id: string): Promise<boolean> {
    const entry = this.index.entries.get(id);
    if (!entry) return false;

    this.index.entries.delete(id);

    for (const tag of entry.tags) {
      const tagSet = this.index.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(id);
        if (tagSet.size === 0) {
          this.index.tagIndex.delete(tag);
        }
      }
    }

    const importanceSet = this.index.importanceIndex.get(entry.importance);
    if (importanceSet) {
      importanceSet.delete(id);
      if (importanceSet.size === 0) {
        this.index.importanceIndex.delete(entry.importance);
      }
    }

    return true;
  }

  private async evictLeastImportant(): Promise<void> {
    let minImportance = Infinity;
    let minEntryId: string | null = null;

    for (const [id, entry] of this.index.entries) {
      if (entry.importance < minImportance) {
        minImportance = entry.importance;
        minEntryId = id;
      }
    }

    if (minEntryId) {
      await this.delete(minEntryId);
    }
  }

  async clear(): Promise<void> {
    this.index.entries.clear();
    this.index.tagIndex.clear();
    this.index.importanceIndex.clear();
  }

  size(): number {
    return this.index.entries.size;
  }

  getStats(): { total: number; tags: number; avgImportance: number } {
    let totalImportance = 0;
    for (const entry of this.index.entries.values()) {
      totalImportance += entry.importance;
    }

    return {
      total: this.index.entries.size,
      tags: this.index.tagIndex.size,
      avgImportance: this.index.entries.size > 0 ? totalImportance / this.index.entries.size : 0,
    };
  }
}
