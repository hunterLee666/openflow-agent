export type StateScope = 'global' | 'session' | 'agent' | 'task';
export type StatePriority = 'high' | 'normal' | 'low';
export type ListenerType = 'change' | 'error' | 'warning';

export interface StateKey {
  scope: StateScope;
  agentId?: string;
  taskId?: string;
  key: string;
}

export interface StateValue<T = unknown> {
  value: T;
  version: number;
  timestamp: Date;
  scope: StateScope;
  priority: StatePriority;
  metadata?: Record<string, unknown>;
}

export interface StateChange<T = unknown> {
  key: StateKey;
  previousValue?: T;
  newValue: T;
  reason: string;
  timestamp: Date;
}

export interface StateListener<T = unknown> {
  id: string;
  type: ListenerType;
  filter?: (change: StateChange<T>) => boolean;
  callback: (change: StateChange<T>) => void | Promise<void>;
  scope?: StateScope;
}

export interface StateSnapshot {
  timestamp: Date;
  scope: StateScope;
  values: Map<string, StateValue>;
}

export interface StateMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (state: Record<string, unknown>) => Record<string, unknown>;
}

export interface StateConstraint {
  name: string;
  validate: (value: unknown) => boolean;
  errorMessage: string;
}

export interface StateTransaction {
  id: string;
  changes: StateChange[];
  status: 'pending' | 'committed' | 'rolledback';
  startTime: Date;
  endTime?: Date;
}

export interface StateManagerConfig {
  scope: StateScope;
  agentId?: string;
  taskId?: string;
  migrations?: StateMigration[];
  constraints?: StateConstraint[];
  enableHistory?: boolean;
  maxHistorySize?: number;
}

export interface AppStateStore {
  get<T>(key: StateKey): T | undefined;
  set<T>(key: StateKey, value: T, priority?: StatePriority): void;
  delete(key: StateKey): boolean;
  has(key: StateKey): boolean;
  clear(scope?: StateScope): void;
  snapshot(): StateSnapshot;
  history(limit?: number): StateChange[];
}

export interface StateMetrics {
  totalKeys: number;
  scopeDistribution: Map<StateScope, number>;
  changeFrequency: Map<string, number>;
  averageVersion: number;
}