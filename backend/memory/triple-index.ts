import type { HNSWVectorIndex } from "./hnsw-vector-index.js";
import { z } from "zod";

export const VectorIndexEntrySchema = z.object({
  id: z.string(),
  embedding: z.array(z.number()),
  metadata: z.record(z.string(), z.unknown()),
});

export type VectorIndexEntry = z.infer<typeof VectorIndexEntrySchema>;

export const BM25IndexEntrySchema = z.object({
  id: z.string(),
  terms: z.map(z.string(), z.number()),
  content: z.string(),
});

export type BM25IndexEntry = z.infer<typeof BM25IndexEntrySchema>;

export const MetadataFilterSchema = z.object({
  entities: z.array(z.string()).optional(),
  timeRange: z.object({ start: z.string(), end: z.string() }).optional(),
  sourceType: z.string().optional(),
  minSalience: z.number().optional(),
});

export type MetadataFilter = z.infer<typeof MetadataFilterSchema>;

export const SearchResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export type VectorStorageBackend = "memory" | "hnsw";

export const VectorIndexConfigSchema = z.object({
  backend: z.enum(["memory", "hnsw"]),
  hnswIndex: z.custom<HNSWVectorIndex>().optional(),
});

export type VectorIndexConfig = z.infer<typeof VectorIndexConfigSchema>;

const DEFAULT_VECTOR_CONFIG: VectorIndexConfig = {
  backend: "memory",
};

export class VectorIndex {
  private entries: Map<string, VectorIndexEntry> = new Map();
  private config: VectorIndexConfig;
  private hnswIndex?: HNSWVectorIndex;

  constructor(config?: VectorIndexConfig) {
    this.config = { ...DEFAULT_VECTOR_CONFIG, ...config };
    this.hnswIndex = this.config.hnswIndex;
  }

  async add(entry: VectorIndexEntry): Promise<void> {
    this.entries.set(entry.id, entry);

    if (this.config.backend === "hnsw" && this.hnswIndex) {
      await this.hnswIndex.insert({
        id: entry.id,
        vector: entry.embedding,
        metadata: entry.metadata,
      });
    }
  }

