import { HNSWIndex, HNSWConfig, SearchResult, DEFAULT_HNSW_CONFIG } from "./hnsw-index.js";
import { FileSystemStorage, StorageBackend } from "./hnsw-storage.js";
import { DistanceMetric } from "./hnsw-metrics.js";
import { existsSync, mkdirSync } from "node:fs";

export type { DistanceMetric as HNSWMetric } from "./hnsw-metrics.js";

export interface HNSWConfig {
  dimensions: number;
  M: number;
  efConstruction: number;
  efSearch: number;
  metric: DistanceMetric;
  storagePath: string;
  maxVectorsPerShard: number;
  maxLoadedShards: number;
}

export interface HNSWEntry {
  id: string;
  vector: number[] | Float32Array;
  metadata?: Record<string, unknown>;
}

export interface HNSWSearchResult {
  id: string;
  distance: number;
  metadata?: Record<string, unknown>;
}

export interface HNSWStats {
  totalVectors: number;
  dimensions: number;
  metric: DistanceMetric;
  memoryUsage: number;
}

const DEFAULT_CONFIG: HNSWConfig = {
  dimensions: 384,
  M: 16,
  efConstruction: 200,
  efSearch: 50,
  metric: "cosine",
  storagePath: ".openflow/memory/hnsw",
  maxVectorsPerShard: 100_000,
  maxLoadedShards: 4,
};

export class HNSWVectorIndex {
  private config: HNSWConfig;
  private index: HNSWIndex | null = null;
  private storage: StorageBackend | null = null;
  private metadataMap = new Map<string, Record<string, unknown>>();
  private initialized = false;

  constructor(config?: Partial<HNSWConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    this.index = new HNSWIndex({
      dimensions: this.config.dimensions,
      M: this.config.M,
      efConstruction: this.config.efConstruction,
      efSearch: this.config.efSearch,
      metric: this.config.metric,
    });

    if (this.config.storagePath) {
      if (!existsSync(this.config.storagePath)) {
        mkdirSync(this.config.storagePath, { recursive: true });
      }
      this.storage = new FileSystemStorage(this.config.storagePath);
      await this.loadFromStorage();
    }

    this.initialized = true;
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.storage || !this.index) return;

    const files = await this.storage.list();
    if (files.length === 0) return;

    const mainFile = files.find((f) => f === "index") || files[0];
    const data = await this.storage.read(mainFile);
    if (!data) return;

    try {
      const json = JSON.parse(new TextDecoder().decode(data));
      this.index = HNSWIndex.deserialize(json);
    } catch {
      // Ignore deserialization errors, start fresh
    }
  }

  async insert(entry: HNSWEntry): Promise<void> {
    if (!this.index || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    const vector = entry.vector instanceof Float32Array
      ? entry.vector
      : new Float32Array(entry.vector);

    this.index.insert(entry.id, vector);

    if (entry.metadata) {
      this.metadataMap.set(entry.id, entry.metadata);
    }
  }

  async batchInsert(entries: HNSWEntry[]): Promise<void> {
    if (!this.index || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    for (const entry of entries) {
      const vector = entry.vector instanceof Float32Array
        ? entry.vector
        : new Float32Array(entry.vector);

      this.index.insert(entry.id, vector);

      if (entry.metadata) {
        this.metadataMap.set(entry.id, entry.metadata);
      }
    }
  }

  async search(
    queryVector: number[] | Float32Array,
    topK = 10,
    options?: {
      efSearch?: number;
      filter?: (id: string) => boolean;
    }
  ): Promise<HNSWSearchResult[]> {
    if (!this.index || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    const vector = queryVector instanceof Float32Array
      ? queryVector
      : new Float32Array(queryVector);

    const results = this.index.search(
      vector,
      topK,
      options?.efSearch,
      options?.filter
    );

    return results.map((result) => ({
      id: result.id,
      distance: result.distance,
      metadata: this.metadataMap.get(result.id),
    }));
  }

  async delete(id: string): Promise<boolean> {
    if (!this.index || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    this.index.delete(id);
    this.metadataMap.delete(id);
    return true;
  }

  async count(): Promise<number> {
    if (!this.index || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    return this.index.size;
  }

  async getStats(): Promise<HNSWStats> {
    const count = await this.count();

    return {
      totalVectors: count,
      dimensions: this.config.dimensions,
      metric: this.config.metric,
      memoryUsage: this.index?.memoryUsage() || 0,
    };
  }

  async flush(): Promise<void> {
    if (!this.index || !this.storage || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    const data = this.index.serialize();
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    await this.storage.write("index", bytes);
  }

  async close(): Promise<void> {
    if (this.index && this.initialized) {
      await this.flush();
      this.index = null;
      this.initialized = false;
    }
  }

  has(id: string): boolean {
    return this.index?.has(id) || false;
  }

  getMetadata(id: string): Record<string, unknown> | undefined {
    return this.metadataMap.get(id);
  }
}

export function createHNSWVectorIndex(config?: Partial<HNSWConfig>): HNSWVectorIndex {
  return new HNSWVectorIndex(config);
}

export { FileSystemStorage, InMemoryStorage } from "./hnsw-storage.js";
export type { StorageBackend } from "./hnsw-storage.js";
