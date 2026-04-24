export interface SubAgentCache {
  get(key: string): SubAgentCacheEntry | undefined;
  set(key: string, entry: SubAgentCacheEntry): void;
  invalidate(prefix: string): void;
  clear(): void;
}

export interface SubAgentCacheEntry {
  key: string;
  result: unknown;
  timestamp: number;
  ttl: number;
  forkPrefix: string;
}

export interface AgentForkKey {
  parentId: string;
  task: string;
  contextHash: string;
}

export interface RecursionGuard {
  check(depth: number): boolean;
  getCurrentDepth(): number;
  enter(): void;
  exit(): void;
}
