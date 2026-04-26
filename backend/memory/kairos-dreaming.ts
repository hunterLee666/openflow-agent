import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface DreamEntry {
  id: string;
  timestamp: number;
  content: string;
  type: "event" | "preference" | "correction" | "fact";
}

export interface DistilledCard {
  id: string;
  title: string;
  description: string;
  category: "user_preference" | "project_context" | "workflow" | "pain_point";
  confidence: number;
  createdAt: number;
  sourceEntries: string[];
}

export interface KairosDreamingConfig {
  memoryDir: string;
  idleThresholdMs: number;
  nightHours: [number, number];
  enableNightDream: boolean;
  enableIdleDream: boolean;
  maxCardsPerDream: number;
}

const DEFAULT_CONFIG: KairosDreamingConfig = {
  memoryDir: ".openflow/memory/dreams",
  idleThresholdMs: 30 * 60 * 1000,
  nightHours: [23, 7],
  enableNightDream: true,
  enableIdleDream: true,
  maxCardsPerDream: 10,
};

export class KairosDreaming {
  private config: KairosDreamingConfig;
  private dreamLog: DreamEntry[];
  private distilledCards: DistilledCard[];
  private lastDreamTime: number;
  private idleTimer: ReturnType<typeof setTimeout> | null;

  constructor(config?: Partial<KairosDreamingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dreamLog = [];
    this.distilledCards = [];
    this.lastDreamTime = 0;
    this.idleTimer = null;
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.memoryDir, { recursive: true });
    await this.loadDreamLog();
    await this.loadDistilledCards();
  }

  addDreamEntry(entry: Omit<DreamEntry, "id" | "timestamp">): void {
    const dreamEntry: DreamEntry = {
      ...entry,
      id: `dream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    this.dreamLog.push(dreamEntry);

    if (this.dreamLog.length > 1000) {
      this.dreamLog = this.dreamLog.slice(-1000);
    }
  }

  async triggerDream(reason: "idle" | "night" | "manual"): Promise<DreamResult> {
    const undistilled = this.dreamLog.filter(
      (entry) => !this.distilledCards.some((card) => card.sourceEntries.includes(entry.id))
    );

    if (undistilled.length === 0) {
      return { distilled: 0, cards: [], reason };
    }

    const grouped = this.groupByCategory(undistilled);

    const newCards: DistilledCard[] = [];

    for (const [category, entries] of Object.entries(grouped)) {
      const card = await this.distillCategory(category as DistilledCard["category"], entries);
      if (card) {
        newCards.push(card);
      }

      if (newCards.length >= this.config.maxCardsPerDream) {
        break;
      }
    }

    this.distilledCards.push(...newCards);
    this.lastDreamTime = Date.now();

    await this.saveDreamLog();
    await this.saveDistilledCards();

    return {
      distilled: newCards.length,
      cards: newCards,
      reason,
    };
  }

  startIdleWatcher(onDream?: (result: DreamResult) => void): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    const checkIdle = () => {
      if (this.config.enableIdleDream) {
        this.triggerDream("idle").then((result) => {
          if (result.distilled > 0) {
            onDream?.(result);
          }
        });
      }

      this.idleTimer = setTimeout(checkIdle, this.config.idleThresholdMs);
    };

    this.idleTimer = setTimeout(checkIdle, this.config.idleThresholdMs);
  }

  async checkNightDream(onDream?: (result: DreamResult) => void): Promise<void> {
    if (!this.config.enableNightDream) {
      return;
    }

    const hour = new Date().getHours();
    const [start, end] = this.config.nightHours;

    const isNight = start > end
      ? hour >= start || hour < end
      : hour >= start && hour < end;

    if (isNight) {
      const result = await this.triggerDream("night");
      if (result.distilled > 0) {
        onDream?.(result);
      }
    }
  }

  getDistilledCards(): DistilledCard[] {
    return [...this.distilledCards];
  }

  getDreamLog(): DreamEntry[] {
    return [...this.dreamLog];
  }

  async deleteCard(cardId: string): Promise<boolean> {
    const index = this.distilledCards.findIndex((c) => c.id === cardId);
    if (index === -1) {
      return false;
    }

    this.distilledCards.splice(index, 1);
    await this.saveDistilledCards();
    return true;
  }

  private async distillCategory(
    category: DistilledCard["category"],
    entries: DreamEntry[]
  ): Promise<DistilledCard | null> {
    if (entries.length === 0) {
      return null;
    }

    const title = this.generateTitle(category, entries);
    const description = this.generateDescription(entries);
    const confidence = this.calculateConfidence(entries);

    return {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      category,
      confidence,
      createdAt: Date.now(),
      sourceEntries: entries.map((e) => e.id),
    };
  }

  private groupByCategory(entries: DreamEntry[]): Record<DistilledCard["category"], DreamEntry[]> {
    const grouped: Record<string, DreamEntry[]> = {
      user_preference: [],
      project_context: [],
      workflow: [],
      pain_point: [],
    };

    for (const entry of entries) {
      const category = this.mapEntryTypeToCategory(entry.type);
      grouped[category].push(entry);
    }

    return grouped;
  }

  private mapEntryTypeToCategory(type: DreamEntry["type"]): DistilledCard["category"] {
    switch (type) {
      case "preference":
        return "user_preference";
      case "fact":
        return "project_context";
      case "event":
        return "workflow";
      case "correction":
        return "pain_point";
      default:
        return "project_context";
    }
  }

  private generateTitle(category: DistilledCard["category"], entries: DreamEntry[]): string {
    const titles: Record<DistilledCard["category"], string> = {
      user_preference: `User Preference: ${entries[0]?.content.slice(0, 30)}...`,
      project_context: `Project Fact: ${entries[0]?.content.slice(0, 30)}...`,
      workflow: `Workflow: ${entries[0]?.content.slice(0, 30)}...`,
      pain_point: `Pain Point: ${entries[0]?.content.slice(0, 30)}...`,
    };

    return titles[category];
  }

  private generateDescription(entries: DreamEntry[]): string {
    const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
    const descriptions = sorted.map((e) => `- ${e.content}`).join("\n");
    return `Observed ${entries.length} times:\n${descriptions}`;
  }

  private calculateConfidence(entries: DreamEntry[]): number {
    const base = 0.5;
    const countBonus = Math.min(entries.length * 0.1, 0.4);
    const recencyBonus = this.hasRecentEntries(entries) ? 0.1 : 0;

    return Math.min(base + countBonus + recencyBonus, 1.0);
  }

  private hasRecentEntries(entries: DreamEntry[]): boolean {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return entries.some((e) => e.timestamp > thirtyDaysAgo);
  }

  private async loadDreamLog(): Promise<void> {
    const filePath = join(this.config.memoryDir, "dream_log.json");
    try {
      const content = await readFile(filePath, "utf-8");
      this.dreamLog = JSON.parse(content);
    } catch {
      this.dreamLog = [];
    }
  }

  private async saveDreamLog(): Promise<void> {
    const filePath = join(this.config.memoryDir, "dream_log.json");
    await writeFile(filePath, JSON.stringify(this.dreamLog, null, 2), "utf-8");
  }

  private async loadDistilledCards(): Promise<void> {
    const filePath = join(this.config.memoryDir, "distilled_cards.json");
    try {
      const content = await readFile(filePath, "utf-8");
      this.distilledCards = JSON.parse(content);
    } catch {
      this.distilledCards = [];
    }
  }

  private async saveDistilledCards(): Promise<void> {
    const filePath = join(this.config.memoryDir, "distilled_cards.json");
    await writeFile(filePath, JSON.stringify(this.distilledCards, null, 2), "utf-8");
  }
}

export interface DreamResult {
  distilled: number;
  cards: DistilledCard[];
  reason: "idle" | "night" | "manual";
}

export function createKairosDreaming(config?: Partial<KairosDreamingConfig>): KairosDreaming {
  return new KairosDreaming(config);
}
