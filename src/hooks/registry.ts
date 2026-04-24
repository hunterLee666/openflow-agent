import {
  type HookEvent,
  type HookFn,
  type HookRegistration,
  type HookExecutionResult,
  type HookContext,
  type HookResult,
  HOOK_EVENTS,
  createHookId,
  isAllowed,
  isDenied,
} from './types.js';

export interface HookRegistryConfig {
  defaultTimeout?: number;
  enableParallelExecution?: boolean;
  maxConcurrentHooks?: number;
}

export class HookRegistry {
  private hooks: Map<HookEvent, Set<HookRegistration>> = new Map();
  private sessionHooks: Map<string, Set<HookRegistration>> = new Map();
  private config: Required<HookRegistryConfig>;
  private globalEnabled: boolean = true;

  constructor(config: HookRegistryConfig = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000,
      enableParallelExecution: config.enableParallelExecution ?? true,
      maxConcurrentHooks: config.maxConcurrentHooks ?? 10,
    };

    for (const event of HOOK_EVENTS) {
      this.hooks.set(event, new Set());
    }
  }

  register(
    event: HookEvent,
    fn: HookFn,
    options: {
      id?: string;
      source?: HookRegistration['source'];
      timeout?: number;
      sessionId?: string;
      enabled?: boolean;
    } = {}
  ): string {
    const id = options.id ?? createHookId(event.toLowerCase());
    const registration: HookRegistration = {
      id,
      event,
      fn,
      source: options.source ?? 'builtin',
      timeout: options.timeout ?? this.config.defaultTimeout,
      enabled: options.enabled ?? true,
    };

    if (options.sessionId) {
      this.registerSessionHook(options.sessionId, registration);
    } else {
      this.hooks.get(event)?.add(registration);
    }

    return id;
  }

  private registerSessionHook(sessionId: string, registration: HookRegistration): void {
    if (!this.sessionHooks.has(sessionId)) {
      this.sessionHooks.set(sessionId, new Set());
    }
    this.sessionHooks.get(sessionId)!.add(registration);
  }

  unregister(hookId: string, sessionId?: string): boolean {
    if (sessionId) {
      const sessionHookSet = this.sessionHooks.get(sessionId);
      if (sessionHookSet) {
        for (const hook of sessionHookSet) {
          if (hook.id === hookId) {
            sessionHookSet.delete(hook);
            return true;
          }
        }
      }
      return false;
    }

    for (const hookSet of this.hooks.values()) {
      for (const hook of hookSet) {
        if (hook.id === hookId) {
          hookSet.delete(hook);
          return true;
        }
      }
    }
    return false;
  }

  async execute(
    event: HookEvent,
    context: HookContext,
    options: {
      sessionId?: string;
      timeout?: number;
      stopOnDeny?: boolean;
    } = {}
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    if (!this.globalEnabled) {
      return results;
    }

    const hooks = this.getHooksForEvent(event, options.sessionId);
    const timeout = options.timeout ?? this.config.defaultTimeout;

    for (const hook of hooks) {
      if (!hook.enabled) continue;

      const startTime = Date.now();
      try {
        const result = await this.executeHookWithTimeout(hook, context, timeout);

        if (isDenied(result) && options.stopOnDeny) {
          results.push({
            hookId: hook.id,
            success: false,
            result,
            durationMs: Date.now() - startTime,
          });
          break;
        }

        results.push({
          hookId: hook.id,
          success: true,
          result,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          hookId: hook.id,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  private async executeHookWithTimeout(
    hook: HookRegistration,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook ${hook.id} timed out after ${timeout}ms`));
      }, timeout);

      Promise.resolve(hook.fn(context))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private getHooksForEvent(event: HookEvent, sessionId?: string): HookRegistration[] {
    const eventHooks = this.hooks.get(event) ?? new Set();
    const sessionHookSet = sessionId ? this.sessionHooks.get(sessionId) : undefined;

    const allHooks: HookRegistration[] = [];
    for (const hook of eventHooks) {
      allHooks.push(hook);
    }

    if (sessionHookSet) {
      for (const hook of sessionHookSet) {
        if (hook.event === event) {
          allHooks.push(hook);
        }
      }
    }

    return allHooks.sort((a, b) => {
      const sourceOrder = { builtin: 0, agent: 1, shell: 2, http: 3 };
      return sourceOrder[a.source] - sourceOrder[b.source];
    });
  }

  getHooks(event?: HookEvent): HookRegistration[] {
    if (event) {
      return Array.from(this.hooks.get(event) ?? []);
    }

    const allHooks: HookRegistration[] = [];
    for (const hookSet of this.hooks.values()) {
      for (const hook of hookSet) {
        allHooks.push(hook);
      }
    }
    return allHooks;
  }

  dispatch(
    event: HookEvent,
    context: HookContext,
    options?: {
      sessionId?: string;
      timeout?: number;
      stopOnDeny?: boolean;
    }
  ): Promise<HookExecutionResult[]> {
    return this.execute(event, context, options);
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.sessionHooks.delete(sessionId);
    } else {
      for (const hookSet of this.hooks.values()) {
        hookSet.clear();
      }
    }
  }

  enable(hookId?: string): void {
    if (hookId) {
      this.setHookEnabled(hookId, true);
    } else {
      this.globalEnabled = true;
    }
  }

  disable(hookId?: string): void {
    if (hookId) {
      this.setHookEnabled(hookId, false);
    } else {
      this.globalEnabled = false;
    }
  }

  private setHookEnabled(hookId: string, enabled: boolean): void {
    for (const hookSet of this.hooks.values()) {
      for (const hook of hookSet) {
        if (hook.id === hookId) {
          hook.enabled = enabled;
          return;
        }
      }
    }
    for (const sessionHookSet of this.sessionHooks.values()) {
      for (const hook of sessionHookSet) {
        if (hook.id === hookId) {
          hook.enabled = enabled;
          return;
        }
      }
    }
  }
}

export const defaultHookRegistry = new HookRegistry();
