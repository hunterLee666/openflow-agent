export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  monitorIntervalMs?: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeoutMs: 60000,
  monitorIntervalMs: 10000,
};

export interface CircuitBreakerEvent {
  type: "success" | "failure" | "state_change" | "half_open_test";
  timestamp: number;
  state: CircuitState;
  metadata?: Record<string, unknown>;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChangeTime: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastStateChangeTime = Date.now();
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private config: CircuitBreakerConfig;
  private eventListeners: Array<(event: CircuitBreakerEvent) => void> = [];
  private monitorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  name: string;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState();
    this.totalCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChangeTime: this.lastStateChangeTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  reset(): void {
    const previousState = this.state;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChangeTime = Date.now();

    if (previousState !== "CLOSED") {
      this.emitEvent({
        type: "state_change",
        timestamp: Date.now(),
        state: "CLOSED",
        metadata: { previousState },
      });
    }
  }

  onEvent(listener: (event: CircuitBreakerEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  shutdown(): void {
    if (this.monitorTimer) {
      clearTimeout(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  private checkState(): void {
    if (this.state === "OPEN") {
      const timeSinceOpen = Date.now() - this.lastStateChangeTime;
      if (timeSinceOpen >= this.config.timeoutMs) {
        this.transitionTo("HALF_OPEN");
      } else {
        const retryAfter = this.config.timeoutMs - timeSinceOpen;
        throw new CircuitBreakerError(
          `Circuit breaker '${this.name}' is OPEN. Retry after ${retryAfter}ms`,
          "OPEN",
          retryAfter
        );
      }
    }
  }

  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.successCount++;
      this.emitEvent({
        type: "half_open_test",
        timestamp: Date.now(),
        state: "HALF_OPEN",
        metadata: { successCount: this.successCount, required: this.config.successThreshold },
      });

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo("CLOSED");
      }
    } else if (this.state === "CLOSED") {
      this.failureCount = 0;
    }
  }

  private onFailure(error: unknown): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN");
    } else if (this.state === "CLOSED") {
      this.failureCount++;

      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo("OPEN");
      }
    }

    this.emitEvent({
      type: "failure",
      timestamp: Date.now(),
      state: this.state,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        failureCount: this.failureCount,
      },
    });
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === "CLOSED") {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === "HALF_OPEN") {
      this.successCount = 0;
    } else if (newState === "OPEN") {
      this.startMonitor();
    }

    this.emitEvent({
      type: "state_change",
      timestamp: Date.now(),
      state: newState,
      metadata: { previousState },
    });
  }

  private startMonitor(): void {
    if (this.monitorTimer) {
      clearTimeout(this.monitorTimer);
    }

    this.monitorTimer = setTimeout(() => {
      if (this.state === "OPEN") {
        const timeSinceOpen = Date.now() - this.lastStateChangeTime;
        if (timeSinceOpen >= this.config.timeoutMs) {
          this.transitionTo("HALF_OPEN");
        }
      }
      this.monitorTimer = null;
    }, this.config.monitorIntervalMs);
  }

  private emitEvent(event: CircuitBreakerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  create(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    const breaker = new CircuitBreaker(name, config);
    this.breakers.set(name, breaker);
    return breaker;
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  shutdown(): void {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown();
    }
    this.breakers.clear();
  }
}
