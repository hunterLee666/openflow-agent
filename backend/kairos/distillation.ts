import type { MemorySystem } from "../memory/types.js";

export interface MemoryCard {
  id: string;
  type: "preference" | "project";
  title: string;
  description: string;
  evidence_ids: string[];
  confidence: number;
  createdAt: Date;
  source: string;
}

export interface DistillationInput {
  sessionId: string;
  rawLogs: Array<{
    id: string;
    timestamp: number | Date;
    content: string;
  }>;
}

export interface DistillationOutput {
  cards: MemoryCard[];
  discarded: number;
  merged: number;
  errors: string[];
}

export interface DistillationConfig {
  maxCardsPerSession: number;
  minEvidenceCount: number;
  confidenceThreshold: number;
  preferNewOverOld: boolean;
}

const DEFAULT_CONFIG: DistillationConfig = {
  maxCardsPerSession: 10,
  minEvidenceCount: 1,
  confidenceThreshold: 0.5,
  preferNewOverOld: true,
};

export class MemoryDistiller {
  private config: DistillationConfig;

  constructor(config: Partial<DistillationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async distill(
    memory: MemorySystem,
    input: DistillationInput
  ): Promise<DistillationOutput> {
    const { rawLogs } = input;
    const cards: MemoryCard[] = [];
    const discarded: number[] = [];
    const errors: string[] = [];

    const groupedByTopic = this.groupByTopic(rawLogs);
    let discardedCount = 0;

    for (const [topic, logs] of Object.entries(groupedByTopic)) {
      try {
        const card = await this.extractCard(topic, logs, input.sessionId);
        if (card && this.validateCard(card)) {
          cards.push(card);
        } else {
          discardedCount += logs.length;
        }
      } catch (e) {
        errors.push(`Failed to process topic "${topic}": ${e instanceof Error ? e.message : "Unknown error"}`);
        discardedCount += logs.length;
      }
    }

    const mergedCards = this.mergeDuplicateCards(cards);
    const trimmedCards = mergedCards.slice(0, this.config.maxCardsPerSession);

    return {
      cards: trimmedCards,
      discarded: discardedCount + (cards.length - trimmedCards.length),
      merged: cards.length - mergedCards.length,
      errors,
    };
  }

  async distillWithModel(
    memory: MemorySystem,
    input: DistillationInput,
    modelClient: (prompt: string) => Promise<string>
  ): Promise<DistillationOutput> {
    const { rawLogs } = input;
    const errors: string[] = [];

    if (rawLogs.length === 0) {
      return { cards: [], discarded: 0, merged: 0, errors: [] };
    }

    const logsText = rawLogs.map((log, i) => `[${i + 1}] ${log.content}`).join("\n");
    const prompt = createDistillationPrompt(rawLogs.map((l) => l.content));

    try {
      const response = await modelClient(prompt);
      const parsed = parseDistillationResponse(response);

      const cards: MemoryCard[] = parsed.map((item) => ({
        id: `model_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: item.type === "preference" ? "preference" : "project",
        title: item.title,
        description: item.description,
        evidence_ids: item.evidence_ids,
        confidence: 0.8,
        createdAt: new Date(),
        source: input.sessionId,
      }));

      const validatedCards = cards.filter((c) => this.validateCard(c));

      const mergedCards = this.mergeDuplicateCards(validatedCards);
      const trimmedCards = mergedCards.slice(0, this.config.maxCardsPerSession);

      return {
        cards: trimmedCards,
        discarded: cards.length - validatedCards.length,
        merged: validatedCards.length - mergedCards.length,
        errors,
      };
    } catch (e) {
      errors.push(`Model distillation failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      return { cards: [], discarded: rawLogs.length, merged: 0, errors };
    }
  }

  private groupByTopic(
    logs: Array<{ id: string; timestamp: number | Date; content: string }>
  ): Record<string, typeof logs> {
    const groups: Record<string, typeof logs> = {};

    const preferenceKeywords = [
      "prefer", "like", "want", "always", "never",
      "don't use", "use instead", "avoid", "must",
    ];
    const projectKeywords = [
      "project uses", "tech stack", "framework", "library",
      "architecture", "structure", "monorepo", "repo",
      "command", "run", "build", "test",
    ];

    for (const log of logs) {
      const lower = log.content.toLowerCase();
      let topic = "general";

      for (const kw of preferenceKeywords) {
        if (lower.includes(kw)) {
          topic = `preference:${kw}`;
          break;
        }
      }

      if (topic === "general") {
        for (const kw of projectKeywords) {
          if (lower.includes(kw)) {
            topic = `project:${kw}`;
            break;
          }
        }
      }

      if (!groups[topic]) {
        groups[topic] = [];
      }
      groups[topic].push(log);
    }

    return groups;
  }

  private async extractCard(
    topic: string,
    logs: Array<{ id: string; timestamp: number | Date; content: string }>,
    sessionId: string
  ): Promise<MemoryCard | null> {
    const isPreference = topic.startsWith("preference:");
    const isProject = topic.startsWith("project:");

    if (logs.length < this.config.minEvidenceCount) {
      return null;
    }

    const content = logs.map((l) => l.content).join(" ");
    const evidence_ids = logs.map((l) => l.id);

    let title = this.extractTitle(topic, content);
    let description = this.extractDescription(content);
    let confidence = this.calculateConfidence(logs.length, content);

    if (isPreference) {
      return {
        id: `pref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "preference",
        title,
        description,
        evidence_ids,
        confidence,
        createdAt: new Date(),
        source: sessionId,
      };
    }

    if (isProject) {
      return {
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "project",
        title,
        description,
        evidence_ids,
        confidence,
        createdAt: new Date(),
        source: sessionId,
      };
    }

    return null;
  }

  private extractTitle(topic: string, content: string): string {
    const keyword = topic.includes(":") ? topic.split(":")[1] : "memory";
    const firstSentence = content.split(/[.!?]/)[0]?.trim() || keyword;
    return firstSentence.slice(0, 100);
  }

  private extractDescription(content: string): string {
    const sentences = content
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    const uniqueSentences = [...new Set(sentences)];
    return uniqueSentences.slice(0, 5).join(". ") + ".";
  }

  private calculateConfidence(evidenceCount: number, content: string): number {
    let confidence = 0.3;

    confidence += Math.min(evidenceCount * 0.1, 0.3);

    if (content.includes("always") || content.includes("never")) {
      confidence += 0.2;
    }

    if (content.includes("prefer") || content.includes("must")) {
      confidence += 0.15;
    }

    return Math.min(confidence, 0.95);
  }

  private validateCard(card: MemoryCard): boolean {
    if (!card.title || card.title.length < 3) return false;
    if (!card.description || card.description.length < 10) return false;
    if (!card.evidence_ids || card.evidence_ids.length === 0) return false;
    if (card.confidence < this.config.confidenceThreshold) return false;

    const sensitivePatterns = [
      /password/i,
      /api[_-]?key/i,
      /secret/i,
      /token/i,
      /bearer/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(card.title) || pattern.test(card.description)) {
        return false;
      }
    }

    return true;
  }

  private mergeDuplicateCards(cards: MemoryCard[]): MemoryCard[] {
    const merged: MemoryCard[] = [];
    const seen: Map<string, MemoryCard> = new Map();

    for (const card of cards) {
      const key = `${card.type}:${card.title.toLowerCase().slice(0, 30)}`;

      if (this.config.preferNewOverOld && seen.has(key)) {
        const existing = seen.get(key)!;
        if (card.confidence > existing.confidence) {
          seen.set(key, {
            ...card,
            evidence_ids: [...existing.evidence_ids, ...card.evidence_ids],
            confidence: Math.max(card.confidence, existing.confidence),
          });
        } else {
          existing.evidence_ids.push(...card.evidence_ids);
        }
      } else {
        seen.set(key, card);
      }
    }

    return Array.from(seen.values());
  }

  async storeCards(memory: MemorySystem, cards: MemoryCard[]): Promise<void> {
    for (const card of cards) {
      await memory.semantic.store({
        id: card.id,
        subject: card.type === "preference" ? "user" : "project",
        predicate: card.type === "preference" ? "prefers" : "has_context",
        object: `${card.title}: ${card.description}`,
        confidence: card.confidence,
        source: card.source,
        createdAt: card.createdAt,
        tags: [card.type, "kairos", "distilled"],
      });
    }

    await memory.semantic.consolidate();
  }
}

export function createDistillationPrompt(logs: string[]): string {
  return `你将阅读一段按时间排序的会话记忆流水账。
请输出 JSON 数组，每项含: type ("preference"|"project"), title, description, evidence_ids。

规则：
- 合并重复事件
- 丢弃一次性试错
- 描述需可执行、无敏感密钥
- 偏好类标记 type="preference"
- 项目背景类标记 type="project"

流水账：
${logs.map((log, i) => `[${i + 1}] ${log}`).join("\n")}

输出 JSON:`;
}

export function parseDistillationResponse(
  response: string
): Array<{ type: string; title: string; description: string; evidence_ids: string[] }> {
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
