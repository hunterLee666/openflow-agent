import type { PromptCache, CacheEconomics } from "./types.js";

export class DefaultPromptCache implements PromptCache {
  private cache = new Map<string, string>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;
  private savedTokens = 0;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.hits++;
      this.savedTokens += value.length / 4; // Rough estimate
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, value);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  computeKey(messages: unknown[]): string {
    const str = JSON.stringify(messages);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `cache_${Math.abs(hash)}`;
  }

  getEconomics(): CacheEconomics {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    const estimatedSavingsUsd = this.savedTokens * 0.000003; // Rough estimate

    return {
      hitRate,
      savedTokens: Math.floor(this.savedTokens),
      estimatedSavingsUsd,
      report: () => {
        return `Cache Economics:
- Hit rate: ${(hitRate * 100).toFixed(1)}%
- Saved tokens: ${Math.floor(this.savedTokens)}
- Estimated savings: $${estimatedSavingsUsd.toFixed(4)}`;
      },
    };
  }
}
