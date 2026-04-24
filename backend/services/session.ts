import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Message, SessionStore } from "../types/index.js";
import { APP_SESSIONS_DIR } from "../utils/paths.js";
import { TokenRefreshScheduler, DEFAULT_TOKEN_REFRESH_CONFIG } from "../utils/tokenRefresh.js";
import {
  serializeMessages,
  deserializeMessages,
  serializeMessage,
  deserializeMessage,
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  type SerializedMessage,
} from "../utils/messageSerialization.js";

export interface SessionConfig {
  autoRefreshToken?: boolean;
  tokenRefreshConfig?: Partial<typeof DEFAULT_TOKEN_REFRESH_CONFIG>;
  getAccessToken?: () => string | undefined | Promise<string | undefined>;
}

export class FileSessionStore implements SessionStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || APP_SESSIONS_DIR;
  }

  private threadPath(threadId: string): string {
    return join(this.baseDir, `${threadId}.json`);
  }

  async createThread(): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(this.threadPath(threadId), JSON.stringify([]));
    return threadId;
  }

  async loadMessages(threadId?: string): Promise<Message[]> {
    if (!threadId) return [];
    const path = this.threadPath(threadId);
    if (!existsSync(path)) return [];
    const data = await readFile(path, "utf-8");
    const serialized = JSON.parse(data) as SerializedMessage[];
    return deserializeMessages(serialized);
  }

  async saveMessages(threadId: string, messages: Message[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    const serialized = serializeMessages(messages);
    await writeFile(this.threadPath(threadId), JSON.stringify(serialized, null, 2));
  }
}

export class SessionManager {
  private store: FileSessionStore;
  private tokenScheduler?: TokenRefreshScheduler;
  private config: SessionConfig;
  private activeSessions = new Map<string, { lastAccess: number; messageCount: number }>();

  constructor(store?: FileSessionStore, config: SessionConfig = {}) {
    this.store = store || new FileSessionStore();
    this.config = config;

    if (config.autoRefreshToken && config.getAccessToken) {
      this.tokenScheduler = new TokenRefreshScheduler(
        config.tokenRefreshConfig,
        config.getAccessToken
      );
    }
  }

  async createSession(): Promise<string> {
    const threadId = await this.store.createThread();
    this.activeSessions.set(threadId, { lastAccess: Date.now(), messageCount: 0 });
    return threadId;
  }

  async loadSession(threadId: string): Promise<Message[]> {
    const messages = await this.store.loadMessages(threadId);
    const session = this.activeSessions.get(threadId);
    if (session) {
      session.lastAccess = Date.now();
    } else {
      this.activeSessions.set(threadId, { lastAccess: Date.now(), messageCount: messages.length });
    }
    return messages;
  }

  async saveSession(threadId: string, messages: Message[]): Promise<void> {
    await this.store.saveMessages(threadId, messages);
    const session = this.activeSessions.get(threadId);
    if (session) {
      session.messageCount = messages.length;
      session.lastAccess = Date.now();
    }
  }

  addMessage(threadId: string, message: Message): Message {
    const session = this.activeSessions.get(threadId);
    if (session) {
      session.lastAccess = Date.now();
      session.messageCount++;
    }
    return message;
  }

  createUserMessage(threadId: string, content: string): Message {
    return createUserMessage(content, threadId);
  }

  createAssistantMessage(threadId: string, content: string): Message {
    return createAssistantMessage(content, threadId);
  }

  createToolResultMessage(threadId: string, toolUseId: string, result: unknown): Message {
    return createToolResultMessage(toolUseId, result, threadId);
  }

  scheduleTokenRefresh(sessionId: string, token: string, expiryMs?: number): void {
    if (this.tokenScheduler) {
      this.tokenScheduler.schedule(sessionId, token, expiryMs);
    }
  }

  cancelTokenRefresh(sessionId: string): boolean {
    if (this.tokenScheduler) {
      return this.tokenScheduler.cancel(sessionId);
    }
    return false;
  }

  getActiveSessions(): Array<{ threadId: string; lastAccess: number; messageCount: number }> {
    return Array.from(this.activeSessions.entries()).map(([threadId, session]) => ({
      threadId,
      ...session,
    }));
  }

  cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): string[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [threadId, session] of this.activeSessions.entries()) {
      if (now - session.lastAccess > maxAgeMs) {
        stale.push(threadId);
      }
    }

    for (const threadId of stale) {
      this.activeSessions.delete(threadId);
      this.cancelTokenRefresh(threadId);
    }

    return stale;
  }

  getPendingTokenRefreshs(): string[] {
    return this.tokenScheduler?.listPending() ?? [];
  }
}
