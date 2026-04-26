import { z } from "zod";

export const TokenCountSchema = z.object({
  text: z.string(),
  tokenCount: z.number(),
  characterCount: z.number(),
  wordCount: z.number(),
});

export type TokenCount = z.infer<typeof TokenCountSchema>;

export const CompressionStatsSchema = z.object({
  originalTokens: z.number(),
  compressedTokens: z.number(),
  compressionRatio: z.number(),
  tokenSavings: z.number(),
});

export type CompressionStats = z.infer<typeof CompressionStatsSchema>;

export const TokenBudgetSchema = z.object({
  maxTokens: z.number(),
  usedTokens: z.number(),
  remainingTokens: z.number(),
  utilizationRate: z.number(),
});

export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

export const OptimizedMemorySchema = z.object({
  content: z.string(),
  tokenCount: z.number(),
  importance: z.number(),
  source: z.string(),
  timestamp: z.string(),
});

export type OptimizedMemory = z.infer<typeof OptimizedMemorySchema>;

export const TokenOptimizerConfigSchema = z.object({
  maxContextTokens: z.number(),
  maxMemoryTokens: z.number(),
  maxSingleMemoryTokens: z.number(),
  compressionThreshold: z.number(),
  enableSmartTruncation: z.boolean(),
  enablePriorityRanking: z.boolean(),
});

export type TokenOptimizerConfig = z.infer<typeof TokenOptimizerConfigSchema>;

const DEFAULT_CONFIG: TokenOptimizerConfig = {
  maxContextTokens: 4000,
  maxMemoryTokens: 2000,
  maxSingleMemoryTokens: 500,
  compressionThreshold: 0.7,
  enableSmartTruncation: true,
  enablePriorityRanking: true,
};

export class TokenOptimizer {
  private config: TokenOptimizerConfig;

  constructor(config?: Partial<TokenOptimizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  countTokens(text: string): TokenCount {
    const characterCount = text.length;
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

    const tokenCount = this.estimateTokens(text);

    return {
      text,
      tokenCount,
      characterCount,
      wordCount,
    };
  }

  calculateCompressionStats(original: string, compressed: string): CompressionStats {
    const originalTokens = this.estimateTokens(original);
    const compressedTokens = this.estimateTokens(compressed);

    const compressionRatio = originalTokens > 0 ? compressedTokens / originalTokens : 1;
    const tokenSavings = originalTokens - compressedTokens;

    return {
      originalTokens,
      compressedTokens,
      compressionRatio,
      tokenSavings,
    };
  }

  optimizeMemories(
    memories: Array<{ content: string; importance: number; source: string; timestamp: string }>,
    budget?: number
  ): OptimizedMemory[] {
    const maxTokens = budget || this.config.maxMemoryTokens;
    const optimized: OptimizedMemory[] = [];
    let usedTokens = 0;

    const sortedMemories = this.config.enablePriorityRanking
      ? this.rankByPriority(memories)
      : memories;

    for (const memory of sortedMemories) {
      const tokenCount = this.estimateTokens(memory.content);

      if (usedTokens + tokenCount > maxTokens) {
        if (this.config.enableSmartTruncation) {
          const remainingTokens = maxTokens - usedTokens;
          if (remainingTokens > 50) {
            const truncated = this.smartTruncate(memory.content, remainingTokens);
            const truncatedTokens = this.estimateTokens(truncated);

            optimized.push({
              content: truncated,
              tokenCount: truncatedTokens,
              importance: memory.importance,
              source: memory.source,
              timestamp: memory.timestamp,
            });

            usedTokens += truncatedTokens;
          }
        }
        break;
      }

      optimized.push({
        content: memory.content,
        tokenCount,
        importance: memory.importance,
        source: memory.source,
        timestamp: memory.timestamp,
      });

      usedTokens += tokenCount;
    }

    return optimized;
  }

  buildContextWindow(
    memories: Array<{ content: string; importance: number; source: string; timestamp: string }>,
    query?: string,
    budget?: number
  ): { context: string; tokenCount: number; budget: TokenBudget } {
    const maxTokens = budget || this.config.maxContextTokens;
    const queryTokens = query ? this.estimateTokens(query) : 0;

    const availableTokens = maxTokens - queryTokens - 100;

    const optimized = this.optimizeMemories(memories, availableTokens);

    const contextParts: string[] = [];
    let totalTokens = queryTokens;

    if (query) {
      contextParts.push(`Query: ${query}`);
      totalTokens += queryTokens;
    }

    contextParts.push("Relevant memories:");
    totalTokens += 2;

    for (const memory of optimized) {
      contextParts.push(`[${memory.source}] ${memory.content}`);
      totalTokens += memory.tokenCount + 3;
    }

    const context = contextParts.join("\n");

    return {
      context,
      tokenCount: totalTokens,
      budget: {
        maxTokens,
        usedTokens: totalTokens,
        remainingTokens: Math.max(0, maxTokens - totalTokens),
        utilizationRate: totalTokens / maxTokens,
      },
    };
  }

  compressMemory(content: string, targetTokens?: number): { compressed: string; stats: CompressionStats } {
    const target = targetTokens || this.config.maxSingleMemoryTokens;
    const originalTokens = this.estimateTokens(content);

    if (originalTokens <= target) {
      return {
        compressed: content,
        stats: {
          originalTokens,
          compressedTokens: originalTokens,
          compressionRatio: 1,
          tokenSavings: 0,
        },
      };
    }

    const compressed = this.smartTruncate(content, target);
    const compressedTokens = this.estimateTokens(compressed);

    return {
      compressed,
      stats: {
        originalTokens,
        compressedTokens,
        compressionRatio: compressedTokens / originalTokens,
        tokenSavings: originalTokens - compressedTokens,
      },
    };
  }

  estimateContextForMemories(memories: Array<{ content: string }>): {
    totalTokens: number;
    averageTokens: number;
    maxTokens: number;
    minTokens: number;
  } {
    const tokenCounts = memories.map((m) => this.estimateTokens(m.content));

    const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);
    const averageTokens = memories.length > 0 ? totalTokens / memories.length : 0;
    const maxTokens = Math.max(...tokenCounts, 0);
    const minTokens = Math.min(...tokenCounts, 0);

    return {
      totalTokens,
      averageTokens,
      maxTokens,
      minTokens,
    };
  }

