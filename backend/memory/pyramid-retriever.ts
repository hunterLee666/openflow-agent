import { RetrievalLevel, PyramidConfig, MemoryUnit, MemoryMetadata, PyramidRetrievalResult, PyramidItem, ExpansionRequest } from "./types.js";

export { RetrievalLevel };

export class PyramidRetriever {
  private config: PyramidConfig;
  private memoryStore: Map<string, MemoryUnit> = new Map();
  private coldStorageIndex: Map<string, string> = new Map();
  private tokenEstimator: (text: string) => number;

  constructor(config?: Partial<PyramidConfig>, tokenEstimator?: (text: string) => number) {
    this.config = {
      defaultTopK: config?.defaultTopK ?? 10,
      expansionThreshold: config?.expansionThreshold ?? 0.85,
      maxExpansionItems: config?.maxExpansionItems ?? 5,
      tokenEstimateRatio: config?.tokenEstimateRatio ?? 0.25,
      lazyLoadColdStorage: config?.lazyLoadColdStorage ?? true,
    };

    this.tokenEstimator = tokenEstimator ?? ((text: string) => Math.ceil(text.length * this.config.tokenEstimateRatio));
  }

  index(memory: MemoryUnit): void {
    this.memoryStore.set(memory.id, { ...memory });

    if (memory.coldStorageUri) {
      this.coldStorageIndex.set(memory.id, memory.coldStorageUri);
    }
  }

  remove(id: string): boolean {
    this.coldStorageIndex.delete(id);
    return this.memoryStore.delete(id);
  }

  retrieve(
    query: string,
    options?: {
      level?: RetrievalLevel;
      topK?: number;
      filter?: (memory: MemoryUnit) => boolean;
    }
  ): PyramidRetrievalResult {
    const level = options?.level ?? RetrievalLevel.SUMMARY;
    const topK = options?.topK ?? this.config.defaultTopK;

    const candidates = Array.from(this.memoryStore.values());

    const scored = candidates
      .filter(m => !options?.filter || options.filter(m))
      .map(memory => ({
        memory,
        score: this.calculateRelevanceScore(query, memory),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK * 2);

    const items: PyramidItem[] = [];
    const retrievalLevels = new Map<string, RetrievalLevel>();
    let totalTokens = 0;

    for (const { memory, score } of scored) {
      if (items.length >= topK) break;

      const itemLevel = this.determineLevel(memory, score);
      const content = this.extractContentAtLevel(memory, itemLevel);
      const tokens = this.tokenEstimator(content);

      if (totalTokens + tokens > this.estimateMaxTokens(level)) {
        continue;
      }

      retrievalLevels.set(memory.id, itemLevel);

      const item: PyramidItem = {
        id: memory.id,
        level: itemLevel,
        content,
        summary: memory.summary || content.slice(0, 200),
        tokens,
        canExpand: this.canExpand(memory),
        coldStorageUri: memory.coldStorageUri,
        importance: memory.importance,
        source: this.guessSource(memory),
        metadata: memory.metadata,
        expansionRecommendation: this.calculateExpansionRecommendation(score),
      };

      items.push(item);
      totalTokens += tokens;
    }

    const expansionCandidates = items
      .filter(i => i.expansionRecommendation && i.expansionRecommendation > this.config.expansionThreshold)
      .slice(0, this.config.maxExpansionItems)
      .map(i => i.id);

    return {
      query,
      level,
      items,
      totalCandidates: candidates.length,
      tokensUsedEstimate: totalTokens,
      canExpand: expansionCandidates.length > 0,
      expansionCandidates,
      retrievalLevels,
    };
  }

  expand(request: ExpansionRequest): PyramidItem[] {
    const items: PyramidItem[] = [];

    for (const id of request.itemIds) {
      const memory = this.memoryStore.get(id);
      if (!memory) continue;

      const content = this.extractContentAtLevel(memory, request.targetLevel);
      const tokens = this.tokenEstimator(content);

      items.push({
        id: memory.id,
        level: request.targetLevel,
        content,
        summary: memory.summary || content.slice(0, 200),
        tokens,
        canExpand: this.canExpand(memory),
        coldStorageUri: memory.coldStorageUri,
        importance: memory.importance,
        source: this.guessSource(memory),
        metadata: memory.metadata,
      });
    }

    return items;
  }

  expandSingle(id: string, targetLevel: RetrievalLevel): PyramidItem | null {
    const memory = this.memoryStore.get(id);
    if (!memory) return null;

    if (this.config.lazyLoadColdStorage && memory.coldStorageUri && targetLevel === RetrievalLevel.EVIDENCE) {
      return this.loadFromColdStorage(id, targetLevel);
    }

    const content = this.extractContentAtLevel(memory, targetLevel);
    const tokens = this.tokenEstimator(content);

    return {
      id: memory.id,
      level: targetLevel,
      content,
      summary: memory.summary || content.slice(0, 200),
      tokens,
      canExpand: this.canExpand(memory),
      coldStorageUri: memory.coldStorageUri,
      importance: memory.importance,
      source: this.guessSource(memory),
      metadata: memory.metadata,
    };
  }

  private loadFromColdStorage(id: string, targetLevel: RetrievalLevel): PyramidItem | null {
    const uri = this.coldStorageIndex.get(id);
    if (!uri) return null;

    const memory = this.memoryStore.get(id);
    if (!memory) return null;

    return {
      id: memory.id,
      level: targetLevel,
      content: `[Cold storage content loaded from ${uri}]`,
      summary: memory.summary || '',
      tokens: 0,
      canExpand: false,
      coldStorageUri: uri,
      importance: memory.importance,
      source: this.guessSource(memory),
      metadata: memory.metadata,
    };
  }

  private determineLevel(memory: MemoryUnit, score: number): RetrievalLevel {
    if (score > 0.9) {
      return RetrievalLevel.METADATA;
    }
    if (score > this.config.expansionThreshold) {
      return RetrievalLevel.SUMMARY;
    }
    return RetrievalLevel.DETAILS;
  }

  private extractContentAtLevel(memory: MemoryUnit, level: RetrievalLevel): string {
    switch (level) {
      case RetrievalLevel.SUMMARY:
        return memory.summary || memory.content.slice(0, 200);

      case RetrievalLevel.METADATA:
        return `${memory.summary || memory.content}\n\nTags: ${memory.metadata.tags.join(', ')}`;

      case RetrievalLevel.DETAILS:
        return memory.content;

      case RetrievalLevel.EVIDENCE:
        const parts = [memory.content];
        if (memory.metadata.sessionId) {
          parts.push(`\nSession: ${memory.metadata.sessionId}`);
        }
        if (memory.metadata.agentId) {
          parts.push(`\nAgent: ${memory.metadata.agentId}`);
        }
        parts.push(`\nTags: ${memory.metadata.tags.join(', ')}`);
        parts.push(`\nImportance: ${memory.importance.toFixed(2)}`);
        return parts.join('\n');

      default:
        return memory.content;
    }
  }

  private calculateRelevanceScore(query: string, memory: MemoryUnit): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = memory.content.toLowerCase();
    const summaryLower = (memory.summary || '').toLowerCase();

    let termMatches = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) termMatches++;
      if (summaryLower.includes(term)) termMatches += 0.5;
    }

