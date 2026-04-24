import type {
  ConsolidationPolicy,
  ConsolidationResult,
  ConsolidationMetrics,
  MemoryEntry,
  ProvenanceInfo,
  Observation,
} from "./types.js";

export class ConsolidationManager {
  private policy: ConsolidationPolicy;
  private metrics: ConsolidationMetrics;
  private lastConsolidation: number = 0;
  private entries: Map<string, MemoryEntry> = new Map();
  private vectorIndex: Map<string, number[]> = new Map();

  constructor(policy?: Partial<ConsolidationPolicy>) {
    this.policy = {
      maxAgeDays: policy?.maxAgeDays ?? 90,
      decayFactor: policy?.decayFactor ?? 0.9,
      decayIntervalHours: policy?.decayIntervalHours ?? 24 * 7,
      mergeSimilarityThreshold: policy?.mergeSimilarityThreshold ?? 0.95,
      minImportanceThreshold: policy?.minImportanceThreshold ?? 0.05,
      maxEntriesPerRun: policy?.maxEntriesPerRun ?? 1000,
      consolidationIntervalHours: policy?.consolidationIntervalHours ?? 24,
      enableDecay: policy?.enableDecay ?? true,
      enableMerge: policy?.enableMerge ?? true,
      enablePrune: policy?.enablePrune ?? true,
    };

    this.metrics = this.initMetrics();
  }

  private initMetrics(): ConsolidationMetrics {
    return {
      totalEntries: 0,
      avgImportance: 0,
      entriesByType: {},
      importanceDistribution: [],
      decayHistory: [],
      mergeHistory: [],
      pruneHistory: [],
    };
  }

  setPolicy(policy: Partial<ConsolidationPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  getPolicy(): ConsolidationPolicy {
    return { ...this.policy };
  }

  addEntry(entry: MemoryEntry): void {
    this.entries.set(entry.id, { ...entry });
    if (entry.embedding) {
      this.vectorIndex.set(entry.id, entry.embedding);
    }
    this.updateMetrics();
  }

  removeEntry(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    entry.isDeleted = true;
    entry.supersededBy = 'consolidation_prune';
    this.entries.set(id, entry);
    this.vectorIndex.delete(id);
    this.updateMetrics();
    return true;
  }

  shouldConsolidate(): boolean {
    const now = Date.now();
    const intervalMs = this.policy.consolidationIntervalHours * 60 * 60 * 1000;
    return now - this.lastConsolidation > intervalMs;
  }

  async consolidate(): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const result: ConsolidationResult = {
      decayedCount: 0,
      mergedCount: 0,
      prunedCount: 0,
      duration: 0,
      timestamp: startTime,
    };

    if (!this.shouldConsolidate()) {
      result.duration = Date.now() - startTime;
      return result;
    }

    const entriesToProcess = Array.from(this.entries.values())
      .filter(e => !e.isDeleted)
      .slice(0, this.policy.maxEntriesPerRun);

    for (const entry of entriesToProcess) {
      if (this.policy.enableDecay) {
        const decayed = this.applyDecay(entry);
        if (decayed) result.decayedCount++;
      }
    }

    if (this.policy.enableMerge) {
      const merged = await this.mergeSimilar();
      result.mergedCount = merged;
    }

    if (this.policy.enablePrune) {
      const pruned = this.pruneLowImportance();
      result.prunedCount = pruned;
    }

    result.duration = Date.now() - startTime;
    this.lastConsolidation = Date.now();

    this.metrics.decayHistory.push({
      timestamp: result.timestamp,
      count: result.decayedCount,
    });
    this.metrics.mergeHistory.push({
      timestamp: result.timestamp,
      count: result.mergedCount,
    });
    this.metrics.pruneHistory.push({
      timestamp: result.timestamp,
      count: result.prunedCount,
    });

    this.updateMetrics();
    return result;
  }

  private applyDecay(entry: MemoryEntry): boolean {
    const now = Date.now();
    const ageHours = (now - entry.validFrom) / (1000 * 60 * 60);
    const decayIntervalMs = this.policy.decayIntervalHours * 60 * 60 * 1000;

    if (entry.lastDecayAt && now - entry.lastDecayAt < decayIntervalMs) {
      return false;
    }

    const decayPeriods = Math.floor(ageHours / this.policy.decayIntervalHours);
    const newImportance = entry.importance * Math.pow(this.policy.decayFactor, decayPeriods);

    if (newImportance < entry.importance) {
      entry.importance = Math.max(this.policy.minImportanceThreshold, newImportance);
      entry.decayCount++;
      entry.lastDecayAt = now;
      entry.updatedAt = now;
      this.entries.set(entry.id, entry);
      return true;
    }

    return false;
  }

