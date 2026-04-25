import { VectorStore, FileSystemStorage } from "persistent-hnsw";

export type HNSWMetric = "euclidean" | "cosine" | "inner_product";

export interface HNSWConfig {
  dimensions: number;
  M: number;
  efConstruction: number;
  efSearch: number;
  metric: HNSWMetric;
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
  metric: HNSWMetric;
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
  private store: VectorStore | null = null;
  private metadataMap = new Map<string, Record<string, unknown>>();
  private initialized = false;

  constructor(config?: Partial<HNSWConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    this.store = VectorStore.create({
      hnsw: {
        dimensions: this.config.dimensions,
        M: this.config.M,
        efConstruction: this.config.efConstruction,
        efSearch: this.config.efSearch,
        metric: this.config.metric,
      },
      sharding: {
        maxVectorsPerShard: this.config.maxVectorsPerShard,
        maxLoadedShards: this.config.maxLoadedShards,
      },
      storage: new FileSystemStorage(this.config.storagePath),
    });

    this.initialized = true;
  }

  async insert(entry: HNSWEntry): Promise<void> {
    if (!this.store || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    const vector = entry.vector instanceof Float32Array
      ? entry.vector
      : new Float32Array(entry.vector);

    await this.store.insert({
      id: entry.id,
      vector,
    });

    if (entry.metadata) {
      this.metadataMap.set(entry.id, entry.metadata);
    }
  }

  async batchInsert(entries: HNSWEntry[]): Promise<void> {
    if (!this.store || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    const items = entries.map((entry) => ({
      id: entry.id,
      vector: entry.vector instanceof Float32Array
        ? entry.vector
        : new Float32Array(entry.vector),
    }));

    await this.store.insert(items);

    for (const entry of entries) {
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
    if (!this.store || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    const vector = queryVector instanceof Float32Array
      ? queryVector
      : new Float32Array(queryVector);

    const results = await this.store.search(vector, topK, {
      efSearch: options?.efSearch ?? this.config.efSearch,
      filter: options?.filter,
      includeVectors: false,
    });

    return results.map((result) => ({
      id: result.id,
      distance: result.distance,
      metadata: this.metadataMap.get(result.id),
    }));
  }

  async delete(id: string): Promise<boolean> {
    if (!this.store || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    await this.store.delete(id);
    this.metadataMap.delete(id);
    return true;
  }

  async count(): Promise<number> {
    if (!this.store || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    return this.store.shardManager.totalVectors;
  }

  async getStats(): Promise<HNSWStats> {
    const count = await this.count();

    return {
      totalVectors: count,
      dimensions: this.config.dimensions,
      metric: this.config.metric,
      memoryUsage: 0,
    };
  }

  async flush(): Promise<void> {
    if (!this.store || !this.initialized) {
      throw new Error("HNSW index not initialized");
    }

    await this.store.flush();
  }

  async close(): Promise<void> {
    if (this.store && this.initialized) {
      await this.store.flush();
      await this.store.close();
      this.store = null;
      this.initialized = false;
    }
  }

  has(id: string): boolean {
    return this.metadataMap.has(id);
  }

  getMetadata(id: string): Record<string, unknown> | undefined {
    return this.metadataMap.get(id);
  }
}

export function createHNSWVectorIndex(config?: Partial<HNSWConfig>): HNSWVectorIndex {
  return new HNSWVectorIndex(config);
}
