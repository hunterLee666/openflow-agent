export type LifecycleHookEvent =
  | "appStart"
  | "appStop"
  | "sessionStart"
  | "sessionEnd"
  | "sessionPause"
  | "sessionResume"
  | "userPromptSubmit"
  | "userPromptReceive"
  | "preToolExecution"
  | "postToolExecution"
  | "toolError"
  | "preAgentExecution"
  | "postAgentExecution"
  | "agentError"
  | "permissionRequest"
  | "permissionGranted"
  | "permissionDenied"
  | "streamStart"
  | "streamChunk"
  | "streamEnd"
  | "error"
  | "retry"
  | "circuitOpen"
  | "circuitClose"
  | "configChange"
  | "healthCheck";

export interface LifecyclePayload {
  event: LifecycleHookEvent;
  timestamp: number;
  sessionId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface AppStartPayload extends LifecyclePayload {
  version: string;
  environment: string;
  startTime: number;
}

export interface AppStopPayload extends LifecyclePayload {
  uptime: number;
  reason?: string;
}

export interface SessionStartPayload extends LifecyclePayload {
  sessionId: string;
  mode: string;
  cwd: string;
}

export interface SessionEndPayload extends LifecyclePayload {
  sessionId: string;
  duration: number;
  exitCode?: number;
}

export interface ToolExecutionPayload extends LifecyclePayload {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  duration?: number;
  toolId?: string;
}

export interface AgentExecutionPayload extends LifecyclePayload {
  agentType: string;
  task: string;
  result?: unknown;
  duration?: number;
}

export interface PermissionPayload extends LifecyclePayload {
  tool: string;
  input: Record<string, unknown>;
  decision: "allow" | "deny" | "ask";
  reason?: string;
}

export interface StreamPayload extends LifecyclePayload {
  content?: string;
  chunkIndex?: number;
  totalChunks?: number;
  model?: string;
}

export interface ErrorPayload extends LifecyclePayload {
  error: Error;
  errorType: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface RetryPayload extends LifecyclePayload {
  attempt: number;
  maxAttempts: number;
  error: Error;
  nextRetryIn?: number;
}

export interface CircuitPayload extends LifecyclePayload {
  circuitName: string;
  state: "closed" | "open" | "half-open";
  previousState?: "closed" | "open" | "half-open";
}

export interface ConfigChangePayload extends LifecyclePayload {
  configKey: string;
  previousValue?: unknown;
  newValue: unknown;
  source: string;
}

export interface HealthCheckPayload extends LifecyclePayload {
  healthy: boolean;
  checks: Record<string, boolean>;
  responseTime?: number;
}

export type LifecycleDecision =
  | { type: "continue" }
  | { type: "stop"; reason?: string }
  | { type: "modify"; changes: Record<string, unknown> }
  | { type: "retry"; delay?: number }
  | { type: "fallback"; handler?: string };

export type LifecycleCallback<T extends LifecyclePayload = LifecyclePayload> = (
  payload: T
) => Promise<LifecycleDecision>;

export interface LifecycleHookConfig {
  timeout?: number;
  retry?: {
    maxAttempts: number;
    delayMs: number;
  };
  parallel?: boolean;
  onError?: (error: Error, payload: LifecyclePayload) => void;
}

export interface LifecycleHookRegistration {
  id: string;
  event: LifecycleHookEvent;
  callback: LifecycleCallback;
  config?: LifecycleHookConfig;
  enabled?: boolean;
  description?: string;
}

export class LifecycleHookRegistry {
  private hooks: Map<string, LifecycleHookRegistration> = new Map();
  private executionHistory: Map<string, LifecyclePayload[]> = new Map();
  private maxHistorySize: number = 100;

  register(registration: LifecycleHookRegistration): void {
    this.hooks.set(registration.id, {
      ...registration,
      enabled: registration.enabled ?? true,
    });
  }

  unregister(id: string): void {
    this.hooks.delete(id);
  }

  enable(id: string): boolean {
    const hook = this.hooks.get(id);
    if (hook) {
      hook.enabled = true;
      return true;
    }
    return false;
  }

