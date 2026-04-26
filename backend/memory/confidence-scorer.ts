import { z } from "zod";

export const ConfidenceConfigSchema = z.object({
  initialConfidence: z.number(),
  decayRate: z.number(),
  decayHalfLifeDays: z.number(),
  boostOnAccess: z.number(),
  boostOnValidation: z.number(),
  penaltyOnContradiction: z.number(),
  minConfidence: z.number(),
  maxConfidence: z.number(),
});

export type ConfidenceConfig = z.infer<typeof ConfidenceConfigSchema>;

export const ConfidenceScoreSchema = z.object({
  value: z.number(),
  lastAccessed: z.number(),
  lastValidated: z.number(),
  accessCount: z.number(),
  validationCount: z.number(),
  contradictionCount: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

export const ConfidenceFeedbackSchema = z.object({
  type: z.enum(["positive", "negative", "neutral"]),
  strength: z.number().optional(),
  timestamp: z.number().optional(),
});

export type ConfidenceFeedback = z.infer<typeof ConfidenceFeedbackSchema>;

const DEFAULT_CONFIG: ConfidenceConfig = {
  initialConfidence: 0.8,
  decayRate: 0.01,
  decayHalfLifeDays: 30,
  boostOnAccess: 0.02,
  boostOnValidation: 0.05,
  penaltyOnContradiction: 0.15,
  minConfidence: 0.0,
  maxConfidence: 1.0,
};

export class ConfidenceScorer {
  private config: ConfidenceConfig;
  private scores = new Map<string, ConfidenceScore>();

  constructor(config?: Partial<ConfidenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  createScore(id: string, initialConfidence?: number): ConfidenceScore {
    const now = Date.now();
    const score: ConfidenceScore = {
      value: initialConfidence ?? this.config.initialConfidence,
      lastAccessed: now,
      lastValidated: now,
      accessCount: 0,
      validationCount: 0,
      contradictionCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.scores.set(id, score);
    return { ...score };
  }

  getScore(id: string): ConfidenceScore | undefined {
    const score = this.scores.get(id);
    if (!score) return undefined;

    return { ...score };
  }

  applyTimeDecay(id: string, currentTime?: number): number | undefined {
    const score = this.scores.get(id);
    if (!score) return undefined;

    const now = currentTime ?? Date.now();
    const ageInDays = (now - score.updatedAt) / (1000 * 60 * 60 * 24);

    const decayFactor = Math.exp(-this.config.decayRate * ageInDays);
    const decayedValue = score.value * decayFactor;

    score.value = this.clamp(decayedValue);
    score.updatedAt = now;

    return score.value;
  }

  applyDecayAll(currentTime?: number): void {
    for (const id of this.scores.keys()) {
      this.applyTimeDecay(id, currentTime);
    }
  }

  recordAccess(id: string): number | undefined {
    const score = this.scores.get(id);
    if (!score) return undefined;

    score.accessCount++;
    score.lastAccessed = Date.now();

    const boosted = score.value + this.config.boostOnAccess;
    score.value = this.clamp(boosted);
    score.updatedAt = Date.now();

    return score.value;
  }

  recordValidation(id: string, feedback?: ConfidenceFeedback): number | undefined {
    const score = this.scores.get(id);
    if (!score) return undefined;

    score.validationCount++;
    score.lastValidated = Date.now();

    let adjustment = this.config.boostOnValidation;

    if (feedback) {
      const strength = feedback.strength ?? 1.0;
      switch (feedback.type) {
        case "positive":
          adjustment = this.config.boostOnValidation * strength;
          break;
        case "negative":
          adjustment = -this.config.penaltyOnContradiction * strength;
          score.contradictionCount++;
          break;
        case "neutral":
          adjustment = 0;
          break;
      }
    }

    score.value = this.clamp(score.value + adjustment);
    score.updatedAt = Date.now();

    return score.value;
  }

  recordContradiction(id: string): number | undefined {
    const score = this.scores.get(id);
    if (!score) return undefined;

    score.contradictionCount++;
    score.updatedAt = Date.now();

    const penalty = this.config.penaltyOnContradiction * (1 + score.contradictionCount * 0.1);
    score.value = this.clamp(score.value - penalty);

    return score.value;
  }

  mergeScores(id: string, otherId: string): number | undefined {
    const score1 = this.scores.get(id);
    const score2 = this.scores.get(otherId);

    if (!score1 || !score2) return undefined;

    const totalAccess = score1.accessCount + score2.accessCount;
    const weight1 = totalAccess > 0 ? score1.accessCount / totalAccess : 0.5;
    const weight2 = 1 - weight1;

    const mergedValue = score1.value * weight1 + score2.value * weight2;
    score1.value = this.clamp(mergedValue);
    score1.accessCount += score2.accessCount;
    score1.validationCount += score2.validationCount;
    score1.contradictionCount += score2.contradictionCount;
    score1.lastAccessed = Math.max(score1.lastAccessed, score2.lastAccessed);
    score1.lastValidated = Math.max(score1.lastValidated, score2.lastValidated);
    score1.updatedAt = Date.now();

    this.scores.delete(otherId);

    return score1.value;
  }

  getTopConfident(limit = 10, minConfidence = 0.5): Array<{ id: string; score: ConfidenceScore }> {
    const entries = Array.from(this.scores.entries())
      .filter(([, score]) => score.value >= minConfidence)
      .sort(([, a], [, b]) => b.value - a.value)
      .slice(0, limit);

    return entries.map(([id, score]) => ({ id, score: { ...score } }));
  }

  getLowConfidence(threshold = 0.3): Array<{ id: string; score: ConfidenceScore }> {
    const entries = Array.from(this.scores.entries())
      .filter(([, score]) => score.value < threshold);

    return entries.map(([id, score]) => ({ id, score: { ...score } }));
  }

  pruneBelow(threshold: number): number {
    const toRemove: string[] = [];

    for (const [id, score] of this.scores.entries()) {
      if (score.value < threshold) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.scores.delete(id);
    }

    return toRemove.length;
  }

  calculateHalfLife(): number {
    return Math.log(2) / this.config.decayRate / (24 * 60 * 60 * 1000);
  }

  updateConfig(config: Partial<ConfidenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ConfidenceConfig {
    return { ...this.config };
  }

  getStats(): {
    totalScores: number;
    averageConfidence: number;
    medianConfidence: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
  } {
    const values = Array.from(this.scores.values()).map((s) => s.value);

    if (values.length === 0) {
      return {
        totalScores: 0,
        averageConfidence: 0,
        medianConfidence: 0,
        highConfidenceCount: 0,
        lowConfidenceCount: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    const average = values.reduce((sum, v) => sum + v, 0) / values.length;

    return {
      totalScores: this.scores.size,
      averageConfidence: average,
      medianConfidence: median,
      highConfidenceCount: values.filter((v) => v >= 0.7).length,
      lowConfidenceCount: values.filter((v) => v < 0.3).length,
    };
  }

  clear(): void {
    this.scores.clear();
  }

  private clamp(value: number): number {
    return Math.max(this.config.minConfidence, Math.min(this.config.maxConfidence, value));
  }
}

export function createConfidenceScorer(config?: Partial<ConfidenceConfig>): ConfidenceScorer {
  return new ConfidenceScorer(config);
}
