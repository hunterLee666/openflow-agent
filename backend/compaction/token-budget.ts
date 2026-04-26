import type {
  TokenBudgetConfig,
  MemoryPriority,
  ContextBundle,
  ContextSegment,
  TokenEstimate,
  BudgetAllocationStats,
} from "./types.js";

export class TokenBudgetInjector {
  private config: TokenBudgetConfig;
  private tokenizer: (text: string) => number;

  constructor(config?: Partial<TokenBudgetConfig>, tokenizer?: (text: string) => number) {
    this.config = {
      maxTokens: config?.maxTokens ?? 2000,
      reservedTokens: config?.reservedTokens ?? 200,
      priorityWeights: config?.priorityWeights ?? {
        critical: 1.0,
        high: 0.8,
        medium: 0.5,
        low: 0.2,
      },
      enableCompression: config?.enableCompression ?? true,
      compressionRatio: config?.compressionRatio ?? 0.7,
      fallbackToSummary: config?.fallbackToSummary ?? true,
    };

    this.tokenizer = tokenizer ?? this.defaultTokenCount;
  }

  private defaultTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  setMaxTokens(maxTokens: number): void {
    this.config.maxTokens = maxTokens;
  }

  getAvailableBudget(): number {
    return this.config.maxTokens - this.config.reservedTokens;
  }

  estimateTokens(text: string): TokenEstimate {
    return {
      text,
      tokens: this.tokenizer(text),
      charCount: text.length,
    };
  }

  buildContext(
    query: string,
    segments: ContextSegment[],
    options?: {
      maxTokens?: number;
      preserveOrder?: boolean;
    }
  ): ContextBundle {
    const maxTokens = options?.maxTokens ?? this.getAvailableBudget();

    const sorted = [...segments].sort((a, b) => {
      const weightA = this.config.priorityWeights[a.priority] ?? 0.5;
      const weightB = this.config.priorityWeights[b.priority] ?? 0.5;
      const effectiveA = a.importance * weightA;
      const effectiveB = b.importance * weightB;
      return effectiveB - effectiveA;
    });

    const selected: ContextSegment[] = [];
    let totalTokens = 0;

    for (const segment of sorted) {
      if (totalTokens + segment.tokens > maxTokens) {
        if (segment.canExpand && segment.summary && this.config.fallbackToSummary) {
          const summaryTokens = this.tokenizer(segment.summary);
          if (totalTokens + summaryTokens <= maxTokens) {
            selected.push({
              ...segment,
              content: segment.summary,
              tokens: summaryTokens,
            });
            totalTokens += summaryTokens;
          }
        }
        continue;
      }

      selected.push(segment);
      totalTokens += segment.tokens;
    }

    if (!options?.preserveOrder) {
      selected.sort((a, b) => {
        const sourceOrder: Record<string, number> = { episodic: 0, semantic: 1, working: 2, project: 3, observation: 4 };
        return (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5);
      });
    }

    const renderedContent = this.render(selected);

    return {
      query,
      segments: selected,
      totalTokens,
      maxTokens,
      hitRate: segments.length > 0 ? selected.length / segments.length : 0,
      renderedContent,
    };
  }

  render(segments: ContextSegment[]): string {
    if (segments.length === 0) {
      return "";
    }

    const parts: string[] = [];
    let currentSource: string | null = null;

    for (const segment of segments) {
      if (segment.source !== currentSource) {
        if (parts.length > 0) {
          parts.push("");
        }
        parts.push(`[${segment.source.toUpperCase()} #${segment.id.slice(0, 8)}]`);
        currentSource = segment.source;
      }

      parts.push(segment.content);
    }

    return parts.join("\n");
  }

  compress(segments: ContextSegment[]): ContextSegment[] {
    if (!this.config.enableCompression) {
      return segments;
    }

    return segments.map((segment) => {
      if (segment.tokens <= 50) {
        return segment;
      }

      const targetTokens = Math.floor(segment.tokens * this.config.compressionRatio);
      const compressed = this.smartCompress(segment.content, targetTokens);

      return {
        ...segment,
        content: compressed,
        tokens: this.tokenizer(compressed),
      };
    });
  }

  private smartCompress(text: string, targetTokens: number): string {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    if (sentences.length <= 3) {
      return text;
    }

    const words = text.split(/\s+/);
    const avgWordTokens = this.tokenizer(text) / words.length;
    const targetWords = Math.floor(targetTokens / avgWordTokens);

    if (targetWords >= words.length) {
      return text;
    }

    const keepCount = Math.floor(targetWords * 0.7);
    const keepWords = words.slice(0, keepCount);

    const ellipsisPoints = sentences.filter((s) => {
      const sentenceWords = s.trim().split(/\s+/);
      return sentenceWords.some((w) => keepWords.includes(w));
    });

    if (ellipsisPoints.length > 0) {
      return ellipsisPoints.join(". ").trim() + "...";
    }

    return keepWords.join(" ") + "...";
  }

  getAllocationStats(segments: ContextSegment[]): BudgetAllocationStats {
    const bySource: Record<string, { count: number; tokens: number; percent: number }> = {};
    const byPriority: Record<MemoryPriority, { count: number; tokens: number; percent: number }> = {
      critical: { count: 0, tokens: 0, percent: 0 },
      high: { count: 0, tokens: 0, percent: 0 },
      medium: { count: 0, tokens: 0, percent: 0 },
      low: { count: 0, tokens: 0, percent: 0 },
    };

    let totalTokens = 0;

    for (const segment of segments) {
      totalTokens += segment.tokens;

      if (!bySource[segment.source]) {
        bySource[segment.source] = { count: 0, tokens: 0, percent: 0 };
      }
      bySource[segment.source].count++;
      bySource[segment.source].tokens += segment.tokens;

      byPriority[segment.priority].count++;
      byPriority[segment.priority].tokens += segment.tokens;
    }

    const maxTokens = this.getAvailableBudget();

    for (const source of Object.keys(bySource)) {
      bySource[source].percent = (bySource[source].tokens / maxTokens) * 100;
    }

    for (const priority of Object.keys(byPriority) as MemoryPriority[]) {
      byPriority[priority].percent = (byPriority[priority].tokens / maxTokens) * 100;
    }

    return {
      bySource,
      byPriority,
      totalTokens,
      maxTokens,
      utilization: (totalTokens / maxTokens) * 100,
    };
  }

  splitByBudget(segments: ContextSegment[]): { primary: ContextSegment[]; overflow: ContextSegment[] } {
    const maxTokens = this.getAvailableBudget();
    const primary: ContextSegment[] = [];
    const overflow: ContextSegment[] = [];
    let totalTokens = 0;

    for (const segment of segments) {
      if (totalTokens + segment.tokens <= maxTokens) {
        primary.push(segment);
        totalTokens += segment.tokens;
      } else {
        overflow.push(segment);
      }
    }

    return { primary, overflow };
  }
}

export function createTokenBudgetInjector(
  config?: Partial<TokenBudgetConfig>,
  tokenizer?: (text: string) => number
): TokenBudgetInjector {
  return new TokenBudgetInjector(config, tokenizer);
}

export const DEFAULT_TOKEN_BUDGET_CONFIG: TokenBudgetConfig = {
  maxTokens: 2000,
  reservedTokens: 200,
  priorityWeights: {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.2,
  },
  enableCompression: true,
  compressionRatio: 0.7,
  fallbackToSummary: true,
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateTokensGPT(text: string): number {
  const tokens = text.split(/\s+/).length;
  return Math.ceil(tokens * 1.3);
}
