import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface MemoryEntry {
  id: string;
  type: string;
  content: string;
  tags: string[];
  importance: number;
  createdAt: number;
  updatedAt: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  type?: string;
  tags?: string[];
  minImportance?: number;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  close(): void;
  transaction(fn: () => void): void;
}

interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

type DatabaseConstructor = new (path: string) => Database;

let DatabaseClass: DatabaseConstructor | null = null;

try {
  const { default: Database } = await import('better-sqlite3');
  DatabaseClass = Database as unknown as DatabaseConstructor;
} catch {
  try {
    const { Database: BunDatabase } = await import('bun:sqlite');
    DatabaseClass = BunDatabase as unknown as DatabaseConstructor;
  } catch {
    // No SQLite available
  }
}

export class SQLiteStorage {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (!DatabaseClass) {
      throw new Error('No SQLite implementation available. Install better-sqlite3 or use Bun runtime.');
    }

    const dir = join(this.dbPath, '..');
    await mkdir(dir, { recursive: true });

    this.db = new DatabaseClass(this.dbPath);

    this.db.exec(`
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

  async insert(entry: MemoryEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const insertMemory = this.db.prepare(
      'INSERT OR REPLACE INTO memories (id, type, content, importance, created_at, updated_at, session_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const insertTag = this.db.prepare(
      'INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)'
    );

    const deleteTags = this.db.prepare(
      'DELETE FROM memory_tags WHERE memory_id = ?'
    );

    this.db.transaction(() => {
      deleteTags.run(entry.id);
      insertMemory.run(
        entry.id,
        entry.type,
        entry.content,
        entry.importance,
        entry.createdAt,
        entry.updatedAt,
        entry.sessionId || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null
      );

      for (const tag of entry.tags) {
        insertTag.run(entry.id, tag);
      }
    })();
  }

  async batchInsert(entries: MemoryEntry[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.transaction(() => {
      for (const entry of entries) {
        this.insertSync(entry);
      }
    })();
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT m.*, GROUP_CONCAT(mt.tag) as tags FROM memories m LEFT JOIN memory_tags mt ON m.id = mt.memory_id';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.type) {
      conditions.push('m.type = ?');
      params.push(query.type);
    }

    if (query.minImportance !== undefined) {
      conditions.push('m.importance >= ?');
      params.push(query.minImportance);
    }

    if (query.sessionId) {
      conditions.push('m.session_id = ?');
      params.push(query.sessionId);
    }

    if (query.tags && query.tags.length > 0) {
      conditions.push('mt.tag IN (' + query.tags.map(() => '?').join(',') + ')');
      params.push(...query.tags);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY m.id ORDER BY m.importance DESC, m.created_at DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    const statement = this.db.prepare(sql);
    const rows = statement.all(...params);

    return rows.map((row) => ({
      id: row.id as string,
      type: row.type as string,
      content: row.content as string,
      tags: (row.tags as string)?.split(',').filter(Boolean) || [],
      importance: row.importance as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      sessionId: row.session_id as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async getEntry(id: string): Promise<MemoryEntry | null> {
    if (!this.db) throw new Error('Database not initialized');

    const statement = this.db.prepare(
      'SELECT m.*, GROUP_CONCAT(mt.tag) as tags FROM memories m LEFT JOIN memory_tags mt ON m.id = mt.memory_id WHERE m.id = ? GROUP BY m.id'
    );

    const row = statement.get(id);
    if (!row) return null;

    return {
      id: row.id as string,
      type: row.type as string,
      content: row.content as string,
      tags: (row.tags as string)?.split(',').filter(Boolean) || [],
      importance: row.importance as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      sessionId: row.session_id as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  async updateEntry(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'tags' | 'importance' | 'metadata'>>): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.getEntry(id);
    if (!existing) return false;

    const updatedEntry: MemoryEntry = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.insert(updatedEntry);
    return true;
  }

  async deleteEntry(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const deleteMemory = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = deleteMemory.run(id);

    return result.changes > 0;
  }

  async searchByContent(query: string, limit = 10): Promise<MemoryEntry[]> {
    if (!this.db) throw new Error('Database not initialized');

    const statement = this.db.prepare(
      'SELECT m.*, GROUP_CONCAT(mt.tag) as tags FROM memories m LEFT JOIN memory_tags mt ON m.id = mt.memory_id WHERE m.content LIKE ? GROUP BY m.id ORDER BY m.importance DESC LIMIT ?'
    );

    const rows = statement.all(`%${query}%`, limit);

    return rows.map((row) => ({
      id: row.id as string,
      type: row.type as string,
      content: row.content as string,
      tags: (row.tags as string)?.split(',').filter(Boolean) || [],
      importance: row.importance as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      sessionId: row.session_id as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  async getStats(): Promise<{
    totalEntries: number;
    entriesByType: Record<string, number>;
    averageImportance: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM memories').get();
    const totalEntries = (totalRow?.count as number) || 0;

    const typeRows = this.db.prepare('SELECT type, COUNT(*) as count FROM memories GROUP BY type').all();
    const entriesByType: Record<string, number> = {};
    for (const row of typeRows) {
      entriesByType[row.type as string] = row.count as number;
    }

    const avgRow = this.db.prepare('SELECT AVG(importance) as avg FROM memories').get();
    const averageImportance = (avgRow?.avg as number) || 0;

    return {
      totalEntries,
      entriesByType,
      averageImportance,
    };
  }

  async transaction(fn: () => Promise<void>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.transaction(() => fn())();
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private insertSync(entry: MemoryEntry): void {
    if (!this.db) throw new Error('Database not initialized');

    const insertMemory = this.db.prepare(
      'INSERT OR REPLACE INTO memories (id, type, content, importance, created_at, updated_at, session_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const insertTag = this.db.prepare(
      'INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)'
    );

    const deleteTags = this.db.prepare(
      'DELETE FROM memory_tags WHERE memory_id = ?'
    );

    deleteTags.run(entry.id);
    insertMemory.run(
      entry.id,
      entry.type,
      entry.content,
      entry.importance,
      entry.createdAt,
      entry.updatedAt,
      entry.sessionId || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );

    for (const tag of entry.tags) {
      insertTag.run(entry.id, tag);
    }
  }
}

export function createSQLiteStorage(dbPath: string): SQLiteStorage {
  return new SQLiteStorage(dbPath);
}
