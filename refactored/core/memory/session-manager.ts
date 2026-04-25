import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";

export interface SessionEvent {
  type: 'message' | 'tool_use' | 'file_change' | 'observation';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface SessionObservation {
  type: 'decision' | 'discovery' | 'learning' | 'preference';
  content: string;
  evidence: string;
  timestamp: number;
}

export interface SessionRecord {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  events: SessionEvent[];
  observations: SessionObservation[];
  summary?: string;
  metadata: Record<string, unknown>;
}

export interface ContextBundle {
  sessionId: string;
  memorySessionId: string;
  context: string;
  relevantMemories: Array<{ content: string; source: string }>;
}

export interface SessionReport {
  sessionId: string;
  entriesStored: number;
  observationsExtracted: number;
  summary: string;
}

export interface SessionManagerConfig {
  sessionDir: string;
  maxSessions: number;
  maxEventsPerSession: number;
  enableAutoExtraction: boolean;
}

const DEFAULT_CONFIG: SessionManagerConfig = {
  sessionDir: '.openflow/sessions',
  maxSessions: 100,
  maxEventsPerSession: 1000,
  enableAutoExtraction: true,
};

export class SessionManager extends EventEmitter {
  private config: SessionManagerConfig;
  private sessions: Map<string, SessionRecord> = new Map();
  private currentSessionId: string | null = null;

  constructor(config?: Partial<SessionManagerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.sessionDir, { recursive: true });
    await this.loadSessions();
  }

  async startSession(sessionId: string, prompt?: string): Promise<ContextBundle> {
    const sessionRecord: SessionRecord = {
      sessionId,
      startedAt: Date.now(),
      events: [],
      observations: [],
      metadata: { initialPrompt: prompt },
    };

    this.sessions.set(sessionId, sessionRecord);
    this.currentSessionId = sessionId;

    const relevantMemories = await this.getRelevantMemories(prompt);
    const context = this.buildContext(relevantMemories);

    this.emit('session:started', { sessionId, prompt });

    return {
      sessionId,
      memorySessionId: sessionId,
      context,
      relevantMemories,
    };
  }