    const termScore = termMatches / queryTerms.length;
    const importanceScore = memory.importance;
    const tagScore = memory.metadata.tags.some(tag =>
      queryTerms.some(term => tag.toLowerCase().includes(term))
    ) ? 0.3 : 0;

    return Math.min(1, termScore * 0.5 + importanceScore * 0.3 + tagScore);
  }

  private calculateExpansionRecommendation(score: number): number | undefined {
    if (score >= this.config.expansionThreshold && score < 0.95) {
      return score;
    }
    return undefined;
  }

  private canExpand(memory: MemoryUnit): boolean {
    return memory.type !== 'text' || (memory.content.length > 500);
  }

  private guessSource(memory: MemoryUnit): 'episodic' | 'semantic' | 'working' | 'project' {
    if (memory.metadata.sessionId) return 'episodic';
    if (memory.metadata.tags.includes('fact') || memory.metadata.tags.includes('preference')) return 'semantic';
    if (memory.metadata.tags.includes('working') || memory.metadata.tags.includes('context')) return 'working';
    return 'project';
  }

  private estimateMaxTokens(level: RetrievalLevel): number {
    switch (level) {
      case RetrievalLevel.SUMMARY:
        return 500;
      case RetrievalLevel.METADATA:
        return 800;
      case RetrievalLevel.DETAILS:
        return 1500;
      case RetrievalLevel.EVIDENCE:
        return 3000;
      default:
        return 1000;
    }
  }

  getStats(): {
    totalMemories: number;
    coldStorageItems: number;
    byType: Record<string, number>;
    byLevel: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byLevel: Record<string, number> = {};

    for (const memory of this.memoryStore.values()) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;

      const level = this.determineLevel(memory, 0.5);
      byLevel[level] = (byLevel[level] || 0) + 1;
    }

    return {
      totalMemories: this.memoryStore.size,
      coldStorageItems: this.coldStorageIndex.size,
      byType,
      byLevel,
    };
  }

  clear(): void {
    this.memoryStore.clear();
    this.coldStorageIndex.clear();
  }
}

export function createPyramidRetriever(
  config?: Partial<PyramidConfig>,
  tokenEstimator?: (text: string) => number
): PyramidRetriever {
  return new PyramidRetriever(config, tokenEstimator);
}

export const DEFAULT_PYRAMID_CONFIG: PyramidConfig = {
  defaultTopK: 10,
  expansionThreshold: 0.85,
  maxExpansionItems: 5,
  tokenEstimateRatio: 0.25,
  lazyLoadColdStorage: true,
};
