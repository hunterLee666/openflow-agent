export type EffectType = 'file' | 'network' | 'database' | 'process' | 'custom';

export interface SideEffect {
  id: string;
  type: EffectType;
  action: string;
  payload: unknown;
  timestamp: Date;
  status: 'pending' | 'applied' | 'failed' | 'reverted';
  retryCount?: number;
  dependencies?: string[];
}

export interface EffectHandler {
  type: EffectType;
  apply: (effect: SideEffect) => Promise<boolean>;
  revert?: (effect: SideEffect) => Promise<boolean>;
  validate?: (effect: SideEffect) => Promise<boolean>;
}

export interface EffectPolicy {
  maxRetries: number;
  retryDelayMs: number;
  autoRevert?: boolean;
  atomic?: boolean;
}

export interface EffectQueue {
  enqueue: (effect: SideEffect) => string;
  dequeue: () => SideEffect | undefined;
  peek: () => SideEffect | undefined;
  size: number;
  clear: () => void;
}

export interface SyncResult {
  applied: number;
  failed: number;
  reverted: number;
  errors: string[];
}

export interface EffectListener {
  onApplied?: (effect: SideEffect) => void;
  onFailed?: (effect: SideEffect, error: Error) => void;
  onReverted?: (effect: SideEffect) => void;
}

export interface SyncConfig {
  enabled: boolean;
  handlers: EffectHandler[];
  policy: EffectPolicy;
  enableLogging?: boolean;
  enableMetrics?: boolean;
}

export interface EffectMetrics {
  totalEffects: number;
  appliedCount: number;
  failedCount: number;
  revertedCount: number;
  averageApplyTime: number;
  typeDistribution: Map<EffectType, number>;
}