  async search(queryEmbedding: number[], topK = 10): Promise<SearchResult[]> {
    if (this.config.backend === "hnsw" && this.hnswIndex) {
      const hnswResults = await this.hnswIndex.search(queryEmbedding, topK);
      return hnswResults.map((r) => ({
        id: r.id,
        score: 1 - r.distance,
        content: String(r.metadata?.content || ""),
        metadata: r.metadata || {},
      }));
    }

    const results: SearchResult[] = [];

    for (const [id, entry] of this.entries) {
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({
        id,
        score: similarity,
        content: String(entry.metadata.content || ""),
        metadata: entry.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async delete(id: string): Promise<boolean> {
    if (this.config.backend === "hnsw" && this.hnswIndex) {
      await this.hnswIndex.delete(id);
    }
    return this.entries.delete(id);
  }

  size(): number {
    return this.entries.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export class BM25Index {
  private entries: Map<string, BM25IndexEntry> = new Map();
  private documentCount = 0;
  private avgDocLength = 0;
  private totalTerms = 0;

  private readonly k1 = 1.5;
  private readonly b = 0.75;

  async add(entry: BM25IndexEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    this.documentCount++;
    this.totalTerms += entry.terms.size;
    this.avgDocLength = this.totalTerms / this.documentCount;
  }

  async search(query: string, topK = 10): Promise<SearchResult[]> {
    const queryTerms = this.tokenize(query);
    const results: Map<string, number> = new Map();

    for (const term of queryTerms) {
      const df = this.getDocumentFrequency(term);

      for (const [id, entry] of this.entries) {
        const tf = entry.terms.get(term) || 0;
        if (tf === 0) continue;

        const idf = Math.log((this.documentCount - df + 0.5) / (df + 0.5) + 1);
        const docLength = entry.terms.size;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        const score = idf * (numerator / denominator);
        results.set(id, (results.get(id) || 0) + score);
      }
    }

    const sortedResults: SearchResult[] = [];
    for (const [id, score] of results) {
      const entry = this.entries.get(id);
      if (entry) {
        sortedResults.push({
          id,
          score,
          content: entry.content,
          metadata: {},
        });
      }
    }

    sortedResults.sort((a, b) => b.score - a.score);
    return sortedResults.slice(0, topK);
  }

  async delete(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (entry) {
      this.totalTerms -= entry.terms.size;
      this.documentCount--;
      this.avgDocLength = this.documentCount > 0 ? this.totalTerms / this.documentCount : 0;
    }
    return this.entries.delete(id);
  }

  size(): number {
    return this.entries.size;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private getDocumentFrequency(term: string): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.terms.has(term)) {
        count++;
      }
    }
    return count;
  }
}

export class MetadataIndex {
  private entries: Map<string, Record<string, unknown>> = new Map();

  async add(id: string, metadata: Record<string, unknown>): Promise<void> {
    this.entries.set(id, metadata);
  }

  async filter(filter: MetadataFilter): Promise<string[]> {
    const results: string[] = [];

    for (const [id, metadata] of this.entries) {
      if (this.matchesFilter(metadata, filter)) {
        results.push(id);
      }
    }

    return results;
  }

  async delete(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }

  size(): number {
    return this.entries.size;
  }

  private matchesFilter(metadata: Record<string, unknown>, filter: MetadataFilter): boolean {
    if (filter.entities && filter.entities.length > 0) {
      const entities = metadata.entities as string[] | undefined;
      if (!entities || !filter.entities.some((e) => entities.includes(e))) {
        return false;
      }
    }

    if (filter.timeRange) {
      const timestamp = metadata.timestamp as string | undefined;
      if (!timestamp || timestamp < filter.timeRange.start || timestamp > filter.timeRange.end) {
        return false;
      }
    }

    if (filter.sourceType) {
      if (metadata.sourceType !== filter.sourceType) {
        return false;
      }
    }

    if (filter.minSalience !== undefined) {
      const salience = metadata.salience as number | undefined;
      if (salience === undefined || salience < filter.minSalience) {
        return false;
      }
    }

    return true;
  }
}

export interface TripleIndexConfig {
  vectorConfig?: VectorIndexConfig;
}

export class TripleIndex {
  private semanticIndex: VectorIndex;
  private lexicalIndex: BM25Index;
  private symbolicIndex: MetadataIndex;

  constructor(config?: TripleIndexConfig) {
    this.semanticIndex = new VectorIndex(config?.vectorConfig);
    this.lexicalIndex = new BM25Index();
    this.symbolicIndex = new MetadataIndex();
  }

  async addSemanticEntry(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void> {
    await this.semanticIndex.add({ id, embedding, metadata });
  }

  async addLexicalEntry(id: string, content: string): Promise<void> {
    const terms = this.extractTerms(content);
    await this.lexicalIndex.add({ id, terms, content });
  }

  async addSymbolicEntry(id: string, metadata: Record<string, unknown>): Promise<void> {
    await this.symbolicIndex.add(id, metadata);
  }

  async hybridSearch(
    query: string,
    queryEmbedding?: number[],
    filters?: MetadataFilter,
    topK = 10
  ): Promise<SearchResult[]> {
    const semanticResults = queryEmbedding
      ? await this.semanticIndex.search(queryEmbedding, topK * 2)
      : [];

    const lexicalResults = await this.lexicalIndex.search(query, topK * 2);

    const symbolicIds = filters ? await this.symbolicIndex.filter(filters) : null;

    const combinedScores = new Map<string, number>();

    for (const result of semanticResults) {
      if (symbolicIds && !symbolicIds.includes(result.id)) continue;
      combinedScores.set(result.id, (combinedScores.get(result.id) || 0) + result.score * 0.5);
    }

    for (const result of lexicalResults) {
      if (symbolicIds && !symbolicIds.includes(result.id)) continue;
      combinedScores.set(result.id, (combinedScores.get(result.id) || 0) + result.score * 0.3);
    }

    if (symbolicIds) {
      for (const id of symbolicIds) {
        combinedScores.set(id, (combinedScores.get(id) || 0) + 0.2);
      }
    }

    const sortedResults: SearchResult[] = [];
    for (const [id, score] of combinedScores) {
      const semanticResult = semanticResults.find((r) => r.id === id);
      const lexicalResult = lexicalResults.find((r) => r.id === id);

      sortedResults.push({
        id,
        score,
        content: semanticResult?.content || lexicalResult?.content || '',
        metadata: semanticResult?.metadata || lexicalResult?.metadata || {},
      });
    }

    sortedResults.sort((a, b) => b.score - a.score);
    return sortedResults.slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    await this.semanticIndex.delete(id);
    await this.lexicalIndex.delete(id);
    await this.symbolicIndex.delete(id);
  }

  getStats(): { semantic: number; lexical: number; symbolic: number } {
    return {
      semantic: this.semanticIndex.size(),
      lexical: this.lexicalIndex.size(),
      symbolic: this.symbolicIndex.size(),
    };
  }

  private extractTerms(content: string): Map<string, number> {
    const terms = new Map<string, number>();
    const tokens = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    for (const token of tokens) {
      terms.set(token, (terms.get(token) || 0) + 1);
    }

    return terms;
  }
}

export function createTripleIndex(): TripleIndex {
  return new TripleIndex();
}
