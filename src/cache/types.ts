export interface PromptCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  invalidate(key: string): void;
  computeKey(messages: unknown[]): string;
}

export interface CacheEconomics {
  hitRate: number;
  savedTokens: number;
  estimatedSavingsUsd: number;
  report(): string;
}
