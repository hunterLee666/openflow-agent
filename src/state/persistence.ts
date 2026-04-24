export interface StateSnapshot<T = unknown> {
  id: string;
  state: T;
  timestamp: number;
  label?: string;
  checksum?: string;
}

export interface PersistenceAdapter {
  save<T>(key: string, state: T): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface RollbackConfig {
  maxSnapshots: number;
  autoSnapshot: boolean;
  snapshotIntervalMs: number;
  labels?: boolean;
}

export class LocalStorageAdapter implements PersistenceAdapter {
  constructor(private prefix: string = "openflow_state") {}

  async save<T>(key: string, state: T): Promise<void> {
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(`${this.prefix}:${key}`, serialized);
    } catch (error) {
      console.error("Failed to save state:", error);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(`${this.prefix}:${key}`);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("Failed to load state:", error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(`${this.prefix}:${key}`);
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.prefix}:`)) {
        keys.push(key.slice(this.prefix.length + 1));
      }
    }
    return keys;
  }
}

export class SessionStorageAdapter implements PersistenceAdapter {
  constructor(private prefix: string = "openflow_state") {}

  async save<T>(key: string, state: T): Promise<void> {
    try {
      const serialized = JSON.stringify(state);
      sessionStorage.setItem(`${this.prefix}:${key}`, serialized);
    } catch (error) {
      console.error("Failed to save state:", error);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    try {
      const item = sessionStorage.getItem(`${this.prefix}:${key}`);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("Failed to load state:", error);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    sessionStorage.removeItem(`${this.prefix}:${key}`);
  }

  async keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(`${this.prefix}:`)) {
        keys.push(key.slice(this.prefix.length + 1));
      }
    }
    return keys;
  }
}

export class FileSystemAdapter implements PersistenceAdapter {
  constructor(private basePath: string = "./.openflow/state") {}

  async save<T>(key: string, state: T): Promise<void> {
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname } = await import("path");
    const fullPath = `${this.basePath}/${key}.json`;
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, JSON.stringify(state, null, 2), "utf-8");
  }

  async load<T>(key: string): Promise<T | null> {
    const { readFile, access } = await import("fs/promises");
    const fullPath = `${this.basePath}/${key}.json`;
    try {
      await access(fullPath);
      const content = await readFile(fullPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    const { unlink } = await import("fs/promises");
    try {
      await unlink(`${this.basePath}/${key}.json`);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async keys(): Promise<string[]> {
    const { readdir } = await import("fs/promises");
    try {
      const files = await readdir(this.basePath);
      return files.filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));
    } catch {
      return [];
    }
  }
}

export class PersistentStateStore<T extends Record<string, unknown>> {
  private snapshots: StateSnapshot<T>[] = [];
  private listeners: Set<(state: T) => void> = new Set();
  private currentState: T;
  private persistenceAdapter?: PersistenceAdapter;
  private autoSnapshotInterval?: NodeJS.Timeout;
  private config: RollbackConfig;

  constructor(
    initialState: T,
    config: Partial<RollbackConfig> = {},
    persistenceAdapter?: PersistenceAdapter
  ) {
    this.currentState = initialState;
    this.persistenceAdapter = persistenceAdapter;
    this.config = {
      maxSnapshots: config.maxSnapshots ?? 50,
      autoSnapshot: config.autoSnapshot ?? false,
      snapshotIntervalMs: config.snapshotIntervalMs ?? 30000,
      labels: config.labels ?? true,
    };

    if (this.config.autoSnapshot) {
      this.startAutoSnapshot();
    }
  }

  getState(): T {
    return this.currentState;
  }

  setState(newState: T, label?: string): void {
    const previousState = this.currentState;
    this.currentState = newState;

    if (this.config.labels && label) {
      this.createSnapshot(label);
    }

    this.notifyListeners();

    if (this.persistenceAdapter) {
      this.persistenceAdapter.save("current", newState).catch(console.error);
    }
  }

  updateState(updater: (prev: T) => T, label?: string): void {
    const newState = updater(this.currentState);
    this.setState(newState, label);
  }

  createSnapshot(label?: string): StateSnapshot<T> {
    const snapshot: StateSnapshot<T> = {
      id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      state: this.deepClone(this.currentState),
      timestamp: Date.now(),
      label,
      checksum: this.computeChecksum(this.currentState),
    };

    this.snapshots.push(snapshot);

    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots);
    }

    return snapshot;
  }

  rollback(snapshotId?: string): T | null {
    if (snapshotId) {
      const snapshot = this.snapshots.find(s => s.id === snapshotId);
      if (snapshot) {
        this.currentState = this.deepClone(snapshot.state);
        this.notifyListeners();
        return this.currentState;
      }
      return null;
    }

    if (this.snapshots.length < 2) {
      return null;
    }

    const previousSnapshot = this.snapshots[this.snapshots.length - 2];
    this.currentState = this.deepClone(previousSnapshot.state);
    this.snapshots.pop();
    this.notifyListeners();
    return this.currentState;
  }

  getSnapshots(): StateSnapshot<T>[] {
    return [...this.snapshots];
  }

  getSnapshot(id: string): StateSnapshot<T> | undefined {
    return this.snapshots.find(s => s.id === id);
  }

  deleteSnapshot(id: string): boolean {
    const index = this.snapshots.findIndex(s => s.id === id);
    if (index !== -1) {
      this.snapshots.splice(index, 1);
      return true;
    }
    return false;
  }

  subscribe(listener: (state: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async loadPersistedState(): Promise<boolean> {
    if (!this.persistenceAdapter) {
      return false;
    }

    try {
      const saved = await this.persistenceAdapter.load<T>("current");
      if (saved) {
        this.currentState = saved;
        this.notifyListeners();
        return true;
      }
    } catch (error) {
      console.error("Failed to load persisted state:", error);
    }
    return false;
  }

  async clearPersistedState(): Promise<void> {
    if (this.persistenceAdapter) {
      await this.persistenceAdapter.remove("current");
    }
  }

  startAutoSnapshot(): void {
    if (this.autoSnapshotInterval) {
      return;
    }

    this.autoSnapshotInterval = setInterval(() => {
      this.createSnapshot("auto");
    }, this.config.snapshotIntervalMs);
  }

  stopAutoSnapshot(): void {
    if (this.autoSnapshotInterval) {
      clearInterval(this.autoSnapshotInterval);
      this.autoSnapshotInterval = undefined;
    }
  }

  destroy(): void {
    this.stopAutoSnapshot();
    this.listeners.clear();
    this.snapshots = [];
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error("State listener error:", error);
      }
    }
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  private computeChecksum(state: T): string {
    const str = JSON.stringify(state);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

export function createPersistentStore<T extends Record<string, unknown>>(
  initialState: T,
  config?: Partial<RollbackConfig>,
  persistenceAdapter?: PersistenceAdapter
): PersistentStateStore<T> {
  return new PersistentStateStore(initialState, config, persistenceAdapter);
}

export class StateDiffCalculator {
  static diff<T extends Record<string, unknown>>(
    prev: T,
    next: T
  ): Array<{ key: string; prev: unknown; next: unknown }> {
    const changes: Array<{ key: string; prev: unknown; next: unknown }> = [];
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const key of allKeys) {
      const prevValue = prev[key];
      const nextValue = next[key];

      if (!this.deepEqual(prevValue, nextValue)) {
        changes.push({ key, prev: prevValue, next: nextValue });
      }
    }

    return changes;
  }

  static patch<T extends Record<string, unknown>>(
    base: T,
    changes: Array<{ key: string; value: unknown }>
  ): T {
    const result = { ...base };
    for (const change of changes) {
      result[change.key as keyof T] = change.value as T[keyof T];
    }
    return result;
  }

  private static deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object" || a === null || b === null) return false;

    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }
}