  disable(id: string): boolean {
    const hook = this.hooks.get(id);
    if (hook) {
      hook.enabled = false;
      return true;
    }
    return false;
  }

  async dispatch<T extends LifecyclePayload>(
    event: LifecycleHookEvent,
    payload: Omit<T, "event" | "timestamp"> & Partial<Pick<T, "event" | "timestamp">>
  ): Promise<LifecycleDecision> {
    const fullPayload = {
      ...payload,
      event,
      timestamp: payload.timestamp ?? Date.now(),
    } as T;

    const candidates = Array.from(this.hooks.values())
      .filter((h) => h.event === event && h.enabled)
      .sort((a, b) => {
        const retryA = a.config?.retry?.maxAttempts ?? 1;
        const retryB = b.config?.retry?.maxAttempts ?? 1;
        return retryB - retryA;
      });

    if (candidates.length === 0) {
      return { type: "continue" };
    }

    this.recordHistory(event, fullPayload);

    let decision: LifecycleDecision = { type: "continue" };

    for (const hook of candidates) {
      try {
        const result = await this.executeWithTimeout(hook, fullPayload);
        decision = this.mergeDecisions(decision, result);

        if (decision.type === "stop") {
          break;
        }

        if (decision.type === "modify") {
          Object.assign(fullPayload, decision.changes);
        }

        if (decision.type === "retry" && decision.delay) {
          await this.sleep(decision.delay);
        }
      } catch (error) {
        if (hook.config?.onError) {
          hook.config.onError(error as Error, fullPayload);
        } else {
          console.error(`Lifecycle hook ${hook.id} failed:`, error);
        }

        if (hook.config?.retry) {
          decision = await this.handleRetry(hook, fullPayload, error as Error);
          if (decision.type === "stop") {
            break;
          }
        }
      }
    }

    return decision;
  }

  private async executeWithTimeout<T extends LifecyclePayload>(
    hook: LifecycleHookRegistration,
    payload: T
  ): Promise<LifecycleDecision> {
    const timeout = hook.config?.timeout ?? 30000;

    return Promise.race([
      hook.callback(payload),
      new Promise<LifecycleDecision>((_, reject) =>
        setTimeout(() => reject(new Error("Hook timeout")), timeout)
      ),
    ]);
  }

  private async handleRetry<T extends LifecyclePayload>(
    hook: LifecycleHookRegistration,
    payload: T,
    error: Error
  ): Promise<LifecycleDecision> {
    const retryConfig = hook.config?.retry;
    if (!retryConfig) {
      return { type: "continue" };
    }

    let attempt = 1;
    const retryKey = `${hook.id}:${payload.timestamp}`;
    const attemptData = this.executionHistory.get(retryKey);
    if (attemptData) {
      attempt = attemptData.length + 1;
    }

    if (attempt <= retryConfig.maxAttempts) {
      await this.sleep(retryConfig.delayMs * attempt);
      return {
        type: "retry",
        delay: retryConfig.delayMs * attempt,
      };
    }

    return { type: "continue" };
  }

