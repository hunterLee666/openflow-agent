export interface Store<T> {
  get(): T;
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  subscribe(listener: (value: T) => void): () => void;
}

export interface Memdir {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export interface History<T> {
  push(entry: T): void;
  undo(): T | undefined;
  redo(): T | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  getAll(): T[];
}

export interface Migration {
  version: number;
  name: string;
  up(state: unknown): unknown;
}

export interface MigrationManager {
  register(migration: Migration): void;
  migrate(state: unknown, fromVersion: number): unknown;
  currentVersion(): number;
}
