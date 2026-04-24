import {
  SessionStatus,
  Session,
  SessionEvent,
  SessionObservation,
  FinalizationReport,
  DistillationResult,
  SessionMetadata,
  SessionLifecycleConfig,
  SessionHooks,
} from "./types.js";

export { SessionStatus };

export class SessionLifecycleManager {
  private sessions: Map<string, Session> = new Map();
  private config: SessionLifecycleConfig;
  private hooks: SessionHooks;
  private activeSessionId: string | null = null;
  private eventCounter: number = 0;
  private observationCounter: number = 0;

  constructor(config?: Partial<SessionLifecycleConfig>, hooks?: SessionHooks) {
    this.config = {
      enableAutoStop: config?.enableAutoStop ?? true,
      autoStopIdleMinutes: config?.autoStopIdleMinutes ?? 30,
      enableAutoDistill: config?.enableAutoDistill ?? true,
      enableObservationExtraction: config?.enableObservationExtraction ?? true,
      maxEventsPerSession: config?.maxEventsPerSession ?? 10000,
      maxObservationsPerSession: config?.maxObservationsPerSession ?? 100,
    };

    this.hooks = hooks || {};
  }

  async startSession(
    project: string,
    userPrompt?: string,
    metadata?: Partial<SessionMetadata>
  ): Promise<Session> {
    const sessionId = this.generateSessionId();

    const session: Session = {
      id: sessionId,
      project,
      status: SessionStatus.PENDING,
      startedAt: Date.now(),
      userPrompt,
      contextBudget: 2000,
      events: [],
      observations: [],
      metadata: {
        agentId: metadata?.agentId,
        userId: metadata?.userId,
        tags: metadata?.tags || [],
        parentSessionId: metadata?.parentSessionId,
        systemPrompt: metadata?.systemPrompt,
      },
    };

    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    await this.updateStatus(session, SessionStatus.ACTIVE);

    return session;
  }

