import type { Message } from "../types/index.js";
import type { PromptCache, CacheEconomics, CacheStrategy, CachedContent } from "./types.js";
import { DEFAULT_CACHE_STRATEGY, hashString } from "./types.js";

export class DefaultPromptCache implements PromptCache {
  private cache = new Map<string, string>();
  private prefixCache = new Map<string, CachedContent>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;
  private savedTokens = 0;
  private strategy: CacheStrategy;

  constructor(maxSize = 50, strategy: CacheStrategy = DEFAULT_CACHE_STRATEGY) {
    this.maxSize = maxSize;
    this.strategy = strategy;
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.hits++;
      this.savedTokens += value.length / 4;
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

  reset(): void {
    this.cache.clear();
    this.prefixCache.clear();
    this.hits = 0;
    this.misses = 0;
    this.savedTokens = 0;
  }

  computeKey(messages: unknown[]): string {
    const str = JSON.stringify(messages);
    return `cache_${hashString(str)}`;
  }

  getEconomics(): CacheEconomics {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    const estimatedSavingsUsd = this.savedTokens * 0.000003;

    return {
      hitRate,
      savedTokens: Math.floor(this.savedTokens),
      estimatedSavingsUsd,
      totalRequests: total,
      cacheHits: this.hits,
      cacheMisses: this.misses,
      report: () => {
        return `Cache Economics:
- Hit rate: ${(hitRate * 100).toFixed(1)}%
- Total requests: ${total}
- Cache hits: ${this.hits}
- Cache misses: ${this.misses}
- Saved tokens: ${Math.floor(this.savedTokens)}
- Estimated savings: $${estimatedSavingsUsd.toFixed(4)}`;
      },
    };
  }

  cachePrefixMessage(message: Message): void {
    if (!this.strategy.shouldCache(message)) return;

    const key = this.strategy.getCacheKey(message);
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

    const cached: CachedContent = {
      prefix: content,
      hash: hashString(content),
      category: message.cacheControl?.category || this.inferCategory(message),
      tokenEstimate: this.estimateTokens(content),
      lastUsed: Date.now(),
      useCount: 0,
    };

    this.prefixCache.set(key, cached);
  }

  getPrefixEntry(key: string): CachedContent | undefined {
    const entry = this.prefixCache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      entry.useCount++;
    }
    return entry;
  }

  buildPrefixCache(messages: Message[]): { cached: string[]; uncached: Message[] } {
    const cached: string[] = [];
    const uncached: Message[] = [];

    for (const msg of messages) {
      if (this.strategy.shouldCache(msg)) {
        const key = this.strategy.getCacheKey(msg);
        const entry = this.getPrefixEntry(key);

        if (entry) {
          cached.push(entry.prefix);
        } else {
          this.cachePrefixMessage(msg);
          const content = typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
          cached.push(content);
        }
      } else {
        uncached.push(msg);
      }
    }

    return { cached, uncached };
  }

  invalidatePrefixCache(pattern?: string): void {
    if (!pattern) {
      this.prefixCache.clear();
      return;
    }

    for (const key of this.prefixCache.keys()) {
      if (key.includes(pattern)) {
        this.prefixCache.delete(key);
      }
    }
  }

  private inferCategory(message: Message): CachedContent["category"] {
    if (message.role === "system") return "system";
    if (message.cacheControl?.category) return message.cacheControl.category;
    return "context";
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export function createPrefixCacheKey(messages: Message[]): string {
  const prefixMessages = messages.filter((m) =>
    m.role === "system" || m.cacheControl?.type === "hidden"
  );

  const parts = prefixMessages.map((m) => {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return `${m.role}:${hashString(content)}`;
  });

  return `prefix_${hashString(parts.join("|"))}`;
}

export function shouldUseCacheControl(message: Message): boolean {
  return message.role === "system" || message.cacheControl?.type === "hidden";
}
