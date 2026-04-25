import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Message, SessionStore, SessionConfig, SessionInfo } from "./types.js";

export class FileSessionStore implements SessionStore {
  private baseDir: string;
  private maxThreads: number;
  private maxMessagesPerThread: number;

  constructor(config?: SessionConfig) {
    this.baseDir = config?.sessionsDir || join(process.cwd(), ".openflow", "sessions");
    this.maxThreads = config?.maxThreads || 100;
    this.maxMessagesPerThread = config?.maxMessagesPerThread || 1000;
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
    return JSON.parse(data) as Message[];
  }

  async saveMessages(threadId: string, messages: Message[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    const trimmed = messages.length > this.maxMessagesPerThread
      ? messages.slice(-this.maxMessagesPerThread)
      : messages;
    await writeFile(this.threadPath(threadId), JSON.stringify(trimmed, null, 2));
  }

  async deleteThread(threadId: string): Promise<void> {
    const path = this.threadPath(threadId);
    if (existsSync(path)) {
      await unlink(path);
    }
  }

  async listThreads(): Promise<string[]> {
    if (!existsSync(this.baseDir)) return [];
    const files = await readdir(this.baseDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }
}

export class SessionManager {
  private store: FileSessionStore;
  private activeSessions: Map<string, SessionInfo>;

  constructor(store?: FileSessionStore) {
    this.store = store || new FileSessionStore();
    this.activeSessions = new Map();
  }

  async createSession(): Promise<string> {
    const threadId = await this.store.createThread();
    this.activeSessions.set(threadId, {
      threadId,
      lastAccess: Date.now(),
      messageCount: 0,
    });
    return threadId;
  }

  async loadSession(threadId: string): Promise<Message[]> {
    const messages = await this.store.loadMessages(threadId);
    const session = this.activeSessions.get(threadId);
    if (session) {
      session.lastAccess = Date.now();
    } else {
      this.activeSessions.set(threadId, {
        threadId,
        lastAccess: Date.now(),
        messageCount: messages.length,
      });
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

  async deleteSession(threadId: string): Promise<void> {
    await this.store.deleteThread(threadId);
    this.activeSessions.delete(threadId);
  }

  addMessage(threadId: string, message: Message): Message {
    const session = this.activeSessions.get(threadId);
    if (session) {
      session.lastAccess = Date.now();
      session.messageCount++;
    }
    return message;
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values());
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
    }

    return stale;
  }

  async listAllThreads(): Promise<string[]> {
    return this.store.listThreads();
  }
}
