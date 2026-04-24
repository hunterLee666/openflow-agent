import type { KairosEngine, KairosContext, DistillationResult, DreamSchedule } from "./types.js";
import type { MemorySystem } from "../memory/types.js";

export class DefaultKairosEngine implements KairosEngine {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private memory: MemorySystem,
    private config: DreamSchedule,
  ) {}

  shouldTrigger(ctx: KairosContext): boolean {
    if (!this.config.enabled) return false;

    // Trigger after long session
    if (ctx.sessionDuration > this.config.triggerAfterMinutes * 60 * 1000) {
      return true;
    }

    // Trigger on low activity
    if (this.config.triggerOnLowActivity && ctx.lowActivity) {
      return true;
    }

    // Night mode trigger
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
    const facts: string[] = [];
    const preferences: string[] = [];
    const projectFacts: string[] = [];

    for (const event of events) {
      // Extract user preferences
      const prefMatch = event.content.match(/(?:prefer|like|want|always|never)\s+(.{3,50})/gi);
      if (prefMatch) {
        for (const match of prefMatch) {
          preferences.push(match);
          await this.memory.semantic.store({
            id: `pref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            subject: "user",
            predicate: "prefers",
            object: match,
            confidence: 0.6,
            source: sessionId,
            createdAt: new Date(),
            tags: ["preference", "kairos"],
          });
        }
      }

      // Extract project facts
      const factMatch = event.content.match(/(?:project uses|tech stack|framework|library)\s+(.{3,50})/gi);
      if (factMatch) {
        for (const match of factMatch) {
          projectFacts.push(match);
          await this.memory.semantic.store({
            id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            subject: "project",
            predicate: "uses",
            object: match,
            confidence: 0.7,
            source: sessionId,
            createdAt: new Date(),
            tags: ["project", "kairos"],
          });
        }
      }

      // Extract general facts
      const generalMatch = event.content.match(/(?:is|has|supports|requires)\s+(.{3,50})/gi);
      if (generalMatch) {
        for (const match of generalMatch) {
          facts.push(match);
        }
      }
    }

    await this.memory.semantic.consolidate();

    return {
      extractedFacts: facts.length,
      extractedPreferences: preferences.length,
      extractedProjectFacts: projectFacts.length,
      summary: `Distilled ${facts.length} facts, ${preferences.length} preferences, ${projectFacts.length} project facts`,
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
