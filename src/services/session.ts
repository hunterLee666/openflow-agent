import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Message, SessionStore } from "../types/index.js";
import { APP_SESSIONS_DIR } from "../utils/paths.js";

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
    return JSON.parse(data) as Message[];
  }

  async saveMessages(threadId: string, messages: Message[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.threadPath(threadId), JSON.stringify(messages, null, 2));
  }
}