  async recordEvent(
    sessionId: string,
    type: SessionEvent['type'],
    content: string,
    options?: {
      metadata?: Record<string, unknown>;
      autoRedact?: boolean;
      importance?: number;
    }
  ): Promise<SessionEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.RECORDING) {
      throw new Error(`Cannot record event in session with status ${session.status}`);
    }

    if (session.events.length >= this.config.maxEventsPerSession) {
      console.warn(`Session ${sessionId} reached max events limit`);
    }

    const event: SessionEvent = {
      id: this.generateEventId(),
      type,
      timestamp: Date.now(),
      content: options?.autoRedact !== false ? this.autoRedact(content) : content,
      metadata: options?.metadata,
      redacted: options?.autoRedact !== false,
      importance: options?.importance ?? this.estimateEventImportance(type, content),
    };

    session.events.push(event);

    if (this.config.enableObservationExtraction) {
      const observations = this.extractObservations(event);
      for (const obs of observations) {
        if (session.observations.length < this.config.maxObservationsPerSession) {
          session.observations.push(obs);
          this.hooks.onObservation?.(session, obs);
        }
      }
    }

    this.hooks.onEvent?.(session, event);
    return event;
  }

  async pauseSession(sessionId: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.updateStatus(session, SessionStatus.PAUSED);
    return session;
  }

  async resumeSession(sessionId: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.PAUSED) {
      throw new Error(`Cannot resume session with status ${session.status}`);
    }

    await this.updateStatus(session, SessionStatus.ACTIVE);
    return session;
  }

  async stopSession(sessionId: string): Promise<Session> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.stoppedAt = Date.now();
    await this.updateStatus(session, SessionStatus.STOPPED);

    if (this.config.enableAutoDistill) {
      await this.distill(session);
    }

    return session;
  }

  async endSession(sessionId: string): Promise<FinalizationReport> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.STOPPED) {
      await this.stopSession(sessionId);
    }

    session.endedAt = Date.now();
    await this.updateStatus(session, SessionStatus.ENDED);

    const report = this.generateFinalizationReport(session);
    session.finalizationReport = report;

    this.hooks.onFinalize?.(session, report);

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    return report;
  }

  private async distill(session: Session): Promise<void> {
    const distillations: DistillationResult = {
      type: 'semantic',
      entriesCreated: 0,
      confidence: 0,
    };

    for (const observation of session.observations) {
      if (observation.type === 'decision' || observation.type === 'discovery') {
        distillations.entriesCreated++;
      }
    }

    distillations.confidence = session.observations.length > 0
      ? session.observations.reduce((sum, o) => sum + o.confidence, 0) / session.observations.length
      : 0;

    session.finalizationReport?.distillations.push(distillations);
    this.hooks.onDistill?.(session, distillations);
  }

  private generateFinalizationReport(session: Session): FinalizationReport {
    const duration = (session.stoppedAt || Date.now()) - session.startedAt;
    const totalTokens = session.events.reduce((sum, e) => sum + Math.ceil(e.content.length / 4), 0);

    const qualityScore = this.calculateQualityScore(session);

    return {
      sessionId: session.id,
      totalEvents: session.events.length,
      observationsExtracted: session.observations.length,
      tokensUsed: totalTokens,
      duration,
      qualityScore,
      distillations: [],
    };
  }

  private calculateQualityScore(session: Session): number {
    if (session.events.length === 0) return 0;

    const avgImportance = session.events.reduce((sum, e) => sum + e.importance, 0) / session.events.length;
    const observationRatio = session.observations.length / Math.max(1, session.events.length);
    const coverageScore = session.events.filter(e => e.type !== 'error').length / session.events.length;

    return (avgImportance * 0.4 + observationRatio * 0.3 + coverageScore * 0.3);
  }

  private extractObservations(event: SessionEvent): SessionObservation[] {
    const observations: SessionObservation[] = [];

    if (event.type === 'message') {
      const decisions = this.extractDecisions(event.content);
      for (const decision of decisions) {
        observations.push(this.createObservation('decision', decision, event.id, 0.8));
      }

      const discoveries = this.extractDiscoveries(event.content);
      for (const discovery of discoveries) {
        observations.push(this.createObservation('discovery', discovery, event.id, 0.7));
      }

      const preferences = this.extractPreferences(event.content);
      for (const pref of preferences) {
        observations.push(this.createObservation('preference', pref, event.id, 0.6));
      }
    }

    if (event.type === 'tool_use') {
      const patterns = this.extractPatterns(event.content);
      for (const pattern of patterns) {
        observations.push(this.createObservation('pattern', pattern, event.id, 0.5));
      }
    }

    return observations;
  }

  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    const patterns = [
      /decided?\s+to\s+(\w+(?:\s+\w+){0,5})/i,
      /chose\s+(\w+(?:\s+\w+){0,5})/i,
      /will\s+(?:use|implement|create|build)\s+(\w+(?:\s+\w+){0,5})/i,
      /(?:going to|going with)\s+(\w+(?:\s+\w+){0,5})/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        decisions.push(match[0]);
      }
    }

    return decisions;
  }

  private extractDiscoveries(content: string): string[] {
    const discoveries: string[] = [];
    const patterns = [
      /(?:discovered|found out|learned|realized)\s+that\s+(.+?)(?:\.|$)/i,
      /(?:noticed|observed|found)\s+(?:that\s+)?(.+?)(?:\.|$)/i,
    ];

    for (const pattern of patterns) {
      const matches = content.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        discoveries.push(match[0]);
      }
    }

    return discoveries;
  }

  private extractPreferences(content: string): string[] {
    const preferences: string[] = [];
    const patterns = [
      /(?:prefer|prefers|preferred)\s+(\w+(?:\s+\w+){0,3})/i,
      /(?:like|likes|loved)\s+(\w+(?:\s+\w+){0,3})/i,
      /(?:hate|hates|disliked)\s+(\w+(?:\s+\w+){0,3})/i,
      /(?:always|never)\s+(?:use|do)\s+(\w+(?:\s+\w+){0,3})/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        preferences.push(match[0]);
      }
    }

    return preferences;
  }

  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];

    if (content.includes('repeated') || content.includes('again')) {
      patterns.push('repeated action detected');
    }

    if (content.includes('similar') || content.includes('same as')) {
      patterns.push('similar pattern identified');
    }

    return patterns;
  }

  private createObservation(
    type: SessionObservation['type'],
    content: string,
    linkedEvent: string,
    confidence: number
  ): SessionObservation {
    return {
      id: this.generateObservationId(),
      type,
      content,
      confidence,
      extractedFrom: linkedEvent,
      timestamp: Date.now(),
      linkedEvents: [linkedEvent],
    };
  }

  private estimateEventImportance(type: SessionEvent['type'], content: string): number {
    const baseScores: Record<SessionEvent['type'], number> = {
      message: 0.5,
      tool_use: 0.6,
      file_change: 0.7,
      decision: 0.8,
      error: 0.4,
    };

    let score = baseScores[type] ?? 0.5;

    if (content.length > 500) score += 0.1;
    if (content.includes('important') || content.includes('critical')) score += 0.2;
    if (content.includes('TODO') || content.includes('FIXME')) score += 0.1;

    return Math.min(1, score);
  }

  private autoRedact(content: string): string {
    let redacted = content;

    const patterns = [
      { regex: /password[=:]\s*[\"']?([^\s\"']+)[\"']?/gi, replacement: 'password=***' },
      { regex: /api[_-]?key[=:]\s*[\"']?([^\s\"']+)[\"']?/gi, replacement: 'api_key=***' },
      { regex: /token[=:]\s*[\"']?([^\s\"']+)[\"']?/gi, replacement: 'token=***' },
      { regex: /secret[=:]\s*[\"']?([^\s\"']+)[\"']?/gi, replacement: 'secret=***' },
      { regex: /bearer\s+([a-zA-Z0-9\-_.~+/]+)/gi, replacement: 'bearer ***' },
    ];

    for (const { regex, replacement } of patterns) {
      redacted = redacted.replace(regex, replacement);
    }

    return redacted;
  }

  private async updateStatus(session: Session, newStatus: SessionStatus): Promise<void> {
    const oldStatus = session.status;
    session.status = newStatus;
    this.hooks.onStatusChange?.(session, oldStatus, newStatus);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateEventId(): string {
    return `event_${++this.eventCounter}_${Date.now()}`;
  }

  private generateObservationId(): string {
    return `obs_${++this.observationCounter}_${Date.now()}`;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSession(): Session | undefined {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined;
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSessionsByProject(project: string): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.project === project);
  }

  getSessionsByStatus(status: SessionStatus): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.status === status);
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
    this.activeSessionId = null;
  }
}

export function createSessionLifecycleManager(
  config?: Partial<SessionLifecycleConfig>,
  hooks?: SessionHooks
): SessionLifecycleManager {
  return new SessionLifecycleManager(config, hooks);
}

export const DEFAULT_SESSION_CONFIG: SessionLifecycleConfig = {
  enableAutoStop: true,
  autoStopIdleMinutes: 30,
  enableAutoDistill: true,
  enableObservationExtraction: true,
  maxEventsPerSession: 10000,
  maxObservationsPerSession: 100,
};
