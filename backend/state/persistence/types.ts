export interface PersistenceStrategy {
  name: string;
  priority: number;
  shouldPersist: (key: string, value: unknown, metadata?: Record<string, unknown>) => boolean;
  serialize: (value: unknown) => string;
  deserialize: (data: string) => unknown;
}

export interface PersistenceConfig {
  strategies: PersistenceStrategy[];
  defaultStrategy: string;
  maxSizeBytes?: number;
  compression?: boolean;
  encryption?: boolean;
}

export interface PersistedEntry {
  key: string;
  value: unknown;
  strategy: string;
  timestamp: Date;
  size: number;
  checksum?: string;
}

export interface StorageBackend {
  read(key: string): string | null;
  write(key: string, data: string): void;
  delete(key: string): void;
  keys(): string[];
  exists(key: string): boolean;
  size(key: string): number;
}

export interface CachePolicy {
  maxEntries?: number;
  maxSizeBytes?: number;
  ttlMs?: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
}

export interface RetentionPolicy {
  maxAge?: number;
  maxVersions?: number;
  archiveAfter?: number;
}

export interface PersistenceMetrics {
  totalEntries: number;
  totalSizeBytes: number;
  hitRate: number;
  evictionCount: number;
  strategyUsage: Map<string, number>;
}