  private mergeDecisions(
    acc: LifecycleDecision,
    next: LifecycleDecision
  ): LifecycleDecision {
    if (acc.type === "stop" || next.type === "stop") {
      return next.type === "stop" ? next : acc;
    }

    if (acc.type === "modify" && next.type === "modify") {
      return {
        type: "modify",
        changes: { ...acc.changes, ...next.changes },
      };
    }

    return next;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private recordHistory(event: LifecycleHookEvent, payload: LifecyclePayload): void {
    const key = `${event}:${payload.timestamp}`;
    const history = this.executionHistory.get(key) || [];
    history.push(payload);

    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.executionHistory.set(key, history);
  }

  getHistory(event?: LifecycleHookEvent): LifecyclePayload[] {
    const all: LifecyclePayload[] = [];

    for (const [key, payloads] of this.executionHistory) {
      if (event) {
        if (key.startsWith(event)) {
          all.push(...payloads);
        }
      } else {
        all.push(...payloads);
      }
    }

    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  list(event?: LifecycleHookEvent): LifecycleHookRegistration[] {
    const all = Array.from(this.hooks.values());
    if (!event) {
      return all;
    }
    return all.filter((h) => h.event === event);
  }

  clearHistory(): void {
    this.executionHistory.clear();
  }

  getStats(): {
    totalHooks: number;
    hooksByEvent: Record<LifecycleHookEvent, number>;
    enabledHooks: number;
    disabledHooks: number;
  } {
    const all = Array.from(this.hooks.values());
    const hooksByEvent: Partial<Record<LifecycleHookEvent, number>> = {};

    for (const hook of all) {
      hooksByEvent[hook.event] = (hooksByEvent[hook.event] || 0) + 1;
    }

    return {
      totalHooks: all.length,
      hooksByEvent: hooksByEvent as Record<LifecycleHookEvent, number>,
      enabledHooks: all.filter((h) => h.enabled).length,
      disabledHooks: all.filter((h) => !h.enabled).length,
    };
  }
}

export class LifecycleManager {
  private registry: LifecycleHookRegistry;
  private sessionId?: string;
  private appStartTime?: number;

  constructor(registry?: LifecycleHookRegistry) {
    this.registry = registry || new LifecycleHookRegistry();
  }

  getRegistry(): LifecycleHookRegistry {
    return this.registry;
  }

  async emitAppStart(version: string, environment: string): Promise<LifecycleDecision> {
    this.appStartTime = Date.now();
    return this.registry.dispatch<AppStartPayload>("appStart", {
      version,
      environment,
      startTime: this.appStartTime,
    });
  }

  async emitAppStop(reason?: string): Promise<LifecycleDecision> {
    if (!this.appStartTime) {
      return { type: "continue" };
    }
    return this.registry.dispatch<AppStopPayload>("appStop", {
      uptime: Date.now() - this.appStartTime,
      reason,
    });
  }

  async emitSessionStart(sessionId: string, mode: string, cwd: string): Promise<LifecycleDecision> {
    this.sessionId = sessionId;
    return this.registry.dispatch<SessionStartPayload>("sessionStart", {
      sessionId,
      mode,
      cwd,
    });
  }

  async emitSessionEnd(duration: number, exitCode?: number): Promise<LifecycleDecision> {
    if (!this.sessionId) {
      return { type: "continue" };
    }
    const result = await this.registry.dispatch<SessionEndPayload>("sessionEnd", {
      sessionId: this.sessionId,
      duration,
      exitCode,
    });
    this.sessionId = undefined;
    return result;
  }

  async emitToolExecution(
    toolName: string,
    input: Record<string, unknown>,
    output?: unknown,
    duration?: number
  ): Promise<LifecycleDecision> {
    return this.registry.dispatch<ToolExecutionPayload>("postToolExecution", {
      toolName,
      input,
      output,
      duration,
    });
  }

  async emitError(error: Error, context?: Record<string, unknown>): Promise<LifecycleDecision> {
    return this.registry.dispatch<ErrorPayload>("error", {
      error,
      errorType: error.name,
      stack: error.stack,
      context,
    });
  }

  async emitConfigChange(
    key: string,
    previousValue: unknown,
    newValue: unknown,
    source: string
  ): Promise<LifecycleDecision> {
    return this.registry.dispatch<ConfigChangePayload>("configChange", {
      configKey: key,
      previousValue,
      newValue,
      source,
    });
  }

  createHookEmitter<E extends LifecycleHookEvent>(
    event: E
  ): (payload: Omit<Extract<LifecyclePayload, { event: E }>, "event" | "timestamp">) => Promise<LifecycleDecision> {
    return (payload) =>
      this.registry.dispatch(event, {
        ...payload,
        timestamp: Date.now(),
      } as Extract<LifecyclePayload, { event: E }>);
  }
}

export const defaultLifecycleRegistry = new LifecycleHookRegistry();
export const defaultLifecycleManager = new LifecycleManager(defaultLifecycleRegistry);
