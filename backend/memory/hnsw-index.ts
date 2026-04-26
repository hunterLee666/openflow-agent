import { DistanceMetric, createDistanceFunction } from "./hnsw-metrics.js";
import { z } from "zod";

export interface HNSWNode {
  id: string;
  vector: Float32Array;
  neighbors: Map<number, string[]>;
  deleted: boolean;
}

export const HNSWConfigSchema = z.object({
  dimensions: z.number(),
  M: z.number(),
  efConstruction: z.number(),
  efSearch: z.number(),
  metric: z.enum(["euclidean", "cosine", "inner_product"]),
  seed: z.number(),
});

export type HNSWConfig = z.infer<typeof HNSWConfigSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),
  distance: z.number(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const DEFAULT_HNSW_CONFIG: HNSWConfig = {
  dimensions: 384,
  M: 16,
  efConstruction: 200,
  efSearch: 50,
  metric: "cosine",
  seed: 42,
};

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }
}

export class HNSWIndex {
  private config: HNSWConfig;
  private nodes: Map<string, HNSWNode>;
  private entryPoint: string | null;
  private maxLevel: number;
  private distanceFunction: (a: Float32Array, b: Float32Array) => number;
  private random: SeededRandom;

  constructor(config: Partial<HNSWConfig> = {}) {
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };
    this.nodes = new Map();
    this.entryPoint = null;
    this.maxLevel = 0;
    this.distanceFunction = createDistanceFunction(this.config.metric);
    this.random = new SeededRandom(this.config.seed);
  }

  get size(): number {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (!node.deleted) count++;
    }
    return count;
  }

  private getRandomLevel(): number {
    const ml = 1 / Math.log(this.config.M);
    let level = 0;
    while (this.random.next() < ml && level < 32) {
      level++;
    }
    return level;
  }

  private selectNeighbors(
    queryVector: Float32Array,
    candidates: Array<{ id: string; distance: number }>,
    M: number
  ): string[] {
    candidates.sort((a, b) => a.distance - b.distance);

    const selected: string[] = [];
    const selectedVectors = new Set<string>();

    for (const candidate of candidates) {
      if (selected.length >= M) break;

      const node = this.nodes.get(candidate.id);
      if (!node || node.deleted) continue;

      let isDiverse = true;
      for (const selectedId of selectedVectors) {
        const selectedNode = this.nodes.get(selectedId);
        if (selectedNode) {
          const dist = this.distanceFunction(node.vector, selectedNode.vector);
          if (dist < candidate.distance) {
            isDiverse = false;
            break;
          }
        }
      }

      if (isDiverse) {
        selected.push(candidate.id);
        selectedVectors.add(candidate.id);
      }
    }

    return selected;
  }

  private searchLayer(
    queryVector: Float32Array,
    entryNodes: string[],
    ef: number,
    level: number
  ): Array<{ id: string; distance: number }> {
    const visited = new Set<string>();
    const candidates: Array<{ id: string; distance: number }> = [];
    const result: Array<{ id: string; distance: number }> = [];

    for (const entryId of entryNodes) {
      const entryNode = this.nodes.get(entryId);
      if (entryNode && !entryNode.deleted) {
        const dist = this.distanceFunction(queryVector, entryNode.vector);
        candidates.push({ id: entryId, distance: dist });
        visited.add(entryId);
        result.push({ id: entryId, distance: dist });
      }
    }

    result.sort((a, b) => a.distance - b.distance);

    while (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      const closest = candidates.shift()!;

      if (result.length >= ef && closest.distance > result[result.length - 1].distance) {
        break;
      }

      const node = this.nodes.get(closest.id);
      if (!node || node.deleted) continue;

      const neighbors = node.neighbors.get(level) || [];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode || neighborNode.deleted) continue;

        const dist = this.distanceFunction(queryVector, neighborNode.vector);

        if (result.length < ef || dist < result[result.length - 1].distance) {
          candidates.push({ id: neighborId, distance: dist });
          result.push({ id: neighborId, distance: dist });
          result.sort((a, b) => a.distance - b.distance);
          if (result.length > ef) {
            result.pop();
          }
        }
      }
    }

    return result;
  }

  insert(id: string, vector: number[] | Float32Array): void {
    const vec = vector instanceof Float32Array ? vector : new Float32Array(vector);

    if (vec.length !== this.config.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.config.dimensions}, got ${vec.length}`);
    }

    if (this.nodes.has(id)) {
      const existing = this.nodes.get(id)!;
      existing.vector = vec;
      existing.deleted = false;
      return;
    }

    const level = this.getRandomLevel();
    const node: HNSWNode = {
      id,
      vector: vec,
      neighbors: new Map(),
      deleted: false,
    };

    for (let l = 0; l <= level; l++) {
      node.neighbors.set(l, []);
    }

    this.nodes.set(id, node);

    if (!this.entryPoint) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let currentEntryPoint = this.entryPoint;

    for (let l = this.maxLevel; l > level; l--) {
      const neighbors = [currentEntryPoint];
      const result = this.searchLayer(vec, neighbors, 1, l);
      if (result.length > 0) {
        currentEntryPoint = result[0].id;
      }
    }

    for (let l = Math.min(this.maxLevel, level); l >= 0; l--) {
      const neighbors = [currentEntryPoint];
      const ef = l === 0 ? this.config.efConstruction : this.config.efConstruction;
      const result = this.searchLayer(vec, neighbors, ef, l);

      const selected = this.selectNeighbors(vec, result, this.config.M);

      for (const neighborId of selected) {
        const neighborNode = this.nodes.get(neighborId);
        if (neighborNode && !neighborNode.deleted) {
          const neighborNeighbors = neighborNode.neighbors.get(l) || [];
          if (!neighborNeighbors.includes(id)) {
            neighborNeighbors.push(id);
            neighborNode.neighbors.set(l, neighborNeighbors);

            if (neighborNeighbors.length > this.config.M * 2) {
              const pruned = this.pruneNeighbors(neighborNode.vector, neighborNeighbors, this.config.M);
              neighborNode.neighbors.set(l, pruned);
            }
          }
        }
      }

      node.neighbors.set(l, selected);

      currentEntryPoint = result[0]?.id || currentEntryPoint;
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }
  }

  private pruneNeighbors(
    queryVector: Float32Array,
    neighbors: string[],
    M: number
  ): string[] {
    const candidates: Array<{ id: string; distance: number }> = [];

    for (const neighborId of neighbors) {
      const node = this.nodes.get(neighborId);
      if (node && !node.deleted) {
        const dist = this.distanceFunction(queryVector, node.vector);
        candidates.push({ id: neighborId, distance: dist });
      }
    }

    return this.selectNeighbors(queryVector, candidates, M);
  }

  search(
    queryVector: number[] | Float32Array,
    topK: number,
    efSearch?: number,
    filter?: (id: string) => boolean
  ): SearchResult[] {
    if (!this.entryPoint) return [];

    const vec = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
    const ef = efSearch || this.config.efSearch;

    let currentEntryPoint = this.entryPoint;

    for (let l = this.maxLevel; l > 0; l--) {
      const result = this.searchLayer(vec, [currentEntryPoint], 1, l);
      if (result.length > 0) {
        currentEntryPoint = result[0].id;
      }
    }

    const result = this.searchLayer(vec, [currentEntryPoint], ef, 0);

    result.sort((a, b) => a.distance - b.distance);

    const filtered = result.filter((r) => {
      const node = this.nodes.get(r.id);
      return node && !node.deleted && (!filter || filter(r.id));
    });

    return filtered.slice(0, topK);
  }

  delete(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.deleted = true;
    }
  }

  has(id: string): boolean {
    const node = this.nodes.get(id);
    return node !== undefined && !node.deleted;
  }

  getVector(id: string): Float32Array | null {
    const node = this.nodes.get(id);
    return node && !node.deleted ? node.vector : null;
  }

  memoryUsage(): number {
    let bytes = 0;
    for (const node of this.nodes.values()) {
      if (!node.deleted) {
        bytes += node.vector.byteLength;
        for (const neighbors of node.neighbors.values()) {
          bytes += neighbors.length * 50;
        }
      }
    }
    return bytes;
  }

  compact(): HNSWIndex {
    const newIndex = new HNSWIndex(this.config);

    for (const [id, node] of this.nodes.entries()) {
      if (!node.deleted) {
        newIndex.insert(id, node.vector);
      }
    }

    return newIndex;
  }

  shrinkToFit(): void {
    const deletedIds: string[] = [];
    for (const [id, node] of this.nodes.entries()) {
      if (node.deleted) {
        deletedIds.push(id);
      }
    }
    for (const id of deletedIds) {
      this.nodes.delete(id);
    }
  }

  serialize(): unknown {
    const data: Record<string, unknown> = {
      config: this.config,
      entryPoint: this.entryPoint,
      maxLevel: this.maxLevel,
      nodes: [],
    };

    for (const [id, node] of this.nodes.entries()) {
      if (!node.deleted) {
        (data.nodes as Array<Record<string, unknown>>).push({
          id,
          vector: Array.from(node.vector),
          neighbors: Object.fromEntries(node.neighbors),
        });
      }
    }

    return data;
  }

  static deserialize(data: unknown): HNSWIndex {
    const obj = data as Record<string, unknown>;
    const config = obj.config as Partial<HNSWConfig>;
    const index = new HNSWIndex(config);

    index.entryPoint = obj.entryPoint as string | null;
    index.maxLevel = obj.maxLevel as number;

    const nodes = obj.nodes as Array<Record<string, unknown>>;
    for (const nodeData of nodes) {
      const id = nodeData.id as string;
      const vector = new Float32Array(nodeData.vector as number[]);
      const neighbors = new Map<number, string[]>(
        Object.entries(nodeData.neighbors as Record<string, string[]>).map(([k, v]) => [parseInt(k), v])
      );

      index.nodes.set(id, {
        id,
        vector,
        neighbors,
        deleted: false,
      });
    }

    return index;
  }
}