  private async mergeSimilar(): Promise<number> {
    const entries = Array.from(this.entries.values()).filter(e => !e.isDeleted);
    const toMerge: Set<string> = new Set();
    let mergeCount = 0;

    for (let i = 0; i < entries.length; i++) {
      if (toMerge.has(entries[i].id)) continue;

      for (let j = i + 1; j < entries.length; j++) {
        if (toMerge.has(entries[j].id)) continue;

        const similarity = this.computeSimilarity(entries[i], entries[j]);
        if (similarity >= this.policy.mergeSimilarityThreshold) {
          toMerge.add(entries[j].id);
        }
      }
    }

    for (const id of toMerge) {
      const entry = this.entries.get(id);
      if (entry) {
        entry.isDeleted = true;
        entry.supersededBy = 'consolidation_merge';
        entry.updatedAt = Date.now();
        this.entries.set(id, entry);
        this.vectorIndex.delete(id);
        mergeCount++;
      }
    }

    return mergeCount;
  }

  private computeSimilarity(a: MemoryEntry, b: MemoryEntry): number {
    if (a.embedding && b.embedding && a.embedding.length === b.embedding.length) {
      return this.cosineSimilarity(a.embedding, b.embedding);
    }

    const aWords = new Set(a.content.toLowerCase().split(/\s+/));
    const bWords = new Set(b.content.toLowerCase().split(/\s+/));
    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    return intersection.size / union.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }

  private pruneLowImportance(): number {
    let pruneCount = 0;

    for (const [id, entry] of this.entries) {
      if (entry.isDeleted) continue;

      const ageHours = (Date.now() - entry.validFrom) / (1000 * 60 * 60);
      const maxAgeHours = this.policy.maxAgeDays * 24;

      if (ageHours > maxAgeHours && entry.importance < this.policy.minImportanceThreshold * 2) {
        entry.isDeleted = true;
        entry.supersededBy = 'consolidation_prune';
        entry.updatedAt = Date.now();
        this.entries.set(id, entry);
        this.vectorIndex.delete(id);
        pruneCount++;
      }
    }

    return pruneCount;
  }

  getMetrics(): ConsolidationMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  private updateMetrics(): void {
    const entries = Array.from(this.entries.values()).filter(e => !e.isDeleted);

    this.metrics.totalEntries = entries.length;

    if (entries.length > 0) {
      const totalImportance = entries.reduce((sum, e) => sum + e.importance, 0);
      this.metrics.avgImportance = totalImportance / entries.length;
    } else {
      this.metrics.avgImportance = 0;
    }

    this.metrics.entriesByType = {};
    for (const entry of entries) {
      this.metrics.entriesByType[entry.type] = (this.metrics.entriesByType[entry.type] || 0) + 1;
    }

    const buckets = ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'];
    const bucketCounts = buckets.map(() => 0);

    for (const entry of entries) {
      const bucketIndex = Math.min(4, Math.floor(entry.importance * 5));
      bucketCounts[bucketIndex]++;
    }

    this.metrics.importanceDistribution = buckets.map((bucket, i) => ({
      bucket,
      count: bucketCounts[i],
    }));
  }

  getEntries(options?: {
    type?: MemoryEntry['type'];
    minImportance?: number;
    includeDeleted?: boolean;
    limit?: number;
  }): MemoryEntry[] {
    let entries = Array.from(this.entries.values());

    if (!options?.includeDeleted) {
      entries = entries.filter(e => !e.isDeleted);
    }

    if (options?.type) {
      entries = entries.filter(e => e.type === options.type);
    }

    if (options?.minImportance !== undefined) {
      entries = entries.filter(e => e.importance >= options.minImportance!);
    }

    entries.sort((a, b) => b.importance - a.importance);

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  getHealthyEntries(): MemoryEntry[] {
    return this.getEntries({ minImportance: this.policy.minImportanceThreshold * 2 });
  }

  clear(): void {
    this.entries.clear();
    this.vectorIndex.clear();
    this.metrics = this.initMetrics();
  }
}

export function createConsolidationManager(policy?: Partial<ConsolidationPolicy>): ConsolidationManager {
  return new ConsolidationManager(policy);
}

export const DEFAULT_CONSOLIDATION_POLICY: ConsolidationPolicy = {
  maxAgeDays: 90,
  decayFactor: 0.9,
  decayIntervalHours: 24 * 7,
  mergeSimilarityThreshold: 0.95,
  minImportanceThreshold: 0.05,
  maxEntriesPerRun: 1000,
  consolidationIntervalHours: 24,
  enableDecay: true,
  enableMerge: true,
  enablePrune: true,
};
