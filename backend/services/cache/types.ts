import type { Message } from "../../types/index.js";

export interface PromptCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  invalidate(key: string): void;
  computeKey(messages: unknown[]): string;
  getEconomics(): CacheEconomics;
  reset(): void;
}

export interface CacheEconomics {
  hitRate: number;
  savedTokens: number;
  estimatedSavingsUsd: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  report(): string;
}

export interface CachedContent {
  prefix: string;
  hash: string;
  category: "system" | "user" | "context" | "memory";
  tokenEstimate: number;
  lastUsed: number;
  useCount: number;
}

export interface PrefixCacheEntry {
  content: string;
  hash: string;
  category: CachedContent["category"];
  tokenEstimate: number;
  cachedAt: number;
}

export interface CacheStrategy {
  shouldCache(message: Message): boolean;
  getCacheKey(message: Message): string;
  getPriority(message: Message): number;
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export const DEFAULT_CACHE_STRATEGY: CacheStrategy = {
  shouldCache(message: Message): boolean {
    if (message.role === "system") return true;
    if (message.cacheControl?.type === "hidden") return true;
    if (message.cacheControl?.type === "ephemeral") return false;
    return false;
  },

  getCacheKey(message: Message): string {
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);
    return `prefix_${message.role}_${hashString(content)}`;
  },

  getPriority(message: Message): number {
    switch (message.role) {
      case "system": return 100;
      case "user": return message.cacheControl?.category === "context" ? 80 : 50;
      default: return 0;
    }
  },
};
