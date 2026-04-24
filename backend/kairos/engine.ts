import type { KairosEngine, KairosContext, DistillationResult, DreamSchedule } from "./types.js";
import type { MemorySystem } from "../memory/types.js";
import { MemoryDistiller } from "./distillation.js";

export class DefaultKairosEngine implements KairosEngine {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private memory: MemorySystem,
    private config: DreamSchedule,
  ) {}

  shouldTrigger(ctx: KairosContext): boolean {
    if (!this.config.enabled) return false;

    if (ctx.sessionDuration > this.config.triggerAfterMinutes * 60 * 1000) {
      return true;
    }

    if (this.config.triggerOnLowActivity && ctx.lowActivity) {
      return true;
    }

    if (this.config.nightMode) {
      const hour = ctx.currentHour;
      if (hour >= this.config.nightStartHour || hour < this.config.nightEndHour) {
        return true;
      }
    }

    return false;
  }

  async distill(sessionId: string): Promise<DistillationResult> {
    const events = await this.memory.episodic.retrieve(sessionId, 100);

    if (events.length === 0) {
      return {
        extractedFacts: 0,
        extractedPreferences: 0,
        extractedProjectFacts: 0,
        summary: "No events to distill",
      };
    }

    const distiller = new MemoryDistiller();
    const input = {
      sessionId,
      rawLogs: events.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        content: e.content,
      })),
    };

    const result = await distiller.distill(this.memory, input);

    if (result.cards.length > 0) {
      await distiller.storeCards(this.memory, result.cards);
    }

    const preferences = result.cards.filter((c) => c.type === "preference");
    const projectFacts = result.cards.filter((c) => c.type === "project");

    return {
      extractedFacts: result.errors.length,
      extractedPreferences: preferences.length,
      extractedProjectFacts: projectFacts.length,
      summary: `Distilled ${result.cards.length} cards (${preferences.length} preferences, ${projectFacts.length} project facts)`,
    };
  }

  schedule(): void {
    if (!this.config.enabled) return;

    // Check every 5 minutes
    this.timer = setInterval(() => {
      const now = new Date();
      const ctx: KairosContext = {
        sessionDuration: 0,
        messageCount: 0,
        lastActivityAt: Date.now(),
        currentHour: now.getHours(),
        lowActivity: false,
      };

      if (this.shouldTrigger(ctx)) {
        this.distill("scheduled").catch(() => {});
      }
    }, 5 * 60 * 1000);
  }
}