  suggestMemoryCount(query: string, memories: Array<{ content: string }>): number {
    const queryTokens = this.estimateTokens(query);
    const availableTokens = this.config.maxContextTokens - queryTokens - 200;

    const averageMemoryTokens = this.estimateContextForMemories(memories).averageTokens;

    if (averageMemoryTokens === 0) return 0;

    const suggestedCount = Math.floor(availableTokens / averageMemoryTokens);

    return Math.max(1, Math.min(suggestedCount, memories.length));
  }

  private rankByPriority(
    memories: Array<{ content: string; importance: number; source: string; timestamp: string }>
  ): Array<{ content: string; importance: number; source: string; timestamp: string }> {
    return memories
      .map((memory) => ({
        ...memory,
        tokenEfficiency: memory.importance / Math.max(1, this.estimateTokens(memory.content)),
      }))
      .sort((a, b) => {
        const scoreA = a.importance * 0.6 + a.tokenEfficiency * 100 * 0.4;
        const scoreB = b.importance * 0.6 + b.tokenEfficiency * 100 * 0.4;
        return scoreB - scoreA;
      });
  }

  private smartTruncate(text: string, maxTokens: number): string {
    const sentences = text.split(/(?<=[.!?])\s+/);

    const result: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens <= maxTokens) {
        result.push(sentence);
        currentTokens += sentenceTokens;
      } else {
        break;
      }
    }

    if (result.length === 0 && sentences.length > 0) {
      const words = sentences[0].split(/\s+/);
      const truncated: string[] = [];
      let wordTokens = 0;

      for (const word of words) {
        const wordTokenCount = this.estimateTokens(word);
        if (wordTokens + wordTokenCount <= maxTokens) {
          truncated.push(word);
          wordTokens += wordTokenCount;
        } else {
          break;
        }
      }

      return truncated.join(" ") + "...";
    }

    return result.join(" ") + (result.length < sentences.length ? "..." : "");
  }

  private estimateTokens(text: unknown): number {
    const strText = String(text || "");
    if (strText.length === 0) return 0;

    const words = strText.split(/\s+/).filter((w) => w.length > 0).length;

    const chineseChars = (strText.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = words - Math.floor(chineseChars / 2);

    const tokenCount = Math.ceil(englishWords * 1.3) + Math.ceil(chineseChars * 0.5);

    const punctuation = (strText.match(/[^\w\s\u4e00-\u9fff]/g) || []).length;
    const punctuationTokens = Math.ceil(punctuation * 0.3);

    return Math.max(1, tokenCount + punctuationTokens);
  }
}

export function createTokenOptimizer(config?: Partial<TokenOptimizerConfig>): TokenOptimizer {
  return new TokenOptimizer(config);
}
