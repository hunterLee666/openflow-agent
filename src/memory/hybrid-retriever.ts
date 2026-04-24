import type {
  HybridRetrievalConfig,
  RetrievalItem,
  HybridRetrievalResult,
} from "./types.js";

export interface BM25Document {
  id: string;
  content: string;
  terms: Map<string, number>;
  length: number;
}

export interface BM25Config {
  k1: number;
  b: number;
  avgDocLength: number;
}

export class BM25Index {
  private documents: Map<string, BM25Document> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private documentCount: number = 0;
  private avgDocLength: number = 0;
  private idf: Map<string, number> = new Map();
  private config: BM25Config;

  constructor(config?: Partial<BM25Config>) {
    this.config = {
      k1: config?.k1 ?? 1.5,
      b: config?.b ?? 0.75,
      avgDocLength: config?.avgDocLength ?? 100,
    };
  }

  addDocument(id: string, content: string): void {
    const terms = this.tokenize(content);
    const termFreqs = new Map<string, number>();

    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
    }

    const doc: BM25Document = {
      id,
      content,
      terms: termFreqs,
      length: terms.length,
    };

    this.documents.set(id, doc);

    for (const term of termFreqs.keys()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)!.add(id);
    }

    this.documentCount++;
    this.updateAvgDocLength();
    this.computeIDF();
  }

  removeDocument(id: string): void {
    const doc = this.documents.get(id);
    if (!doc) return;

    for (const term of doc.terms.keys()) {
      const posting = this.invertedIndex.get(term);
      if (posting) {
        posting.delete(id);
        if (posting.size === 0) {
          this.invertedIndex.delete(term);
        }
      }
    }

    this.documents.delete(id);
    this.documentCount--;
    this.updateAvgDocLength();
    this.computeIDF();
  }

  search(query: string, topK: number = 10): Map<string, number> {
    const queryTerms = this.tokenize(query);
    const scores = new Map<string, number>();

    for (const [docId, doc] of this.documents) {
      let score = 0;

      for (const queryTerm of queryTerms) {
        if (!doc.terms.has(queryTerm)) continue;

        const tf = doc.terms.get(queryTerm)!;
        const idf = this.idf.get(queryTerm) || 0;

        const numerator = tf * (this.config.k1 + 1);
        const denominator = tf + this.config.k1 * (1 - this.config.b + this.config.b * (doc.length / this.avgDocLength));
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.set(docId, score);
      }
    }

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return new Map(sorted);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private updateAvgDocLength(): void {
    if (this.documentCount === 0) {
      this.avgDocLength = 0;
      return;
    }

    let totalLength = 0;
    for (const doc of this.documents.values()) {
      totalLength += doc.length;
    }
    this.avgDocLength = totalLength / this.documentCount;
    this.config.avgDocLength = this.avgDocLength;
  }

  private computeIDF(): void {
    for (const [term, posting] of this.invertedIndex) {
      const df = posting.size;
      const idf = Math.log((this.documentCount - df + 0.5) / (df + 0.5) + 1);
      this.idf.set(term, Math.max(0, idf));
    }
  }

  getStats(): { documentCount: number; vocabularySize: number; avgDocLength: number } {
    return {
      documentCount: this.documentCount,
      vocabularySize: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }
}

export class VectorStore {
  private vectors: Map<string, number[]> = new Map();
  private dimension: number = 0;

  constructor(dimension: number = 384) {
    this.dimension = dimension;
  }

  addVector(id: string, embedding: number[]): void {
    if (embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`);
    }
    this.vectors.set(id, [...embedding]);
  }

  removeVector(id: string): boolean {
    return this.vectors.delete(id);
  }

  search(queryEmbedding: number[], topK: number = 10): Map<string, number> {
    const scores = new Map<string, number>();

    for (const [id, embedding] of this.vectors) {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      scores.set(id, similarity);
    }

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return new Map(sorted);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }

  getDimension(): number {
    return this.dimension;
  }

  getVectorCount(): number {
    return this.vectors.size;
  }
}

export class HybridRetriever {
  private config: HybridRetrievalConfig;
  private bm25: BM25Index;
  private vectorStore: VectorStore;

  constructor(config?: Partial<HybridRetrievalConfig>) {
    this.config = {
      bm25Weight: config?.bm25Weight ?? 0.4,
      vectorWeight: config?.vectorWeight ?? 0.6,
      rrfK: config?.rrfK ?? 60,
      minScoreThreshold: config?.minScoreThreshold ?? 0.01,
      maxResults: config?.maxResults ?? 20,
      enableReranking: config?.enableReranking ?? true,
      rerankTopK: config?.rerankTopK ?? 10,
    };

    this.bm25 = new BM25Index();
    this.vectorStore = new VectorStore();
  }

  addDocument(id: string, content: string, embedding?: number[]): void {
    this.bm25.addDocument(id, content);
    if (embedding) {
      this.vectorStore.addVector(id, embedding);
    }
  }

  removeDocument(id: string): void {
    this.bm25.removeDocument(id);
    this.vectorStore.removeVector(id);
  }

  async search(
    query: string,
    queryEmbedding?: number[],
    options?: { topK?: number; hybridMode?: boolean }
  ): Promise<HybridRetrievalResult> {
    const startTime = Date.now();
    const topK = options?.topK ?? this.config.maxResults;
    const hybridMode = options?.hybridMode ?? true;

    const bm25Scores = this.bm25.search(query, topK * 2);
    let vectorScores = new Map<string, number>();

    if (queryEmbedding) {
      vectorScores = this.vectorStore.search(queryEmbedding, topK * 2);
    }

    let combinedScores: Map<string, number>;

    if (hybridMode && queryEmbedding && vectorScores.size > 0) {
      combinedScores = this.combineScoresRRF(bm25Scores, vectorScores);
    } else if (vectorScores.size > 0) {
      combinedScores = vectorScores;
    } else {
      combinedScores = bm25Scores;
    }

    const items: RetrievalItem[] = [];
    const sortedIds = Array.from(combinedScores.entries())
      .filter(([_, score]) => score >= this.config.minScoreThreshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    for (const [id, score] of sortedIds) {
      const source = this.getScoreSource(id, bm25Scores, vectorScores);
      items.push({
        id,
        content: '',
        score,
        source,
      });
    }

    return {
      query,
      items,
      bm25Scores,
      vectorScores,
      combinedScores,
      totalTokens: items.reduce((sum, item) => sum + (item.content.length / 4), 0),
      retrievalTime: Date.now() - startTime,
    };
  }

  private combineScoresRRF(bm25Scores: Map<string, number>, vectorScores: Map<string, number>): Map<string, number> {
    const combined = new Map<string, number>();
    const allIds = new Set([...bm25Scores.keys(), ...vectorScores.keys()]);

    for (const id of allIds) {
      let bm25Rank = 0;
      let vectorRank = 0;

      const sortedBm25 = Array.from(bm25Scores.entries()).sort((a, b) => b[1] - a[1]);
      const sortedVector = Array.from(vectorScores.entries()).sort((a, b) => b[1] - a[1]);

      const bm25Index = sortedBm25.findIndex(([docId]) => docId === id);
      if (bm25Index >= 0) bm25Rank = bm25Index + 1;

      const vectorIndex = sortedVector.findIndex(([docId]) => docId === id);
      if (vectorIndex >= 0) vectorRank = vectorIndex + 1;

      const rrfScore = this.config.bm25Weight / (this.config.rrfK + bm25Rank) +
                       this.config.vectorWeight / (this.config.rrfK + vectorRank);

      combined.set(id, rrfScore);
    }

    return combined;
  }

  private getScoreSource(id: string, bm25: Map<string, number>, vector: Map<string, number>): 'bm25' | 'vector' | 'hybrid' {
    const hasBm25 = bm25.has(id);
    const hasVector = vector.has(id);

    if (hasBm25 && hasVector) return 'hybrid';
    if (hasBm25) return 'bm25';
    return 'vector';
  }

  rerank(items: RetrievalItem[], query: string): RetrievalItem[] {
    if (!this.config.enableReranking) {
      return items;
    }

    return items
      .sort((a, b) => {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const aMatches = this.countTermMatches(a.content, queryTerms);
        const bMatches = this.countTermMatches(b.content, queryTerms);
        return bMatches - aMatches;
      })
      .slice(0, this.config.rerankTopK);
  }

  private countTermMatches(content: string, terms: string[]): number {
    const lowerContent = content.toLowerCase();
    return terms.filter(term => lowerContent.includes(term)).length;
  }

  getStats(): {
    bm25: { documentCount: number; vocabularySize: number };
    vector: { dimension: number; vectorCount: number };
  } {
    const bm25Stats = this.bm25.getStats();
    return {
      bm25: {
        documentCount: bm25Stats.documentCount,
        vocabularySize: bm25Stats.vocabularySize,
      },
      vector: {
        dimension: this.vectorStore.getDimension(),
        vectorCount: this.vectorStore.getVectorCount(),
      },
    };
  }
}

export function createHybridRetriever(config?: Partial<HybridRetrievalConfig>): HybridRetriever {
  return new HybridRetriever(config);
}

export const DEFAULT_HYBRID_CONFIG: HybridRetrievalConfig = {
  bm25Weight: 0.4,
  vectorWeight: 0.6,
  rrfK: 60,
  minScoreThreshold: 0.01,
  maxResults: 20,
  enableReranking: true,
  rerankTopK: 10,
};
