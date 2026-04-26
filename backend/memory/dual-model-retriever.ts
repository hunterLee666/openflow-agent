import { z } from "zod";

export const MemoryCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  scope: z.string(),
  createdAt: z.string(),
  confidence: z.number(),
  tags: z.array(z.string()).optional(),
});

export type MemoryCard = z.infer<typeof MemoryCardSchema>;

export const MemoryRetrievalResultSchema = z.object({
  cards: z.array(MemoryCardSchema),
  scores: z.array(z.number()),
  totalCandidates: z.number(),
});

export type MemoryRetrievalResult = z.infer<typeof MemoryRetrievalResultSchema>;

export const DualModelRetrieverConfigSchema = z.object({
  maxInject: z.number(),
  precisionThreshold: z.number(),
  fastModel: z.string().optional(),
});

export type DualModelRetrieverConfig = z.infer<typeof DualModelRetrieverConfigSchema>;

const DEFAULT_CONFIG: DualModelRetrieverConfig = {
  maxInject: 5,
  precisionThreshold: 0.78,
};

export class DualModelRetriever {
  private config: DualModelRetrieverConfig;

  constructor(config?: Partial<DualModelRetrieverConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async retrieve(
    candidates: MemoryCard[],
    userQuery: string,
    fastScoreFn: (card: MemoryCard, query: string) => Promise<number>
  ): Promise<MemoryRetrievalResult> {
    const scored: Array<{ card: MemoryCard; score: number }> = [];

    for (const card of candidates) {
      const score = await fastScoreFn(card, userQuery);
      scored.push({ card, score });
    }

    scored.sort((a, b) => b.score - a.score);

    const filtered = scored.filter(
      (item) => item.score >= this.config.precisionThreshold && item.card.scope === this.getCurrentScope()
    );

    const topK = filtered.slice(0, this.config.maxInject);

    return {
      cards: topK.map((item) => item.card),
      scores: topK.map((item) => item.score),
      totalCandidates: candidates.length,
    };
  }

  shouldInject(card: MemoryCard, score: number): boolean {
    if (score < this.config.precisionThreshold) return false;
    if (card.scope !== this.getCurrentScope()) return false;
    if (this.isStale(card)) return false;
    return true;
  }

  formatInjections(picked: MemoryCard[]): string {
    if (picked.length === 0) {
      return "";
    }

    const parts: string[] = [
      "## Retrieved Memories",
      "",
    ];

    for (const card of picked) {
      parts.push(`### ${card.title}`);
      parts.push(card.description);
      parts.push(`(ref: ${card.id}, confidence: ${card.confidence.toFixed(2)})`);
      parts.push("");
    }

    return parts.join("\n");
  }

  private getCurrentScope(): string {
    return process.env.OPENFLOW_PROJECT_SCOPE || process.cwd();
  }

  private isStale(card: MemoryCard): boolean {
    const created = new Date(card.createdAt).getTime();
    const now = Date.now();
    const daysSinceCreated = (now - created) / (1000 * 60 * 60 * 24);

    if (daysSinceCreated > 180 && card.confidence < 0.5) {
      return true;
    }

    return false;
  }
}

export function createDualModelRetriever(config?: Partial<DualModelRetrieverConfig>): DualModelRetriever {
  return new DualModelRetriever(config);
}
