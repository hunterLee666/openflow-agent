import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export interface MemoryObservation {
  id: string;
  type: "preference" | "habit" | "pain_point" | "project_fact";
  content: string;
  scope: string;
  confidence: number;
  occurrenceCount: number;
  firstObserved: number;
  lastObserved: number;
  isOneOff: boolean;
  containsSecret: boolean;
}

export interface AutoMemoryConfig {
  memoryDir: string;
  minConfidence: number;
  minOccurrences: number;
  throttleIntervalMs: number;
  enableAutoWrite: boolean;
}

const DEFAULT_CONFIG: AutoMemoryConfig = {
  memoryDir: ".openflow/memory/auto",
  minConfidence: 0.7,
  minOccurrences: 3,
  throttleIntervalMs: 600_000,
  enableAutoWrite: true,
};

const SECRET_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /token\s*[:=]/i,
  /secret\s*[:=]/i,
  /aws[_-]?access/i,
  /private[_-]?key/i,
];

export class AutoMemoryExtractor {
  private config: AutoMemoryConfig;
  private observations: Map<string, MemoryObservation>;
  private lastWriteTimes: Map<string, number>;

  constructor(config?: Partial<AutoMemoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.observations = new Map();
    this.lastWriteTimes = new Map();
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.memoryDir, { recursive: true });
    await this.loadObservations();
  }

  async observe(
    userMessage: string,
    context: {
      scope: string;
      turnCount: number;
      previousMessages: string[];
    }
  ): Promise<MemoryObservation | null> {
    const observation = this.extractObservation(userMessage, context);

    if (!observation) {
      return null;
    }

    const existing = this.observations.get(observation.content);

    if (existing) {
      existing.occurrenceCount++;
      existing.lastObserved = Date.now();
      existing.confidence = this.calculateConfidence(existing);

      if (existing.occurrenceCount >= this.config.minOccurrences && existing.confidence >= this.config.minConfidence) {
        await this.throttleWrite(existing);
        return existing;
      }
    } else {
      this.observations.set(observation.content, observation);
    }

    return null;
  }

  async getObservations(scope?: string): Promise<MemoryObservation[]> {
    const all = Array.from(this.observations.values());

    if (scope) {
      return all.filter((obs) => obs.scope === scope);
    }

    return all;
  }

  async deleteObservation(id: string): Promise<boolean> {
    for (const [key, obs] of this.observations.entries()) {
      if (obs.id === id) {
        this.observations.delete(key);
        await this.saveObservations();
        return true;
      }
    }
    return false;
  }

  async promoteToOpenflowMd(observation: MemoryObservation): Promise<string> {
    const promotedContent = `## ${observation.content}\n\n- Type: ${observation.type}\n- Confidence: ${observation.confidence.toFixed(2)}\n- Observed: ${observation.occurrenceCount} times\n`;

    await this.deleteObservation(observation.id);

    return promotedContent;
  }

  private extractObservation(
    message: string,
    context: { scope: string; turnCount: number; previousMessages: string[] }
  ): MemoryObservation | null {
    if (this.containsSecret(message)) {
      return null;
    }

    const type = this.detectObservationType(message);

    if (!type) {
      return null;
    }

    const confidence = this.estimateConfidence(message, context.previousMessages);

    return {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      content: message,
      scope: context.scope,
      confidence,
      occurrenceCount: 1,
      firstObserved: Date.now(),
      lastObserved: Date.now(),
      isOneOff: false,
      containsSecret: false,
    };
  }

  private detectObservationType(message: string): MemoryObservation["type"] | null {
    const lower = message.toLowerCase();

    if (lower.includes("prefer") || lower.includes("like") || lower.includes("use") || lower.includes("习惯") || lower.includes("偏好")) {
      return "preference";
    }

    if (lower.includes("always") || lower.includes("never") || lower.includes("每次") || lower.includes("总是")) {
      return "habit";
    }

    if (lower.includes("avoid") || lower.includes("don't") || lower.includes("不要") || lower.includes("避免") || lower.includes("坑")) {
      return "pain_point";
    }

    if (lower.includes("project") || lower.includes("repo") || lower.includes("项目") || lower.includes("仓库")) {
      return "project_fact";
    }

    return null;
  }

  private estimateConfidence(message: string, previousMessages: string[]): number {
    let confidence = 0.5;

    const similarCount = previousMessages.filter(
      (msg) => this.similarity(message, msg) > 0.7
    ).length;

    confidence += similarCount * 0.15;

    if (message.length > 20) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private calculateConfidence(observation: MemoryObservation): number {
    const base = 0.5;
    const occurrenceBonus = Math.min(observation.occurrenceCount * 0.1, 0.4);
    const recencyBonus = this.isRecent(observation.lastObserved) ? 0.1 : 0;

    return Math.min(base + occurrenceBonus + recencyBonus, 1.0);
  }

  private isRecent(timestamp: number): boolean {
    const daysSince = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    return daysSince < 30;
  }

  private containsSecret(message: string): boolean {
    return SECRET_PATTERNS.some((pattern) => pattern.test(message));
  }

  private similarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...aWords].filter((w) => bWords.has(w)));
    const union = new Set([...aWords, ...bWords]);

    return intersection.size / union.size;
  }

  private async throttleWrite(observation: MemoryObservation): Promise<void> {
    const key = `${observation.scope}:${observation.type}`;
    const now = Date.now();
    const lastWrite = this.lastWriteTimes.get(key) || 0;

    if (now - lastWrite < this.config.throttleIntervalMs) {
      return;
    }

    this.lastWriteTimes.set(key, now);
    await this.writeToFile(observation);
  }

  private async writeToFile(observation: MemoryObservation): Promise<void> {
    const filePath = join(this.config.memoryDir, `${observation.scope.replace(/[^a-z0-9]/gi, "_")}.json`);

    const existing = await this.readObservationsFile(filePath);
    const updated = [...existing, this.observationToCard(observation)];

    await writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  }

  private async loadObservations(): Promise<void> {
    const files = await this.listMemoryFiles();

    for (const file of files) {
      const cards = await this.readObservationsFile(file);
      for (const card of cards) {
        const obs = this.cardToObservation(card);
        this.observations.set(obs.content, obs);
      }
    }
  }

  private async saveObservations(): Promise<void> {
    const byScope = new Map<string, MemoryObservation[]>();

    for (const obs of this.observations.values()) {
      const scope = obs.scope;
      if (!byScope.has(scope)) {
        byScope.set(scope, []);
      }
      byScope.get(scope)!.push(obs);
    }

    for (const [scope, obsList] of byScope.entries()) {
      const filePath = join(this.config.memoryDir, `${scope.replace(/[^a-z0-9]/gi, "_")}.json`);
      const cards = obsList.map((obs) => this.observationToCard(obs));
      await writeFile(filePath, JSON.stringify(cards, null, 2), "utf-8");
    }
  }

  private async listMemoryFiles(): Promise<string[]> {
    if (!existsSync(this.config.memoryDir)) {
      return [];
    }

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(this.config.memoryDir);
    return files.filter((f) => f.endsWith(".json")).map((f) => join(this.config.memoryDir, f));
  }

  private async readObservationsFile(filePath: string): Promise<Array<Record<string, unknown>>> {
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private observationToCard(obs: MemoryObservation): Record<string, unknown> {
    return {
      id: obs.id,
      title: `${obs.type}: ${obs.content.slice(0, 40)}`,
      description: obs.content,
      scope: obs.scope,
      confidence: obs.confidence,
      createdAt: new Date(obs.firstObserved).toISOString(),
    };
  }

  private cardToObservation(card: Record<string, unknown>): MemoryObservation {
    return {
      id: (card.id as string) || `obs_${Date.now()}`,
      type: (card.type as MemoryObservation["type"]) || "preference",
      content: (card.description as string) || (card.content as string) || "",
      scope: (card.scope as string) || "",
      confidence: (card.confidence as number) || 0.5,
      occurrenceCount: 1,
      firstObserved: card.createdAt ? new Date(card.createdAt as string).getTime() : Date.now(),
      lastObserved: Date.now(),
      isOneOff: false,
      containsSecret: false,
    };
  }
}

export function createAutoMemoryExtractor(config?: Partial<AutoMemoryConfig>): AutoMemoryExtractor {
  return new AutoMemoryExtractor(config);
}
