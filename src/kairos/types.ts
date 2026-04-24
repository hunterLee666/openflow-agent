export interface KairosEngine {
  shouldTrigger(ctx: KairosContext): boolean;
  distill(sessionId: string): Promise<DistillationResult>;
  schedule(): void;
}

export interface KairosContext {
  sessionDuration: number;
  messageCount: number;
  lastActivityAt: number;
  currentHour: number;
  lowActivity: boolean;
}

export interface DistillationResult {
  extractedFacts: number;
  extractedPreferences: number;
  extractedProjectFacts: number;
  summary: string;
}

export interface DreamSchedule {
  enabled: boolean;
  triggerAfterMinutes: number;
  triggerOnLowActivity: boolean;
  nightMode: boolean;
  nightStartHour: number;
  nightEndHour: number;
}
