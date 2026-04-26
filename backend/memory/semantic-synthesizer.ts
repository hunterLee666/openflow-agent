import type { MemoryUnit } from './semantic-compressor.js';

export interface SynthesisConfig {
  similarityThreshold: number;
  maxMergeUnits: number;
  enableAutoSynthesis: boolean;
}

const DEFAULT_CONFIG: SynthesisConfig = {
  similarityThreshold: 0.7,
  maxMergeUnits: 5,
  enableAutoSynthesis: true,
};

export class SemanticSynthesizer {
  private config: SynthesisConfig;
  private memoryUnits: Map<string, MemoryUnit> = new Map();

  constructor(config?: Partial<SynthesisConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async addUnit(unit: MemoryUnit): Promise<void> {
    this.memoryUnits.set(unit.id, unit);

    if (this.config.enableAutoSynthesis) {
      await this.synthesizeOnWrite(unit);
    }
  }

  async removeUnit(id: string): Promise<boolean> {
    return this.memoryUnits.delete(id);
  }

  getUnit(id: string): MemoryUnit | undefined {
    return this.memoryUnits.get(id);
  }

  getAllUnits(): MemoryUnit[] {
    return Array.from(this.memoryUnits.values());
  }

  async synthesizeOnWrite(newUnit: MemoryUnit): Promise<void> {
    const similarUnits = this.findSimilarUnits(newUnit);

    if (similarUnits.length > 0) {
      const unitsToMerge = [newUnit, ...similarUnits].slice(0, this.config.maxMergeUnits);
      const synthesized = await this.synthesizeUnits(unitsToMerge);

      await this.removeUnit(newUnit.id);
      for (const unit of similarUnits) {
        await this.removeUnit(unit.id);
      }

      await this.addUnit(synthesized);
    }
  }

  findSimilarUnits(unit: MemoryUnit): MemoryUnit[] {
    const similar: MemoryUnit[] = [];

    for (const existing of this.memoryUnits.values()) {
      if (existing.id === unit.id) continue;

      const similarity = this.calculateSimilarity(unit, existing);
      if (similarity >= this.config.similarityThreshold) {
        similar.push(existing);
      }
    }

    similar.sort((a, b) => {
      const simA = this.calculateSimilarity(unit, a);
      const simB = this.calculateSimilarity(unit, b);
      return simB - simA;
    });

    return similar;
  }

  async synthesizeUnits(units: MemoryUnit[]): Promise<MemoryUnit> {
    if (units.length === 0) {
      throw new Error('Cannot synthesize empty units');
    }

    if (units.length === 1) {
      return units[0];
    }

    const combinedContent = this.mergeContents(units);
    const combinedEntities = this.mergeEntities(units);
    const avgSalience = units.reduce((sum, u) => sum + u.salience, 0) / units.length;
    const latestTimestamp = units.reduce((latest, u) => (u.timestamp > latest ? u.timestamp : latest), units[0].timestamp);

    return {
      id: `synth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: combinedContent,
      entities: combinedEntities,
      timestamp: latestTimestamp,
      salience: Math.min(1, avgSalience + 0.1),
      sourceType: units[0].sourceType,
      metadata: {
        synthesizedFrom: units.map((u) => u.id),
        originalCount: units.length,
      },
    };
  }

  private mergeContents(units: MemoryUnit[]): string {
    const contents = units.map((u) => u.content);

    const sentences = contents.flatMap((c) => c.split(/[.!?]+/).filter((s) => s.trim()));

    const uniqueSentences = this.deduplicateSentences(sentences);

    return uniqueSentences.join('. ').trim() + '.';
  }

  private deduplicateSentences(sentences: string[]): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();

    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase();
      if (!seen.has(normalized)) {
        let isDuplicate = false;

        for (const existing of seen) {
          if (this.isSemanticSimilar(normalized, existing)) {
            isDuplicate = true;
            break;
          }
        }

        if (!isDuplicate) {
          seen.add(normalized);
          unique.push(sentence.trim());
        }
      }
    }

    return unique;
  }

  private isSemanticSimilar(a: string, b: string): boolean {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));

    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    const jaccard = intersection.size / union.size;
    return jaccard >= 0.6;
  }

  private mergeEntities(units: MemoryUnit[]): string[] {
    const allEntities = units.flatMap((u) => u.entities);
    return [...new Set(allEntities)];
  }

  private calculateSimilarity(a: MemoryUnit, b: MemoryUnit): number {
    const contentSimilarity = this.calculateContentSimilarity(a.content, b.content);
    const entityOverlap = this.calculateEntityOverlap(a.entities, b.entities);
    const temporalProximity = this.calculateTemporalProximity(a.timestamp, b.timestamp);

    return contentSimilarity * 0.6 + entityOverlap * 0.25 + temporalProximity * 0.15;
  }

  private calculateContentSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateEntityOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter((e) => setB.has(e)));

    return intersection.size / Math.min(setA.size, setB.size);
  }

  private calculateTemporalProximity(a: string, b: string): number {
    const timeA = new Date(a).getTime();
    const timeB = new Date(b).getTime();
    const diff = Math.abs(timeA - timeB);

    const maxDiff = 7 * 24 * 60 * 60 * 1000; // 7 days
    return Math.max(0, 1 - diff / maxDiff);
  }

  async consolidateAll(): Promise<MemoryUnit[]> {
    const units = this.getAllUnits();
    const clusters = this.clusterUnits(units);

    const synthesized: MemoryUnit[] = [];
    for (const cluster of clusters) {
      if (cluster.length > 1) {
        const merged = await this.synthesizeUnits(cluster);
        synthesized.push(merged);
      } else {
        synthesized.push(cluster[0]);
      }
    }

    return synthesized;
  }

  async consolidateBatch(batchSize: number, similarityThreshold: number): Promise<MemoryUnit[]> {
    const units = this.getAllUnits().slice(0, batchSize);
    const originalThreshold = this.config.similarityThreshold;

    this.config.similarityThreshold = similarityThreshold;

    const clusters = this.clusterUnits(units);
    this.config.similarityThreshold = originalThreshold;

    const synthesized: MemoryUnit[] = [];
    for (const cluster of clusters) {
      if (cluster.length > 1) {
        const merged = await this.synthesizeUnits(cluster);
        synthesized.push(merged);

        for (const unit of cluster) {
          await this.removeUnit(unit.id);
        }
        await this.addUnit(merged);
      }
    }

    return synthesized;
  }

  private clusterUnits(units: MemoryUnit[]): MemoryUnit[][] {
    const clusters: MemoryUnit[][] = [];
    const assigned = new Set<string>();

    for (const unit of units) {
      if (assigned.has(unit.id)) continue;

      const cluster = [unit];
      assigned.add(unit.id);

      for (const other of units) {
        if (assigned.has(other.id)) continue;

        const similarity = this.calculateSimilarity(unit, other);
        if (similarity >= this.config.similarityThreshold) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  getStats(): { totalUnits: number; avgSalience: number; entityCount: number } {
    const units = this.getAllUnits();
    const totalSalience = units.reduce((sum, u) => sum + u.salience, 0);
    const allEntities = new Set(units.flatMap((u) => u.entities));

    return {
      totalUnits: units.length,
      avgSalience: units.length > 0 ? totalSalience / units.length : 0,
      entityCount: allEntities.size,
    };
  }

  clear(): void {
    this.memoryUnits.clear();
  }
}

export function createSemanticSynthesizer(config?: Partial<SynthesisConfig>): SemanticSynthesizer {
  return new SemanticSynthesizer(config);
}
