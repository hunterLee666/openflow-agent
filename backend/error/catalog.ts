export type ErrorType = "retryable" | "fatal" | "user-caused" | "timeout" | "rate-limit" | "network" | "validation";

export type RecoveryStrategy =
  | "retry"
  | "retry-with-backoff"
  | "fallback"
  | "skip"
  | "abort"
  | "manual";

export interface ErrorCategory {
  type: ErrorType;
  retryable: boolean;
  recovery?: RecoveryStrategy;
  userMessage: string;
  technicalMessage?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
  jitter?: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ["retryable", "timeout", "rate-limit", "network"],
  jitter: true,
};

export interface ErrorEntry {
  code: string;
  category: ErrorCategory;
  metadata?: Record<string, unknown>;
}

export class ErrorCatalog {
  private catalog: Map<string, ErrorEntry> = new Map();
  private listeners: Map<string, Array<(error: ErrorEntry) => void>> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register({
      code: "NETWORK_ERROR",
      category: {
        type: "network",
        retryable: true,
        recovery: "retry-with-backoff",
        userMessage: "网络连接失败，请检查您的网络连接",
        technicalMessage: "Failed to establish network connection",
      },
    });

    this.register({
      code: "TIMEOUT_ERROR",
      category: {
        type: "timeout",
        retryable: true,
        recovery: "retry-with-backoff",
        userMessage: "请求超时，请稍后重试",
        technicalMessage: "Request timed out",
      },
    });

    this.register({
      code: "RATE_LIMIT_ERROR",
      category: {
        type: "rate-limit",
        retryable: true,
        recovery: "retry",
        userMessage: "请求过于频繁，请稍后再试",
        technicalMessage: "Rate limit exceeded",
      },
    });

    this.register({
      code: "AUTH_ERROR",
      category: {
        type: "fatal",
        retryable: false,
        recovery: "manual",
        userMessage: "认证失败，请重新登录",
        technicalMessage: "Authentication failed",
      },
    });

    this.register({
      code: "VALIDATION_ERROR",
      category: {
        type: "validation",
        retryable: false,
        recovery: "abort",
        userMessage: "输入验证失败，请检查您的输入",
        technicalMessage: "Input validation failed",
      },
    });

    this.register({
      code: "PERMISSION_DENIED",
      category: {
        type: "user-caused",
        retryable: false,
        recovery: "manual",
        userMessage: "权限不足，无法执行此操作",
        technicalMessage: "Permission denied",
      },
    });

    this.register({
      code: "INTERNAL_ERROR",
      category: {
        type: "fatal",
        retryable: false,
        recovery: "abort",
        userMessage: "系统内部错误，请联系支持团队",
        technicalMessage: "Internal server error",
      },
    });

    this.register({
      code: "RESOURCE_EXHAUSTED",
      category: {
        type: "retryable",
        retryable: true,
        recovery: "retry-with-backoff",
        userMessage: "资源不足，请稍后重试",
        technicalMessage: "Resource exhausted",
      },
    });

    this.register({
      code: "TOOL_NOT_FOUND",
      category: {
        type: "user-caused",
        retryable: false,
        recovery: "abort",
        userMessage: "未找到指定的工具",
        technicalMessage: "Tool not found in registry",
      },
    });

    this.register({
      code: "SANDBOX_VIOLATION",
      category: {
        type: "fatal",
        retryable: false,
        recovery: "abort",
        userMessage: "沙箱安全限制阻止了操作执行",
        technicalMessage: "Sandbox security violation",
      },
    });
  }

  register(entry: ErrorEntry): void {
    this.catalog.set(entry.code, entry);
  }

  get(code: string): ErrorEntry | undefined {
    return this.catalog.get(code);
  }

  getAll(): ErrorEntry[] {
    return Array.from(this.catalog.values());
  }

  getByType(type: ErrorType): ErrorEntry[] {
    return this.getAll().filter((e) => e.category.type === type);
  }

  categorize(error: Error | string): ErrorEntry | null {
    const code = typeof error === "string" ? error : error.constructor.name.toUpperCase();
    return this.catalog.get(code) || this.inferCategory(error);
  }

  private inferCategory(error: Error | string): ErrorEntry | null {
    const message = typeof error === "string" ? error : error.message.toLowerCase();

    if (message.includes("timeout")) {
      return this.catalog.get("TIMEOUT_ERROR") || null;
    }
    if (message.includes("network") || message.includes("fetch")) {
      return this.catalog.get("NETWORK_ERROR") || null;
    }
    if (message.includes("rate limit") || message.includes("429")) {
      return this.catalog.get("RATE_LIMIT_ERROR") || null;
    }
    if (message.includes("permission") || message.includes("denied")) {
      return this.catalog.get("PERMISSION_DENIED") || null;
    }
    if (message.includes("validation") || message.includes("invalid")) {
      return this.catalog.get("VALIDATION_ERROR") || null;
    }

    return null;
  }

  onError(code: string, listener: (error: ErrorEntry) => void): () => void {
    if (!this.listeners.has(code)) {
      this.listeners.set(code, []);
    }
    this.listeners.get(code)!.push(listener);

    return () => {
      const listeners = this.listeners.get(code);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private notifyListeners(error: ErrorEntry): void {
    const listeners = this.listeners.get(error.code);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(error);
        } catch (e) {
          console.error("Error listener error:", e);
        }
      }
    }
  }
}

