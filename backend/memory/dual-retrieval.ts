import type { MemoryCard } from "./types.js";

export interface RetrievalResult {
  cards: MemoryCard[];
  scores: Map<string, number>;
  totalCandidates: number;
  retrievalTime: number;
}

export interface DualModelRetrievalConfig {
  maxInjections: number;
  scoreThreshold: number;
  fastModelProvider?: string;
  fastModelName?: string;
}

const DEFAULT_CONFIG: DualModelRetrievalConfig = {
  maxInjections: 5,
  scoreThreshold: 0.3,
  fastModelProvider: "anthropic",
  fastModelName: "claude-sonnet-4-20250514",
};

export interface RetrievalCandidate {
  id: string;
  title: string;
  description: string;
  projectScope?: string;
  createdAt?: Date;
  lastAccessedAt?: Date;
  accessCount?: number;
}

export class DualModelRetriever {
  private config: DualModelRetrievalConfig;

  constructor(config: Partial<DualModelRetrievalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async retrieve(
    candidates: RetrievalCandidate[],
    userQuery: string,
    context?: {
      projectPath?: string;
      recentCards?: string[];
    }
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    if (candidates.length === 0) {
      return {
        cards: [],
        scores: new Map(),
        totalCandidates: 0,
        retrievalTime: Date.now() - startTime,
      };
    }

    const recentCardsSet = new Set(context?.recentCards ?? []);
    const filteredCandidates = recentCardsSet.size > 0
      ? candidates.filter((c) => !recentCardsSet.has(c.id))
      : candidates;

    if (filteredCandidates.length === 0) {
      return {
        cards: [],
        scores: new Map(),
        totalCandidates: candidates.length,
        retrievalTime: Date.now() - startTime,
      };
    }

    const scored = await this.fastModelScore(filteredCandidates, userQuery, context);

    const filtered = scored
      .filter((item) => item.score >= this.config.scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxInjections);

    const scores = new Map<string, number>();
    for (const item of scored) {
      scores.set(item.id, item.score);
    }

    const now = new Date();
    const result: RetrievalResult = {
      cards: filtered.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        scope: item.projectScope || "global",
        createdAt: item.createdAt || now,
        updatedAt: now,
        confidence: item.score,
        source: "auto" as const,
        tags: ["retrieved", "dual-model"],
      })),
      scores,
      totalCandidates: candidates.length,
      retrievalTime: Date.now() - startTime,
    };

    return result;
  }

  private async fastModelScore(
    candidates: RetrievalCandidate[],
    userQuery: string,
    context?: {
      projectPath?: string;
      recentCards?: string[];
    }
  ): Promise<Array<RetrievalCandidate & { score: number }>> {
    const scored = candidates.map((candidate) => {
      const score = this.calculateRelevanceScore(candidate, userQuery, context);
      return { ...candidate, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  private calculateRelevanceScore(
    candidate: RetrievalCandidate,
    query: string,
    context?: {
      projectPath?: string;
      recentCards?: string[];
    }
  ): number {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);
    const titleLower = candidate.title.toLowerCase();
    const descLower = candidate.description.toLowerCase();

    let score = 0;

    const titleTerms = titleLower.split(/\s+/).filter(Boolean);
    for (const term of queryTerms) {
      if (titleTerms.includes(term)) {
        score += 0.4;
      } else if (titleLower.includes(term)) {
        score += 0.2;
      }
    }

    for (const term of queryTerms) {
      if (descLower.includes(term)) {
        score += 0.15;
      }
    }

    if (context?.projectPath && candidate.projectScope) {
      if (candidate.projectScope === context.projectPath) {
        score += 0.2;
      } else if (!candidate.projectScope.includes(context.projectPath)) {
        score -= 0.3;
      }
    }

    if (context?.recentCards?.includes(candidate.id)) {
      score -= 0.5;
    }

    if (candidate.accessCount !== undefined) {
      const accessBonus = Math.min(candidate.accessCount * 0.01, 0.15);
      score += accessBonus;
    }

    if (candidate.createdAt) {
      const age = Date.now() - candidate.createdAt.getTime();
      const days = age / (1000 * 60 * 60 * 24);
      if (days < 7) {
        score += 0.1;
      } else if (days > 90) {
        score -= 0.1;
      }
    }

    const titleWordCount = titleTerms.length;
    if (titleWordCount >= 2 && titleWordCount <= 6) {
      score += 0.05;
    }

    return Math.max(0, Math.min(score, 1));
  }

  formatInjections(cards: MemoryCard[]): string {
    if (cards.length === 0) {
      return "";
    }

    const lines = ["## Retrieved memories (max 5)"];

    for (const card of cards) {
      lines.push(`### ${card.title}`);
      lines.push(card.description);
      lines.push(`(ref: ${card.id})`);
      lines.push("");
    }

    return lines.join("\n\n");
  }

  getConfig(): DualModelRetrievalConfig {
    return { ...this.config };
  }

  setMaxInjections(max: number): void {
    this.config.maxInjections = Math.max(1, Math.min(max, 10));
  }

  setScoreThreshold(threshold: number): void {
    this.config.scoreThreshold = Math.max(0, Math.min(threshold, 1));
  }
}

export const createDualModelRetriever = (
  config?: Partial<DualModelRetrievalConfig>
): DualModelRetriever => {
  return new DualModelRetriever(config);
};

export class HybridRetriever {
  private dualRetriever: DualModelRetriever;
  private semanticRetriever: HybridSemanticRetriever;

  constructor(config?: Partial<DualModelRetrievalConfig>) {
    this.dualRetriever = new DualModelRetriever(config);
    this.semanticRetriever = new HybridSemanticRetriever();
  }

  async retrieveWithHybrid(
    candidates: RetrievalCandidate[],
    userQuery: string,
    context?: {
      projectPath?: string;
      recentCards?: string[];
    }
  ): Promise<RetrievalResult> {
    const dualResult = await this.dualRetriever.retrieve(candidates, userQuery, context);

    const semanticBoost = await this.semanticRetriever.boost(candidates, userQuery);

    for (const card of dualResult.cards) {
      const boost = semanticBoost.get(card.id);
      if (boost) {
        const currentScore = dualResult.scores.get(card.id) || 0;
        dualResult.scores.set(card.id, Math.min(1, currentScore + boost));
      }
    }

    dualResult.cards.sort((a, b) => {
      const scoreA = dualResult.scores.get(a.id) || 0;
      const scoreB = dualResult.scores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    dualResult.cards = dualResult.cards.slice(0, this.dualRetriever.getConfig().maxInjections);

    return dualResult;
  }

  formatInjections(cards: MemoryCard[]): string {
    return this.dualRetriever.formatInjections(cards);
  }
}

class HybridSemanticRetriever {
  private keywordIndex: Map<string, Set<string>> = new Map();

  async boost(
    candidates: RetrievalCandidate[],
    query: string
  ): Promise<Map<string, number>> {
    const boosts = new Map<string, number>();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

    this.buildIndex(candidates);

    for (const candidate of candidates) {
      let boost = 0;
      const titleTerms = candidate.title.toLowerCase().split(/\s+/);

      for (const term of queryTerms) {
        if (titleTerms.includes(term)) {
          boost += 0.05;
        }
      }

      if (boost > 0) {
        boosts.set(candidate.id, boost);
      }
    }

    return boosts;
  }

  private buildIndex(candidates: RetrievalCandidate[]): void {
    this.keywordIndex.clear();

    for (const candidate of candidates) {
      const terms = [
        ...candidate.title.toLowerCase().split(/\s+/),
        ...candidate.description.toLowerCase().split(/\s+/),
      ].filter((t) => t.length > 2);

      for (const term of terms) {
        if (!this.keywordIndex.has(term)) {
          this.keywordIndex.set(term, new Set());
        }
        this.keywordIndex.get(term)!.add(candidate.id);
      }
    }
  }
}

export const createHybridRetriever = (
  config?: Partial<DualModelRetrievalConfig>
): HybridRetriever => {
  return new HybridRetriever(config);
};
