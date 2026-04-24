import type { SubAgentCache, SubAgentCacheEntry, RecursionGuard } from "./types.js";

export class DefaultSubAgentCache implements SubAgentCache {
  private cache = new Map<string, SubAgentCacheEntry>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): SubAgentCacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  set(key: string, entry: SubAgentCacheEntry): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, entry);
  }

  invalidate(prefix: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export class DefaultRecursionGuard implements RecursionGuard {
  private depth = 0;
  private maxDepth: number;

  constructor(maxDepth = 3) {
    this.maxDepth = maxDepth;
  }

  check(depth: number): boolean {
    return depth < this.maxDepth;
  }

  getCurrentDepth(): number {
    return this.depth;
  }

  enter(): void {
    this.depth++;
  }

  exit(): void {
    this.depth = Math.max(0, this.depth - 1);
  }
}

export function buildForkKey(parentId: string, task: string, context: Record<string, unknown>): string {
  const contextStr = JSON.stringify(context);
  const hash = simpleHash(contextStr);
  return `${parentId}:${task}:${hash}`;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
