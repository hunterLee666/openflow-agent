import type {
  EffectHandler,
  EffectListener,
  EffectMetrics,
  EffectPolicy,
  EffectQueue,
  EffectType,
  SideEffect,
  SyncConfig,
  SyncResult,
} from './types';

function generateEffectId(): string {
  return `effect_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class EffectQueueImpl implements EffectQueue {
  private queue: SideEffect[] = [];
  private pending: Map<string, SideEffect> = new Map();

  enqueue(effect: SideEffect): string {
    this.queue.push(effect);
    this.pending.set(effect.id, effect);
    return effect.id;
  }

  dequeue(): SideEffect | undefined {
    const effect = this.queue.shift();
    if (effect) {
      this.pending.delete(effect.id);
    }
    return effect;
  }

  peek(): SideEffect | undefined {
    return this.queue[0];
  }

  get size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.pending.clear();
  }

  has(id: string): boolean {
    return this.pending.has(id);
  }
}

export class SideEffectSynchronizer {
  private readonly config: SyncConfig;
  private readonly queue: EffectQueueImpl;
  private readonly handlers: Map<EffectType, EffectHandler>;
  private appliedEffects: SideEffect[] = [];
  private listeners: Set<EffectListener> = new Set();
  private metrics: EffectMetrics;
  private processing = false;

  constructor(config: SyncConfig) {
    this.config = config;
    this.queue = new EffectQueueImpl();
    this.handlers = new Map();
    for (const handler of config.handlers) {
      this.handlers.set(handler.type, handler);
    }
    this.metrics = {
      totalEffects: 0,
      appliedCount: 0,
      failedCount: 0,
      revertedCount: 0,
      averageApplyTime: 0,
      typeDistribution: new Map(),
    };
  }

  async apply(effect: Omit<SideEffect, 'id' | 'timestamp' | 'status'>): Promise<string> {
    const fullEffect: SideEffect = {
      ...effect,
      id: generateEffectId(),
      timestamp: new Date(),
      status: 'pending',
    };

    this.metrics.totalEffects++;
    const typeCount = this.metrics.typeDistribution.get(effect.type) || 0;
    this.metrics.typeDistribution.set(effect.type, typeCount + 1);

    if (this.config.policy.atomic) {
      return this.applyAtomic(fullEffect);
    }

    return this.queue.enqueue(fullEffect);
  }

  private async applyAtomic(effect: SideEffect): Promise<string> {
    const handler = this.handlers.get(effect.type);
    if (!handler) {
      throw new Error(`No handler for effect type: ${effect.type}`);
    }

    if (handler.validate) {
      const valid = await handler.validate(effect);
      if (!valid) {
        effect.status = 'failed';
        return effect.id;
      }
    }

    const success = await handler.apply(effect);

    if (success) {
      effect.status = 'applied';
      this.appliedEffects.push(effect);
      this.metrics.appliedCount++;
      this.notifyListeners('onApplied', effect);
    } else {
      effect.status = 'failed';
      this.metrics.failedCount++;
      this.notifyListeners('onFailed', effect, new Error('Apply returned false'));
    }

    return effect.id;
  }

  async processQueue(): Promise<SyncResult> {
    if (this.processing) {
      return { applied: 0, failed: 0, reverted: 0, errors: ['Queue is already being processed'] };
    }

    this.processing = true;
    const result: SyncResult = { applied: 0, failed: 0, reverted: 0, errors: [] };

    while (this.queue.size > 0) {
      const effect = this.queue.dequeue();
      if (!effect) break;

      const processResult = await this.processEffect(effect);

      if (processResult.success) {
        result.applied++;
      } else {
        result.failed++;
        if (processResult.error) {
          result.errors.push(processResult.error);
        }
      }
    }

    this.processing = false;
    return result;
  }

  private async processEffect(effect: SideEffect): Promise<{ success: boolean; error?: string }> {
    const handler = this.handlers.get(effect.type);
    if (!handler) {
      return { success: false, error: `No handler for effect type: ${effect.type}` };
    }

    if (handler.validate) {
      try {
        const valid = await handler.validate(effect);
        if (!valid) {
          return { success: false, error: 'Validation failed' };
        }
      } catch (error) {
        return { success: false, error: `Validation error: ${error}` };
      }
    }

    const startTime = Date.now();

    try {
      const success = await handler.apply(effect);

      if (success) {
        effect.status = 'applied';
        this.appliedEffects.push(effect);
        this.metrics.appliedCount++;

        const applyTime = Date.now() - startTime;
        this.metrics.averageApplyTime =
          (this.metrics.averageApplyTime * (this.metrics.appliedCount - 1) + applyTime) /
          this.metrics.appliedCount;

        this.notifyListeners('onApplied', effect);
        return { success: true };
      } else {
        return await this.handleFailure(effect, 'Apply returned false');
      }
    } catch (error) {
      return await this.handleFailure(effect, `Apply error: ${error}`);
    }
  }

  private async handleFailure(effect: SideEffect, errorMessage: string): Promise<{ success: boolean; error?: string }> {
    effect.retryCount = (effect.retryCount || 0) + 1;

    if (effect.retryCount < this.config.policy.maxRetries) {
      await new Promise(resolve => setTimeout(resolve, this.config.policy.retryDelayMs));
      this.queue.enqueue(effect);
      return { success: false, error: errorMessage };
    }

    effect.status = 'failed';
    this.metrics.failedCount++;
    this.notifyListeners('onFailed', effect, new Error(errorMessage));

    if (this.config.policy.autoRevert) {
      const handler = this.handlers.get(effect.type);
      if (handler?.revert) {
        const reverted = await this.revert(effect);
        if (reverted) {
          return { success: false, error: `${errorMessage} (reverted)` };
        }
      }
    }

    return { success: false, error: errorMessage };
  }

  async revert(effect: SideEffect): Promise<boolean> {
    const handler = this.handlers.get(effect.type);
    if (!handler || !handler.revert) {
      return false;
    }

    try {
      const success = await handler.revert(effect);
      if (success) {
        effect.status = 'reverted';
        this.metrics.revertedCount++;
        this.notifyListeners('onReverted', effect);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async revertAll(): Promise<number> {
    let reverted = 0;

    for (const effect of [...this.appliedEffects].reverse()) {
      const success = await this.revert(effect);
      if (success) {
        reverted++;
      }
    }

    return reverted;
  }

  addListener(listener: EffectListener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: EffectListener): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(
    method: 'onApplied' | 'onFailed' | 'onReverted',
    effect: SideEffect,
    error?: Error
  ): void {
    for (const listener of this.listeners) {
      if (method === 'onApplied' && listener.onApplied) {
        listener.onApplied(effect);
      } else if (method === 'onFailed' && listener.onFailed && error) {
        listener.onFailed(effect, error);
      } else if (method === 'onReverted' && listener.onReverted) {
        listener.onReverted(effect);
      }
    }
  }

  getMetrics(): EffectMetrics {
    return { ...this.metrics };
  }

  getAppliedEffects(): SideEffect[] {
    return [...this.appliedEffects];
  }

  getPendingEffects(): SideEffect[] {
    return [...this.queue['queue']];
  }

  clear(): void {
    this.queue.clear();
    this.appliedEffects = [];
  }
}

export function createSynchronizer(config: SyncConfig): SideEffectSynchronizer {
  return new SideEffectSynchronizer(config);
}