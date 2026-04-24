import type {
  StateChange,
  StateKey,
  StateListener,
  StateManagerConfig,
  StateMigration,
  StateSnapshot,
  StateTransaction,
  StateValue,
} from './types';

function generateTransactionId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateListenerId(): string {
  return `listener_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class AppState {
  private readonly config: StateManagerConfig;
  private store: Map<string, StateValue> = new Map();
  private listeners: Map<string, StateListener> = new Map();
  private changeHistory: StateChange[] = [];
  private transactions: Map<string, StateTransaction> = new Map();
  private currentTransaction?: StateTransaction;
  private version = 0;

  constructor(config: StateManagerConfig) {
    this.config = config;
  }

  private keyToString(key: StateKey): string {
    if (key.scope === 'global') {
      return `global:${key.key}`;
    }
    if (key.scope === 'session') {
      return `session:${key.key}`;
    }
    if (key.scope === 'agent' && key.agentId) {
      return `agent:${key.agentId}:${key.key}`;
    }
    if (key.scope === 'task' && key.taskId) {
      return `task:${key.taskId}:${key.key}`;
    }
    return key.key;
  }

  get<T>(key: StateKey): T | undefined {
    const value = this.store.get(this.keyToString(key));
    return value?.value as T | undefined;
  }

  set<T>(key: StateKey, value: T, priority: 'high' | 'normal' | 'low' = 'normal'): void {
    const keyStr = this.keyToString(key);
    const previousValue = this.store.get(keyStr);
    const newValue: StateValue<T> = {
      value,
      version: this.version++,
      timestamp: new Date(),
      scope: key.scope,
      priority,
    };

    this.store.set(keyStr, newValue as StateValue);

    const change: StateChange<T> = {
      key,
      previousValue: previousValue?.value as T,
      newValue: value,
      reason: 'set',
      timestamp: new Date(),
    };

    if (this.currentTransaction) {
      this.currentTransaction.changes.push(change);
    } else {
      this.applyChange(change);
    }
  }

  delete(key: StateKey): boolean {
    const keyStr = this.keyToString(key);
    const existing = this.store.get(keyStr);
    if (!existing) return false;

    const change: StateChange = {
      key,
      previousValue: existing.value,
      newValue: undefined as unknown as typeof existing.value,
      reason: 'delete',
      timestamp: new Date(),
    };

    this.store.delete(keyStr);

    if (this.currentTransaction) {
      this.currentTransaction.changes.push(change);
    } else {
      this.applyChange(change);
    }

    return true;
  }

  has(key: StateKey): boolean {
    return this.store.has(this.keyToString(key));
  }

  clear(): void {
    this.store.clear();
  }

  snapshot(): StateSnapshot {
    return {
      timestamp: new Date(),
      scope: this.config.scope,
      values: new Map(this.store),
    };
  }

  history(limit?: number): StateChange[] {
    if (limit) {
      return this.changeHistory.slice(-limit);
    }
    return [...this.changeHistory];
  }

  addListener<T>(listener: Omit<StateListener<T>, 'id'>): string {
    const id = generateListenerId();
    this.listeners.set(id, listener as StateListener);
    return id;
  }

  removeListener(id: string): boolean {
    return this.listeners.delete(id);
  }

  beginTransaction(): string {
    const id = generateTransactionId();
    this.currentTransaction = {
      id,
      changes: [],
      status: 'pending',
      startTime: new Date(),
    };
    this.transactions.set(id, this.currentTransaction);
    return id;
  }

  commitTransaction(id: string): boolean {
    const transaction = this.transactions.get(id);
    if (!transaction || transaction.status !== 'pending') {
      return false;
    }

    for (const change of transaction.changes) {
      this.applyChange(change);
    }

    transaction.status = 'committed';
    transaction.endTime = new Date();
    this.currentTransaction = undefined;
    return true;
  }

  rollbackTransaction(id: string): boolean {
    const transaction = this.transactions.get(id);
    if (!transaction || transaction.status !== 'pending') {
      return false;
    }

    for (const change of [...transaction.changes].reverse()) {
      const keyStr = this.keyToString(change.key);
      if (change.previousValue !== undefined) {
        this.store.set(keyStr, {
          value: change.previousValue,
          version: this.version++,
          timestamp: new Date(),
          scope: change.key.scope,
          priority: 'normal',
        });
      } else {
        this.store.delete(keyStr);
      }
    }

    transaction.status = 'rolledback';
    transaction.endTime = new Date();
    this.currentTransaction = undefined;
    return true;
  }

  private applyChange<T>(change: StateChange<T>): void {
    this.changeHistory.push(change);

    if (this.config.enableHistory) {
      const maxHistory = this.config.maxHistorySize || 1000;
      if (this.changeHistory.length > maxHistory) {
        this.changeHistory = this.changeHistory.slice(-maxHistory);
      }
    }

    for (const [, listener] of this.listeners) {
      if (listener.type === 'change') {
        if (!listener.scope || listener.scope === change.key.scope) {
          if (!listener.filter || listener.filter(change)) {
            listener.callback(change);
          }
        }
      }
    }
  }

  migrate(): void {
    if (!this.config.migrations || this.config.migrations.length === 0) {
      return;
    }

    const sortedMigrations = [...this.config.migrations].sort((a, b) => a.fromVersion - b.fromVersion);

    for (const migration of sortedMigrations) {
      if (this.version >= migration.fromVersion && this.version < migration.toVersion) {
        const snapshot = this.snapshot();
        const stateObject: Record<string, unknown> = {};

        for (const [key, value] of snapshot.values) {
          stateObject[key] = value.value;
        }

        const migrated = migration.migrate(stateObject);

        for (const [keyStr, value] of Object.entries(migrated)) {
          const keyParts = keyStr.split(':');
          const key: StateKey = {
            scope: keyParts[0] as 'global' | 'session' | 'agent' | 'task',
            key: keyParts[keyParts.length - 1],
          };
          if (keyParts[0] === 'agent' && keyParts.length > 2) {
            key.agentId = keyParts[1];
          }
          if (keyParts[0] === 'task' && keyParts.length > 2) {
            key.taskId = keyParts[1];
          }
          this.store.set(keyStr, {
            value,
            version: this.version++,
            timestamp: new Date(),
            scope: key.scope,
            priority: 'normal',
          });
        }
      }
    }
  }

  getVersion(): number {
    return this.version;
  }

  getScope(): 'global' | 'session' | 'agent' | 'task' {
    return this.config.scope;
  }

  getAllKeys(): StateKey[] {
    const keys: StateKey[] = [];
    for (const keyStr of this.store.keys()) {
      const keyParts = keyStr.split(':');
      const key: StateKey = {
        scope: keyParts[0] as 'global' | 'session' | 'agent' | 'task',
        key: keyParts[keyParts.length - 1],
      };
      if (keyParts[0] === 'agent' && keyParts.length > 2) {
        key.agentId = keyParts[1];
      }
      if (keyParts[0] === 'task' && keyParts.length > 2) {
        key.taskId = keyParts[1];
      }
      keys.push(key);
    }
    return keys;
  }
}

export function createAppState(config: StateManagerConfig): AppState {
  return new AppState(config);
}

export const GLOBAL_STATE = createAppState({ scope: 'global', enableHistory: true, maxHistorySize: 500 });

export function createAgentState(agentId: string): AppState {
  return createAppState({
    scope: 'agent',
    agentId,
    enableHistory: true,
    maxHistorySize: 200,
  });
}

export function createTaskState(taskId: string): AppState {
  return createAppState({
    scope: 'task',
    taskId,
    enableHistory: false,
  });
}