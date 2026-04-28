import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool } from "./tool-factory.js";
import { join } from "node:path";
import type { Database } from "bun:sqlite";

const MemorySearchInputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).default(10),
  sessionId: z.string().optional(),
});

const MemorySearchOutputSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    type: z.string(),
    content: z.string(),
    importance: z.number(),
    createdAt: z.number(),
    sessionId: z.string().optional(),
    tags: z.array(z.string()),
  })),
  total: z.number(),
  query: z.string(),
  took_ms: z.number(),
});

interface MemoryRow {
  id: string;
  type: string;
  content: string;
  importance: number;
  created_at: number;
  session_id: string | null;
  metadata: string | null;
}

interface TagRow {
  tag: string;
}

let db: Database | null = null;
let dbPath: string | null = null;

function getDb(memoryDir: string): Database {
  if (!db || dbPath !== memoryDir) {
    const { Database } = require('bun:sqlite');
    dbPath = memoryDir;
    db = new Database(join(memoryDir, "memories.db")) as Database;
  }
  return db!;
}

function initDb(memoryDir: string): void {
  const database = getDb(memoryDir);
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      session_id TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
    CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
    CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_memory_tags_memory ON memory_tags(memory_id);
  `);
}

export function createMemorySearchTools(memoryDir?: string): ToolDefinition[] {
  const effectiveMemoryDir = memoryDir || ".openflow/memory";

  const memorySearchTool = createReadOnlyTool({
    name: "MemorySearch",
    description: `Search through conversation history and stored memories. This tool searches:
- Previous conversation insights and decisions
- Learned facts and preferences
- Session summaries and observations
- Important discoveries made during work

Use this when:
- User asks about something discussed earlier in the conversation
- You need to recall information from previous sessions
- Looking for previously discovered solutions or approaches
- Searching for patterns in past work`,
    inputSchema: MemorySearchInputSchema,
    outputSchema: MemorySearchOutputSchema,
    handler: async (input) => {
      const startedAt = Date.now();

      try {
        initDb(effectiveMemoryDir);
        const database = getDb(effectiveMemoryDir);

        let sql = `SELECT DISTINCT m.id, m.type, m.content, m.importance, m.created_at, m.session_id, m.metadata
                   FROM memories m`;
        const params: (string | number)[] = [];
        const conditions: string[] = [];

        if (input.tags && input.tags.length > 0) {
          sql += ` INNER JOIN memory_tags mt ON m.id = mt.memory_id`;
          const tagPlaceholders = input.tags.map(() => "?").join(", ");
          conditions.push(`mt.tag IN (${tagPlaceholders})`);
          params.push(...input.tags);
        }

        if (input.type) {
          conditions.push("m.type = ?");
          params.push(input.type);
        }

        if (input.sessionId) {
          conditions.push("m.session_id = ?");
          params.push(input.sessionId);
        }

        if (conditions.length > 0) {
          sql += " WHERE " + conditions.join(" AND ");
        }

        const effectiveLimit = input.limit ?? 10;
        sql += ` ORDER BY m.importance DESC, m.created_at DESC LIMIT ?`;
        params.push(effectiveLimit);

        const rows = database.prepare(sql).all(...params) as MemoryRow[];

        const results = [];
        for (const row of rows) {
          const tagsRows = database.prepare(
            "SELECT tag FROM memory_tags WHERE memory_id = ?"
          ).all(row.id) as TagRow[];

          results.push({
            id: row.id,
            type: row.type,
            content: row.content,
            importance: row.importance,
            createdAt: row.created_at,
            sessionId: row.session_id || undefined,
            tags: tagsRows.map(t => t.tag),
          });
        }

        return {
          results,
          total: results.length,
          query: input.query,
          took_ms: Date.now() - startedAt,
        };
      } catch (error) {
        console.error("[MemorySearch] Error:", error);
        return {
          results: [],
          total: 0,
          query: input.query,
          took_ms: Date.now() - startedAt,
        };
      }
    },
  });

  return [memorySearchTool];
}