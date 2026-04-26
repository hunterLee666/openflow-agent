import { z } from "zod";

export const DialogueTurnSchema = z.object({
  speaker: z.string(),
  content: z.string(),
  timestamp: z.string().optional(),
});

export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;

export const DialogueWindowSchema = z.object({
  turns: z.array(DialogueTurnSchema),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export type DialogueWindow = z.infer<typeof DialogueWindowSchema>;

export const MemoryUnitSchema = z.object({
  id: z.string(),
  content: z.string(),
  entities: z.array(z.string()),
  timestamp: z.string(),
  salience: z.number(),
  sourceType: z.enum(['dialogue', 'observation', 'fact']),
  originalText: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MemoryUnit = z.infer<typeof MemoryUnitSchema>;

export const CompressionConfigSchema = z.object({
  windowSize: z.number(),
  entropyThreshold: z.number(),
  minSalience: z.number(),
  enableCoreferenceResolution: z.boolean(),
  enableTimestampAnchoring: z.boolean(),
});

export type CompressionConfig = z.infer<typeof CompressionConfigSchema>;

const DEFAULT_CONFIG: CompressionConfig = {
  windowSize: 5,
  entropyThreshold: 0.3,
  minSalience: 0.5,
  enableCoreferenceResolution: true,
  enableTimestampAnchoring: true,
};

export class SemanticCompressor {
  private config: CompressionConfig;

  constructor(config?: Partial<CompressionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  segmentDialogue(dialogue: DialogueTurn[]): DialogueWindow[] {
    const windows: DialogueWindow[] = [];
    const size = this.config.windowSize;

    for (let i = 0; i < dialogue.length; i += size) {
      const windowTurns = dialogue.slice(i, i + size);
      windows.push({
        turns: windowTurns,
        startTime: windowTurns[0]?.timestamp,
        endTime: windowTurns[windowTurns.length - 1]?.timestamp,
      });
    }

    return windows;
  }

  calculateTextEntropy(text: string): number {
    if (!text || text.length === 0) return 0;

    const charFreq = new Map<string, number>();
    for (const char of text.toLowerCase()) {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }

    let entropy = 0;
    const length = text.length;
    for (const count of charFreq.values()) {
      const probability = count / length;
      if (probability > 0) {
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  filterByEntropy(window: DialogueWindow): boolean {
    const combinedText = window.turns.map((t) => t.content).join(' ');
    const entropy = this.calculateTextEntropy(combinedText);
    const normalizedEntropy = entropy / Math.log2(256);

    return normalizedEntropy >= this.config.entropyThreshold;
  }

  resolveCoreferences(text: string, context: Map<string, string>): string {
    if (!this.config.enableCoreferenceResolution) return text;

    let resolved = text;

    const pronouns = ['he', 'she', 'it', 'they', 'him', 'her', 'them', 'his', 'hers', 'its', 'their'];
    for (const pronoun of pronouns) {
      const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
      if (context.has(pronoun.toLowerCase())) {
        resolved = resolved.replace(regex, context.get(pronoun.toLowerCase())!);
      }
    }

    return resolved;
  }

  anchorTimestamps(text: string, referenceTime?: string): string {
    if (!this.config.enableTimestampAnchoring) return text;

    const now = referenceTime ? new Date(referenceTime) : new Date();

    const relativePatterns: Array<{ pattern: RegExp; offset: (match: RegExpMatchArray) => number }> = [
      {
        pattern: /\btomorrow\b/gi,
        offset: () => 24 * 60 * 60 * 1000,
      },
      {
        pattern: /\byesterday\b/gi,
        offset: () => -24 * 60 * 60 * 1000,
      },
      {
        pattern: /\bnext week\b/gi,
        offset: () => 7 * 24 * 60 * 60 * 1000,
      },
      {
        pattern: /\blast week\b/gi,
        offset: () => -7 * 24 * 60 * 60 * 1000,
      },
      {
        pattern: /\bnext month\b/gi,
        offset: () => 30 * 24 * 60 * 60 * 1000,
      },
    ];

    let anchored = text;
    for (const { pattern, offset } of relativePatterns) {
      anchored = anchored.replace(pattern, (match) => {
        const targetDate = new Date(now.getTime() + offset([match]));
        return targetDate.toISOString().split('T')[0];
      });
    }

    return anchored;
  }

  async compressToUnits(
    dialogue: DialogueTurn[],
    context?: Map<string, string>,
    referenceTime?: string
  ): Promise<MemoryUnit[]> {
    const windows = this.segmentDialogue(dialogue);
    const units: MemoryUnit[] = [];

    for (const window of windows) {
      if (!this.filterByEntropy(window)) {
        continue;
      }

      const combinedText = window.turns.map((t) => t.content).join(' ');

      let processedText = combinedText;
      if (context) {
        processedText = this.resolveCoreferences(processedText, context);
      }
      processedText = this.anchorTimestamps(processedText, referenceTime);

      const salience = this.calculateSalience(window);
      if (salience < this.config.minSalience) {
        continue;
      }

      const entities = this.extractEntities(processedText);

      units.push({
        id: `unit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        content: processedText,
        entities,
        timestamp: window.endTime || new Date().toISOString(),
        salience,
        sourceType: 'dialogue',
        originalText: combinedText,
      });
    }

    return units;
  }

  async compressFact(fact: string, metadata?: Record<string, unknown>): Promise<MemoryUnit> {
    const salience = this.calculateTextSalience(fact);
    const entities = this.extractEntities(fact);

    return {
      id: `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: fact,
      entities,
      timestamp: new Date().toISOString(),
      salience: Math.max(salience, this.config.minSalience),
      sourceType: 'fact',
      metadata,
    };
  }

  async compressObservation(observation: string): Promise<MemoryUnit> {
    const salience = this.calculateTextSalience(observation);
    const entities = this.extractEntities(observation);

    return {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: observation,
      entities,
      timestamp: new Date().toISOString(),
      salience: Math.max(salience, this.config.minSalience),
      sourceType: 'observation',
    };
  }

  private calculateSalience(window: DialogueWindow): number {
    const combinedText = window.turns.map((t) => t.content).join(' ');
    return this.calculateTextSalience(combinedText);
  }

  private calculateTextSalience(text: string): number {
    const entropy = this.calculateTextEntropy(text);
    const normalizedEntropy = entropy / Math.log2(256);

    const wordCount = text.split(/\s+/).length;
    const lengthFactor = Math.min(wordCount / 100, 1);

    const hasEntities = this.extractEntities(text).length > 0;
    const entityBonus = hasEntities ? 0.2 : 0;

    return Math.min(1, normalizedEntropy * 0.6 + lengthFactor * 0.2 + entityBonus + 0.2);
  }

  private extractEntities(text: string): string[] {
    const entities: string[] = [];

    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    const names = text.match(namePattern);
    if (names) {
      entities.push(...names);
    }

    const datePattern = /\b\d{4}-\d{2}-\d{2}\b/g;
    const dates = text.match(datePattern);
    if (dates) {
      entities.push(...dates);
    }

    const timePattern = /\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)?\b/g;
    const times = text.match(timePattern);
    if (times) {
      entities.push(...times);
    }

    const locationPattern = /\b(at|in|on)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/g;
    const locations = text.match(locationPattern);
    if (locations) {
      entities.push(...locations.map((l) => l.replace(/^(at|in|on)\s+/, '')));
    }

    return [...new Set(entities)];
  }
}

export function createSemanticCompressor(config?: Partial<CompressionConfig>): SemanticCompressor {
  return new SemanticCompressor(config);
}
