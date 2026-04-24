import type { Store, Memdir, History, MigrationManager, Migration } from "./types.js";

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => value,
    set: (newValue: T) => {
      value = newValue;
      for (const listener of listeners) {
        listener(value);
      }
    },
    update: (updater: (prev: T) => T) => {
      value = updater(value);
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe: (listener: (value: T) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export class FileMemdir implements Memdir {
  private cache = new Map<string, string>();

  constructor(private basePath: string) {}

  async read(path: string): Promise<string | null> {
    const fullPath = `${this.basePath}/${path}`;
    if (this.cache.has(fullPath)) {
      return this.cache.get(fullPath)!;
    }
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(fullPath, "utf-8");
      this.cache.set(fullPath, content);
      return content;
    } catch {
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    const fullPath = `${this.basePath}/${path}`;
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    this.cache.set(fullPath, content);
  }

  async list(dir: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    try {
      return await readdir(`${this.basePath}/${dir}`);
    } catch {
      return [];
    }
  }

  async exists(path: string): Promise<boolean> {
    const { access } = await import("node:fs/promises");
    try {
      await access(`${this.basePath}/${path}`);
      return true;
    } catch {
      return false;
    }
  }
}

export function createHistory<T>(limit = 100): History<T> {
  const entries: T[] = [];
  let index = -1;

  return {
    push: (entry: T) => {
      if (index < entries.length - 1) {
        entries.splice(index + 1);
      }
      entries.push(entry);
      if (entries.length > limit) {
        entries.shift();
      } else {
        index++;
      }
    },
    undo: () => {
      if (index > 0) {
        index--;
        return entries[index];
      }
      return undefined;
    },
    redo: () => {
      if (index < entries.length - 1) {
        index++;
        return entries[index];
      }
      return undefined;
    },
    canUndo: () => index > 0,
    canRedo: () => index < entries.length - 1,
    getAll: () => [...entries],
  };
}

export class DefaultMigrationManager implements MigrationManager {
  private migrations: Migration[] = [];

  register(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  migrate(state: unknown, fromVersion: number): unknown {
    let current = state;
    for (const migration of this.migrations) {
      if (migration.version > fromVersion) {
        current = migration.up(current);
        fromVersion = migration.version;
      }
    }
    return current;
  }

  currentVersion(): number {
    if (this.migrations.length === 0) return 0;
    return this.migrations[this.migrations.length - 1].version;
  }
}