  async recordEvent(sessionId: string, event: SessionEvent): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.events.length >= this.config.maxEventsPerSession) {
      const toRemove = session.events.slice(0, 100);
      session.events = session.events.slice(100);
      this.emit('session:events_truncated', { sessionId, removedCount: toRemove.length });
    }

    session.events.push({ ...event, timestamp: event.timestamp || Date.now() });

    if (this.config.enableAutoExtraction && event.type === 'message') {
      const observations = await this.extractObservations(event.content);
      session.observations.push(...observations);
    }

    this.emit('event:recorded', { sessionId, eventType: event.type });
  }

  async recordMessage(sessionId: string, content: string): Promise<void> {
    await this.recordEvent(sessionId, {
      type: 'message',
      content,
      timestamp: Date.now(),
    });
  }

  async recordToolUse(sessionId: string, toolName: string, input: unknown, output: unknown): Promise<void> {
    await this.recordEvent(sessionId, {
      type: 'tool_use',
      content: `Tool: ${toolName}`,
      timestamp: Date.now(),
      metadata: { toolName, input, output },
    });
  }

  async recordFileChange(sessionId: string, filePath: string, changeType: string): Promise<void> {
    await this.recordEvent(sessionId, {
      type: 'file_change',
      content: `File ${changeType}: ${filePath}`,
      timestamp: Date.now(),
      metadata: { filePath, changeType },
    });
  }

  async endSession(sessionId: string, summary?: string): Promise<SessionReport> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.endedAt = Date.now();
    session.summary = summary || this.generateSummary(session);

    await this.persistSession(session);
    await this.enforceMaxSessions();

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }

    const report: SessionReport = {
      sessionId,
      entriesStored: session.events.length,
      observationsExtracted: session.observations.length,
      summary: session.summary,
    };

    this.emit('session:ended', report);

    return report;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) || null;
  }

  async getRecentSessions(limit = 10): Promise<SessionRecord[]> {
    return Array.from(this.sessions.values())
      .filter((s) => s.endedAt)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
      .slice(0, limit);
  }

  async getActiveSession(): Promise<SessionRecord | null> {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  async getSessionInsights(): Promise<Array<{ type: string; content: string; confidence: number }>> {
    const insights: Array<{ type: string; content: string; confidence: number }> = [];

    const allObservations = Array.from(this.sessions.values()).flatMap((s) => s.observations);

    const topicCounts = new Map<string, number>();
    for (const obs of allObservations) {
      const topic = obs.type;
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }

    for (const [topic, count] of topicCounts) {
      if (count >= 2) {
        const relatedObs = allObservations.filter((o) => o.type === topic);
        const content = relatedObs.slice(0, 3).map((o) => o.content).join('; ');

        insights.push({
          type: topic,
          content,
          confidence: Math.min(1, count / 5),
        });
      }
    }

    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  private async getRelevantMemories(prompt?: string): Promise<Array<{ content: string; source: string }>> {
    if (!prompt) return [];

    const memories: Array<{ content: string; source: string }> = [];

    for (const session of this.sessions.values()) {
      if (!session.endedAt) continue;

      for (const obs of session.observations) {
        if (this.isRelevant(obs.content, prompt)) {
          memories.push({
            content: obs.content,
            source: session.sessionId,
          });
        }
      }
    }

    return memories.slice(0, 10);
  }

  private buildContext(memories: Array<{ content: string; source: string }>): string {
    if (memories.length === 0) return '';

    return `Relevant context from previous sessions:\n\n${memories.map((m) => `- [${m.source}] ${m.content}`).join('\n')}`;
  }

  private async extractObservations(content: string): Promise<SessionObservation[]> {
    const observations: SessionObservation[] = [];

    const decisionPatterns = [
      /decided to\s+(.+)/i,
      /chose to\s+(.+)/i,
      /will\s+(.+)/i,
    ];

    for (const pattern of decisionPatterns) {
      const match = content.match(pattern);
      if (match) {
        observations.push({
          type: 'decision',
          content: match[1].trim(),
          evidence: content,
          timestamp: Date.now(),
        });
      }
    }

    const discoveryPatterns = [
      /found that\s+(.+)/i,
      /discovered\s+(.+)/i,
      /learned that\s+(.+)/i,
      /realized\s+(.+)/i,
    ];

    for (const pattern of discoveryPatterns) {
      const match = content.match(pattern);
      if (match) {
        observations.push({
          type: 'discovery',
          content: match[1].trim(),
          evidence: content,
          timestamp: Date.now(),
        });
      }
    }

    const preferencePatterns = [
      /prefer\s+(.+)/i,
      /like\s+(.+)/i,
      /favorite\s+(.+)/i,
    ];

    for (const pattern of preferencePatterns) {
      const match = content.match(pattern);
      if (match) {
        observations.push({
          type: 'preference',
          content: match[1].trim(),
          evidence: content,
          timestamp: Date.now(),
        });
      }
    }

    return observations;
  }

  private isRelevant(observation: string, prompt: string): boolean {
    const obsWords = new Set(observation.toLowerCase().split(/\s+/));
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/));

    const intersection = new Set([...obsWords].filter((w) => promptWords.has(w)));
    const union = new Set([...obsWords, ...promptWords]);

    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    return jaccard > 0.1;
  }

  private generateSummary(session: SessionRecord): string {
    const eventCount = session.events.length;
    const obsCount = session.observations.length;

    const toolUses = session.events.filter((e) => e.type === 'tool_use').length;
    const messages = session.events.filter((e) => e.type === 'message').length;

    return `Session with ${eventCount} events (${messages} messages, ${toolUses} tool uses) and ${obsCount} observations extracted.`;
  }

  private async persistSession(session: SessionRecord): Promise<void> {
    const filePath = join(this.config.sessionDir, `${session.sessionId}.json`);
    await writeFile(filePath, JSON.stringify(session, null, 2));
  }

  private async loadSessions(): Promise<void> {
    try {
      const files = await readdir(this.config.sessionDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(this.config.sessionDir, file), 'utf-8');
            const session = JSON.parse(content) as SessionRecord;
            this.sessions.set(session.sessionId, session);
          } catch {
            // Skip corrupted files
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  private async enforceMaxSessions(): Promise<void> {
    if (this.sessions.size <= this.config.maxSessions) return;

    const sorted = Array.from(this.sessions.values())
      .filter((s) => s.endedAt)
      .sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));

    const toRemove = sorted.slice(0, this.sessions.size - this.config.maxSessions);
    for (const session of toRemove) {
      this.sessions.delete(session.sessionId);
    }
  }

  getStats(): { totalSessions: number; activeSessions: number; totalEvents: number; totalObservations: number } {
    const totalEvents = Array.from(this.sessions.values()).reduce((sum, s) => sum + s.events.length, 0);
    const totalObservations = Array.from(this.sessions.values()).reduce((sum, s) => sum + s.observations.length, 0);

    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter((s) => !s.endedAt).length,
      totalEvents,
      totalObservations,
    };
  }
}

export function createSessionManager(config?: Partial<SessionManagerConfig>): SessionManager {
  return new SessionManager(config);
}
