import type { PersistenceStrategy, PersistenceConfig, PersistedEntry, StorageBackend, PersistenceMetrics } from './types';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync, readdirSync } from 'fs';
import { dirname } from 'path';

export class FileStorageBackend implements StorageBackend {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    try {
      mkdirSync(basePath, { recursive: true });
    } catch {}
  }

  private getFilePath(key: string): string {
    return `${this.basePath}/${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  }

  read(key: string): string | null {
    try {
      const filePath = this.getFilePath(key);
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8');
      }
    } catch {}
    return null;
  }

  write(key: string, data: string): void {
    try {
      const filePath = this.getFilePath(key);
      const dir = dirname(filePath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, data, 'utf-8');
    } catch {}
  }

  delete(key: string): void {
    try {
      const filePath = this.getFilePath(key);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {}
  }

  keys(): string[] {
    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(this.basePath);
      return files
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  exists(key: string): boolean {
    return existsSync(this.getFilePath(key));
  }

  size(key: string): number {
    try {
      const filePath = this.getFilePath(key);
      if (existsSync(filePath)) {
        return statSync(filePath).size;
      }
    } catch {}
    return 0;
  }
}

export class MemoryStorageBackend implements StorageBackend {
  private store: Map<string, string> = new Map();

  read(key: string): string | null {
    return this.store.get(key) || null;
  }

  write(key: string, data: string): void {
    this.store.set(key, data);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  exists(key: string): boolean {
    return this.store.has(key);
  }

  size(key: string): number {
    const value = this.store.get(key);
    return value ? value.length : 0;
  }
}

function simpleChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export class PersistenceManager {
  private readonly config: PersistenceConfig;
  private readonly storage: StorageBackend;
  private strategyMap: Map<string, PersistenceStrategy> = new Map();
  private metrics: PersistenceMetrics;

  constructor(config: PersistenceConfig, storage?: StorageBackend) {
    this.config = config;
    const basePath = process.env.HOME ? `${process.env.HOME}/.openflow/persistence` : '/tmp/openflow-persistence';
    this.storage = storage || new FileStorageBackend(basePath);

    for (const strategy of config.strategies) {
      this.strategyMap.set(strategy.name, strategy);
    }

    this.metrics = {
      totalEntries: 0,
      totalSizeBytes: 0,
      hitRate: 0,
      evictionCount: 0,
      strategyUsage: new Map(),
    };

    this.loadMetrics();
  }

  private loadMetrics(): void {
    const keys = this.storage.keys();
    this.metrics.totalEntries = keys.length;
    let totalSize = 0;
    for (const key of keys) {
      totalSize += this.storage.size(key);
    }
    this.metrics.totalSizeBytes = totalSize;
  }

  async persist(key: string, value: unknown, metadata?: Record<string, unknown>): Promise<boolean> {
    const strategy = this.selectStrategy(key, value, metadata);
    if (!strategy) {
      return false;
    }

    try {
      const serialized = strategy.serialize(value);
      const entry: PersistedEntry = {
        key,
        value: JSON.parse(serialized),
        strategy: strategy.name,
        timestamp: new Date(),
        size: serialized.length,
        checksum: simpleChecksum(serialized),
      };

      const data = JSON.stringify(entry);
      this.storage.write(key, data);

      const usage = this.metrics.strategyUsage.get(strategy.name) || 0;
      this.metrics.strategyUsage.set(strategy.name, usage + 1);

      this.metrics.totalEntries++;
      this.metrics.totalSizeBytes += entry.size;

      if (this.config.maxSizeBytes && this.metrics.totalSizeBytes > this.config.maxSizeBytes) {
        await this.evict();
      }

      return true;
    } catch {
      return false;
    }
  }

  async retrieve(key: string): Promise<unknown | null> {
    try {
      const data = this.storage.read(key);
      if (!data) return null;

      const entry = JSON.parse(data) as PersistedEntry;
      const strategy = this.strategyMap.get(entry.strategy);

      if (!strategy) {
        return null;
      }

      return strategy.deserialize(JSON.stringify(entry.value));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const size = this.storage.size(key);
    this.storage.delete(key);

    if (size > 0) {
      this.metrics.totalEntries--;
      this.metrics.totalSizeBytes -= size;
    }

    return true;
  }

  private selectStrategy(key: string, value: unknown, metadata?: Record<string, unknown>): PersistenceStrategy | null {
    for (const strategy of this.config.strategies.sort((a, b) => b.priority - a.priority)) {
      if (strategy.shouldPersist(key, value, metadata)) {
        return strategy;
      }
    }
    return this.strategyMap.get(this.config.defaultStrategy) || null;
  }

  private async evict(): Promise<void> {
    const keys = this.storage.keys();
    const entries: { key: string; timestamp: Date; size: number }[] = [];

    for (const key of keys) {
      try {
        const data = this.storage.read(key);
        if (data) {
          const entry = JSON.parse(data) as PersistedEntry;
          entries.push({ key, timestamp: new Date(entry.timestamp), size: entry.size });
        }
      } catch {}
    }

    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    while (entries.length > 0 && this.metrics.totalSizeBytes > (this.config.maxSizeBytes || 0) * 0.8) {
      const oldest = entries.shift();
      if (oldest) {
        const size = this.storage.size(oldest.key);
        this.storage.delete(oldest.key);
        this.metrics.totalEntries--;
        this.metrics.totalSizeBytes -= size;
        this.metrics.evictionCount++;
      }
    }
  }

  listKeys(): string[] {
    return this.storage.keys();
  }

  getMetrics(): PersistenceMetrics {
    return { ...this.metrics };
  }
}

export const DEFAULT_STRATEGIES: PersistenceStrategy[] = [
  {
    name: 'always',
    priority: 0,
    shouldPersist: () => true,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  },
  {
    name: 'large_values',
    priority: 1,
    shouldPersist: (_, value) => {
      const serialized = JSON.stringify(value);
      return serialized.length > 1024;
    },
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  },
  {
    name: 'never',
    priority: -1,
    shouldPersist: () => false,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  },
];

export function createPersistenceManager(config?: Partial<PersistenceConfig>): PersistenceManager {
  const fullConfig: PersistenceConfig = {
    strategies: config?.strategies || DEFAULT_STRATEGIES,
    defaultStrategy: config?.defaultStrategy || 'always',
    maxSizeBytes: config?.maxSizeBytes || 100 * 1024 * 1024,
  };

  return new PersistenceManager(fullConfig);
}

export interface StateSnapshot<T = unknown> {
  id: string;
  state: T;
  timestamp: number;
  label?: string;
  checksum?: string;
}

export class FileSystemAdapter {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    try {
      mkdirSync(basePath, { recursive: true });
    } catch {}
  }

  private getFilePath(key: string): string {
    return `${this.basePath}/${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  }

  async read<T>(key: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(key);
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8');
        return JSON.parse(data) as T;
      }
    } catch {}
    return null;
  }

  async write<T>(key: string, data: T): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      const dir = dirname(filePath);
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {}
  }

  async keys(): Promise<string[]> {
    try {
      const files = readdirSync(this.basePath);
      return files
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => f.replace(/\.json$/, ''));
    } catch {}
    return [];
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.getFilePath(key));
  }
}

export class PersistentStateStore<T = unknown> {
  private adapter: FileSystemAdapter;
  private cache: Map<string, T> = new Map();

  constructor(basePath: string) {
    this.adapter = new FileSystemAdapter(basePath);
  }

  async get(key: string): Promise<T | undefined> {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const data = await this.adapter.read<T>(key);
    if (data !== null) {
      this.cache.set(key, data);
      return data;
    }
    return undefined;
  }

  async set(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    await this.adapter.write(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    await this.adapter.delete(key);
  }

  async clear(): Promise<void> {
    const keys = await this.adapter.keys();
    for (const key of keys) {
      await this.delete(key);
    }
  }
}