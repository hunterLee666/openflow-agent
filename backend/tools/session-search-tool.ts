import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool } from "./tool-factory.js";
import { join } from "node:path";
import type { Database } from "bun:sqlite";

const SessionSearchInputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  limit: z.number().int().positive().max(20).default(5),
  sessionId: z.string().optional(),
});

const SessionSearchOutputSchema = z.object({
  results: z.array(z.object({
    sessionId: z.string(),
    summary: z.string().optional(),
    startedAt: z.number(),
    endedAt: z.number().optional(),
    matchedEvents: z.array(z.object({
      type: z.string(),
      content: z.string(),
      timestamp: z.number(),
    })),
    relevanceScore: z.number(),
  })),
  total: z.number(),
  query: z.string(),
  took_ms: z.number(),
});

let db: Database | null = null;
let dbPath: string | null = null;

function getDb(sessionDir: string): Database {
  if (!db || dbPath !== sessionDir) {
    const { Database } = require('bun:sqlite');
    dbPath = sessionDir;
    db = new Database(join(sessionDir, "sessions.db")) as Database;
  }
  return db!;
}

function initDb(sessionDir: string): void {
  const database = getDb(sessionDir);
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      summary TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_content ON session_events(content);
  `);
}

function simpleMatchScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/);

  let score = 0;
  for (const word of words) {
    if (lowerText.includes(word)) {
      score += 1;
      if (lowerText.startsWith(word)) {
        score += 0.5;
      }
    }
  }

  return score / (words.length + 1);
}

export function createSessionSearchTools(sessionDir?: string): ToolDefinition[] {
  const effectiveSessionDir = sessionDir || ".openflow/sessions";

  const sessionSearchTool = createReadOnlyTool({
    name: "SessionSearch",
    description: `Search across all previous conversation sessions. This tool finds:
- Previous sessions related to a topic
- Past solutions and approaches used
- User preferences expressed in earlier conversations
- Historical context for ongoing tasks

Use this when:
- User asks about something discussed in a previous session
- You need context from past conversations
- Starting a new task that may relate to previous work
- User wants to resume a previous conversation topic`,
    inputSchema: SessionSearchInputSchema,
    outputSchema: SessionSearchOutputSchema,
    handler: async (input) => {
      const startedAt = Date.now();

      try {
        initDb(effectiveSessionDir);
        const database = getDb(effectiveSessionDir);

        const effectiveLimit = input.limit ?? 5;

        let sessionsQuery = `SELECT id, started_at, ended_at, summary, metadata FROM sessions`;
        const params: (string | number)[] = [];

        if (input.sessionId) {
          sessionsQuery += ` WHERE id = ?`;
          params.push(input.sessionId);
        }

        sessionsQuery += ` ORDER BY started_at DESC LIMIT ?`;
        params.push(effectiveLimit * 2);

        const sessionRows = database.prepare(sessionsQuery).all(...params) as Array<{
          id: string;
          started_at: number;
          ended_at: number | null;
          summary: string | null;
          metadata: string | null;
        }>;

        const results: Array<{
          sessionId: string;
          summary: string | undefined;
          startedAt: number;
          endedAt: number | undefined;
          matchedEvents: Array<{ type: string; content: string; timestamp: number }>;
          relevanceScore: number;
        }> = [];

        for (const session of sessionRows) {
          const eventsQuery = input.sessionId
            ? `SELECT type, content, timestamp FROM session_events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 20`
            : `SELECT type, content, timestamp FROM session_events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 20`;

          const eventRows = database.prepare(eventsQuery).all(session.id) as Array<{
            type: string;
            content: string;
            timestamp: number;
          }>;

          let maxScore = 0;

          if (session.summary) {
            maxScore = Math.max(maxScore, simpleMatchScore(session.summary, input.query) * 1.5);
          }

          const matchedEvents: Array<{ type: string; content: string; timestamp: number }> = [];
          for (const event of eventRows) {
            const score = simpleMatchScore(event.content, input.query);
            if (score > 0.1) {
              matchedEvents.push({
                type: event.type,
                content: event.content.length > 500 ? event.content.slice(0, 500) + "..." : event.content,
                timestamp: event.timestamp,
              });
              maxScore = Math.max(maxScore, score);
            }
          }

          if (maxScore > 0) {
            results.push({
              sessionId: session.id,
              summary: session.summary || undefined,
              startedAt: session.started_at,
              endedAt: session.ended_at || undefined,
              matchedEvents: matchedEvents.slice(0, 5),
              relevanceScore: Math.min(1, maxScore),
            });
          }

          if (results.length >= effectiveLimit) {
            break;
          }
        }

        results.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return {
          results: results.slice(0, effectiveLimit),
          total: results.length,
          query: input.query,
          took_ms: Date.now() - startedAt,
        };
      } catch (error) {
        console.error("[SessionSearch] Error:", error);
        return {
          results: [],
          total: 0,
          query: input.query,
          took_ms: Date.now() - startedAt,
        };
      }
    },
  });

  return [sessionSearchTool];
}