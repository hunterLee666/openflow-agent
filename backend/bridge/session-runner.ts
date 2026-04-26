import { EventEmitter } from 'node:events';
import { BoundedUUIDSet } from './bounded-set.js';
import { z } from 'zod';

export const SessionSchema = z.object({
  id: z.string(),
  abort: z.any(),
  createdAt: z.number(),
  lastActiveAt: z.number(),
  state: z.enum(['active', 'idle', 'closed', 'error']),
  metadata: z.any(),
});

export const SessionRunnerConfigSchema = z.object({
  maxSessions: z.number().optional(),
  idleTtlMs: z.number().optional(),
  sweepIntervalMs: z.number().optional(),
  maxConcurrentPerSession: z.number().optional(),
});

export const SessionRunnerMetricsSchema = z.object({
  activeSessions: z.number(),
  totalCreated: z.number(),
  totalDisposed: z.number(),
  totalErrors: z.number(),
  oldestSessionAge: z.number(),
  averageSessionAge: z.number(),
});

export type Session = z.infer<typeof SessionSchema>;
export type SessionRunnerConfig = z.infer<typeof SessionRunnerConfigSchema>;
export type SessionRunnerMetrics = z.infer<typeof SessionRunnerMetricsSchema>;

export const DEFAULT_SESSION_RUNNER_CONFIG: Required<SessionRunnerConfig> = {
  maxSessions: 100,
  idleTtlMs: 30 * 60 * 1000,
  sweepIntervalMs: 60 * 1000,
  maxConcurrentPerSession: 1,
};

export class SessionRunner extends EventEmitter {
  private sessions = new Map<string, Session>();
  private sessionQueues = new Map<string, Array<() => void>>();
  private sessionLocks = new Map<string, boolean>();
  private recentSessionIds: BoundedUUIDSet;
  private config: Required<SessionRunnerConfig>;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private totalCreated = 0;
  private totalDisposed = 0;
  private totalErrors = 0;

  constructor(config: SessionRunnerConfig = {}) {
    super();
    this.config = { ...DEFAULT_SESSION_RUNNER_CONFIG, ...config };
    this.recentSessionIds = new BoundedUUIDSet(this.config.maxSessions * 2);
  }

  create(id: string): Session {
    if (this.sessions.size >= this.config.maxSessions) {
      this.evictOldestIdleSession();
    }

    if (this.sessions.has(id)) {
      const existing = this.sessions.get(id)!;
      existing.lastActiveAt = Date.now();
      existing.state = 'active';
      return existing;
    }

    const session: Session = {
      id,
      abort: new AbortController(),
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      state: 'active',
      metadata: new Map(),
    };

    this.sessions.set(id, session);
    this.sessionQueues.set(id, []);
    this.sessionLocks.set(id, false);
    this.recentSessionIds.add(id);
    this.totalCreated++;

    this.emit('sessionCreated', { sessionId: id });

    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActiveAt = Date.now();
    }
    return session;
  }

  dispose(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.abort.abort();
      session.state = 'closed';
      this.sessions.delete(id);
      this.sessionQueues.delete(id);
      this.sessionLocks.delete(id);
      this.totalDisposed++;

      this.emit('sessionDisposed', { sessionId: id });
    }
  }

  async executeInSession<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    this.create(sessionId);

    return new Promise<T>((resolve, reject) => {
      const queue = this.sessionQueues.get(sessionId)!;

      const execute = async () => {
        const session = this.sessions.get(sessionId);
        if (!session || session.state === 'closed') {
          reject(new Error(`Session ${sessionId} is closed`));
          return;
        }

        try {
          const result = await fn();
          session.lastActiveAt = Date.now();
          resolve(result);
        } catch (error) {
          this.totalErrors++;
          session.state = 'error';
          reject(error);
        } finally {
          this.sessionLocks.set(sessionId, false);
          this.processQueue(sessionId);
        }
      };

      queue.push(execute);
      this.processQueue(sessionId);
    });
  }

  private processQueue(sessionId: string): void {
    if (this.sessionLocks.get(sessionId)) {
      return;
    }

    const queue = this.sessionQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }

    this.sessionLocks.set(sessionId, true);
    const fn = queue.shift()!;
    fn();
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
      session.state = 'active';
    }
  }

  abortSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.abort.abort();
      session.state = 'closed';
      this.emit('sessionAborted', { sessionId });
    }
  }

  private evictOldestIdleSession(): void {
    let oldestIdle: Session | null = null;

    for (const session of this.sessions.values()) {
      if (session.state === 'idle') {
        if (!oldestIdle || session.lastActiveAt < oldestIdle.lastActiveAt) {
          oldestIdle = session;
        }
      }
    }

    if (oldestIdle) {
      this.dispose(oldestIdle.id);
    }
  }

  sweepIdleSessions(): string[] {
    const now = Date.now();
    const evicted: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActiveAt > this.config.idleTtlMs) {
        this.dispose(id);
        evicted.push(id);
      } else {
        session.state = 'idle';
      }
    }

    if (evicted.length > 0) {
      this.emit('sessionsSwept', { evicted });
    }

    return evicted;
  }

  startSweepTimer(): void {
    if (this.sweepTimer) {
      return;
    }

    this.sweepTimer = setInterval(() => {
      this.sweepIdleSessions();
    }, this.config.sweepIntervalMs);
  }

  stopSweepTimer(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getMetrics(): SessionRunnerMetrics {
    const sessions = Array.from(this.sessions.values());
    const now = Date.now();

    const ages = sessions.map((s) => now - s.createdAt);
    const oldestAge = ages.length > 0 ? Math.max(...ages) : 0;
    const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

    return {
      activeSessions: sessions.length,
      totalCreated: this.totalCreated,
      totalDisposed: this.totalDisposed,
      totalErrors: this.totalErrors,
      oldestSessionAge: oldestAge,
      averageSessionAge: avgAge,
    };
  }

  async shutdown(): Promise<void> {
    this.stopSweepTimer();

    for (const id of this.sessions.keys()) {
      this.dispose(id);
    }

    this.sessions.clear();
    this.sessionQueues.clear();
    this.sessionLocks.clear();
  }
}