export class SmartRetry {
  private config: RetryConfig;
  private attemptCounts: Map<string, number> = new Map();
  private backoffDelays: Map<string, number> = new Map();

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async execute<T>(
    operation: () => Promise<T>,
    operationId?: string,
    onRetry?: (attempt: number, error: Error, delay: number) => void
  ): Promise<T> {
    const id = operationId || `op_${Date.now()}`;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.attemptCounts.delete(id);
        this.backoffDelays.delete(id);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt >= this.config.maxAttempts) {
          break;
        }

        const errorEntry = new ErrorCatalog().categorize(lastError);
        if (!errorEntry || !errorEntry.category.retryable) {
          break;
        }

        const delay = this.calculateDelay(attempt, id);

        if (onRetry) {
          onRetry(attempt, lastError, delay);
        }

        await this.sleep(delay);
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }

  private calculateDelay(attempt: number, operationId: string): number {
    const exponentialDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelayMs
    );

    let delay = exponentialDelay;

    if (this.config.jitter) {
      const jitter = Math.random() * 0.3 * delay;
      delay = delay + jitter;
    }

    this.backoffDelays.set(operationId, delay);

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getAttemptCount(operationId: string): number {
    return this.attemptCounts.get(operationId) || 0;
  }

  reset(operationId?: string): void {
    if (operationId) {
      this.attemptCounts.delete(operationId);
      this.backoffDelays.delete(operationId);
    } else {
      this.attemptCounts.clear();
      this.backoffDelays.clear();
    }
  }

  getStats(): { totalOperations: number; pendingOperations: number } {
    return {
      totalOperations: this.attemptCounts.size,
      pendingOperations: this.backoffDelays.size,
    };
  }
}

export class ErrorHandler {
  private catalog: ErrorCatalog;
  private retry: SmartRetry;
  private errorLog: Array<{ error: ErrorEntry; timestamp: number; context?: Record<string, unknown> }> = [];
  private maxLogSize: number = 1000;

  constructor(
    catalog?: ErrorCatalog,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.catalog = catalog || new ErrorCatalog();
    this.retry = new SmartRetry(retryConfig);
  }

  async handle<T>(
    operation: () => Promise<T>,
    options: {
      operationId?: string;
      skipRetry?: boolean;
      context?: Record<string, unknown>;
      onRetry?: (attempt: number, error: Error, delay: number) => void;
      onError?: (error: ErrorEntry) => void;
    } = {}
  ): Promise<{ success: boolean; result?: T; error?: ErrorEntry }> {
    try {
      if (options.skipRetry) {
        const result = await operation();
        return { success: true, result };
      }

      const result = await this.retry.execute(
        operation,
        options.operationId,
        options.onRetry
      );

      return { success: true, result };
    } catch (error) {
      const errorEntry = this.catalog.categorize(
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorEntry) {
        this.logError(errorEntry, options.context);

        if (options.onError) {
          options.onError(errorEntry);
        }
      }

      return {
        success: false,
        error: errorEntry || {
          code: "UNKNOWN_ERROR",
          category: {
            type: "fatal",
            retryable: false,
            userMessage: "发生未知错误",
          },
        },
      };
    }
  }

  private logError(error: ErrorEntry, context?: Record<string, unknown>): void {
    this.errorLog.push({
      error,
      timestamp: Date.now(),
      context,
    });

    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
  }

  getErrorLog(limit?: number): Array<{ error: ErrorEntry; timestamp: number; context?: Record<string, unknown> }> {
    if (limit) {
      return this.errorLog.slice(-limit);
    }
    return [...this.errorLog];
  }

  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const entry of this.errorLog) {
      const code = entry.error.code;
      stats[code] = (stats[code] || 0) + 1;
    }
    return stats;
  }

  clearErrorLog(): void {
    this.errorLog = [];
  }

  getCatalog(): ErrorCatalog {
    return this.catalog;
  }

  getRetry(): SmartRetry {
    return this.retry;
  }
}

export const defaultErrorCatalog = new ErrorCatalog();
export const defaultSmartRetry = new SmartRetry();
export const defaultErrorHandler = new ErrorHandler();
