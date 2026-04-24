import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EpisodicMemory, EpisodicEvent } from "./types.js";
import { APP_EPISODES_DIR } from "../utils/paths.js";

export class FileEpisodicMemory implements EpisodicMemory {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || APP_EPISODES_DIR;
  }

  private sessionPath(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.jsonl`);
  }

  async record(event: EpisodicEvent): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    const line = JSON.stringify(event) + "\n";
    await writeFile(this.sessionPath(event.sessionId), line, { flag: "a" });
  }

  async retrieve(query: string, limit = 10): Promise<EpisodicEvent[]> {
    const events: EpisodicEvent[] = [];
    // Simple keyword-based retrieval
    const keywords = query.toLowerCase().split(/\s+/);

    // Read all session files
    const files = await this.listSessionFiles();
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as EpisodicEvent;
          const text = `${event.type} ${event.content}`.toLowerCase();
          const score = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
          if (score > 0) {
            events.push({ ...event, _score: score } as EpisodicEvent & { _score: number });
          }
        } catch {
          // skip malformed
        }
      }
    }

    return events
      .sort((a, b) => (b as unknown as { _score: number })._score - (a as unknown as { _score: number })._score)
      .slice(0, limit)
      .map((e) => {
        const { _score, ...rest } = e as unknown as { _score: number } & EpisodicEvent;
        return rest;
      });
  }

  async summarize(sessionId: string): Promise<string> {
    const path = this.sessionPath(sessionId);
    if (!existsSync(path)) return "No events recorded.";

    const content = await readFile(path, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l) as EpisodicEvent);

    const userMessages = events.filter((e) => e.type === "user_message").length;
    const toolUses = events.filter((e) => e.type === "tool_use").length;
    const errors = events.filter((e) => e.type === "error").length;
    const completions = events.filter((e) => e.type === "completion").length;

    return `Session ${sessionId}: ${userMessages} user messages, ${toolUses} tool calls, ${errors} errors, ${completions} completions.`;
  }

  private async listSessionFiles(): Promise<string[]> {
    if (!existsSync(this.baseDir)) return [];
    const entries = await readdir(this.baseDir);
    return entries.filter((f) => f.endsWith(".jsonl")).map((f) => join(this.baseDir, f));
  }
}

import { readdir } from "node:fs/promises";
