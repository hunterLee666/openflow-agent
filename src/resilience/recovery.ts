import type {
  BackoffConfig,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
  FallbackHandler,
  RecoveryMetrics,
  RetryConfig,
  RetryResult,
} from './types';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      successThreshold: config.successThreshold,
      timeout: config.timeout,
      resetTimeout: config.resetTimeout,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return true;
    return Date.now() - this.lastFailure.getTime() >= this.config.resetTimeout;
  }

  private recordSuccess(): void {
    this.successes++;
    this.lastSuccess = new Date();

    if (this.state === 'half-open') {
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
      }
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailure = new Date();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.successes = 0;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      failures: this.failures,
      successes: this.successes,
      state: this.state,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = undefined;
    this.lastSuccess = undefined;
  }
}

export class ExponentialBackoff implements BackoffConfig {
  type: 'exponential' = 'exponential';
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;

  constructor(initialDelayMs = 100, maxDelayMs = 30000, multiplier = 2) {
    this.initialDelayMs = initialDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.multiplier = multiplier;
  }

  calculate(attempt: number): number {
    const delay = Math.min(
      this.initialDelayMs * Math.pow(this.multiplier, attempt),
      this.maxDelayMs
    );
    return delay;
  }
}

export class LinearBackoff implements BackoffConfig {
  type: 'linear' = 'linear';
  initialDelayMs: number;
  maxDelayMs: number;

  constructor(initialDelayMs = 100, maxDelayMs = 30000) {
    this.initialDelayMs = initialDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  calculate(attempt: number): number {
    return Math.min(this.initialDelayMs * (attempt + 1), this.maxDelayMs);
  }
}

export class FibonacciBackoff implements BackoffConfig {
  type: 'fibonacci' = 'fibonacci';
  initialDelayMs: number;
  maxDelayMs: number;

  constructor(initialDelayMs = 100, maxDelayMs = 30000) {
    this.initialDelayMs = initialDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  calculate(attempt: number): number {
    const fib = (n: number): number => {
      if (n <= 1) return 1;
      return fib(n - 1) + fib(n - 2);
    };
    return Math.min(this.initialDelayMs * fib(attempt), this.maxDelayMs);
  }
}

export function createBackoff(config: BackoffConfig): (attempt: number) => number {
  const backoff = config.type === 'exponential'
    ? new ExponentialBackoff(config.initialDelayMs, config.maxDelayMs, config.multiplier)
    : config.type === 'linear'
    ? new LinearBackoff(config.initialDelayMs, config.maxDelayMs)
    : new FibonacciBackoff(config.initialDelayMs, config.maxDelayMs);

  return (attempt: number) => backoff.calculate(attempt);
}

export async function retry<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<RetryResult<T>> {
  let attempts = 0;
  let totalDelayMs = 0;
  const backoff = new ExponentialBackoff(
    config.initialDelayMs,
    config.maxDelayMs,
    config.backoffMultiplier
  );

  while (attempts <= config.maxRetries) {
    try {
      const result = await operation();
      return { success: true, result, attempts: attempts + 1, totalDelayMs };
    } catch (error) {
      attempts++;

      if (attempts > config.maxRetries) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          attempts,
          totalDelayMs,
        };
      }

      let delay = backoff.calculate(attempts - 1);

      if (config.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      totalDelayMs += delay;
    }
  }

  return {
    success: false,
    error: new Error('Max retries exceeded'),
    attempts,
    totalDelayMs,
  };
}

export class ErrorRecoveryManager {
  private circuitBreaker?: CircuitBreaker;
  private readonly retryConfig?: RetryConfig;
  private readonly fallback?: FallbackHandler<unknown>;
  private metrics: RecoveryMetrics;

  constructor(
    enableCircuitBreaker: boolean,
    enableRetry: boolean,
    enableFallback: boolean,
    circuitBreakerConfig?: CircuitBreakerConfig,
    retryConfig?: RetryConfig,
    fallback?: FallbackHandler<unknown>
  ) {
    if (enableCircuitBreaker && circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    }
    if (enableRetry) {
      this.retryConfig = retryConfig;
    }
    this.fallback = fallback;

    this.metrics = {
      totalRetries: 0,
      totalFailures: 0,
      circuitBreakerState: 'closed',
      averageRetryDelay: 0,
      fallbackUsage: 0,
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    fallbackValue?: T
  ): Promise<T> {
    try {
      let op = operation;

      if (this.circuitBreaker) {
        const originalOp = op;
        op = () => this.circuitBreaker!.execute(originalOp);
      }

      if (this.retryConfig) {
        const originalOp = op;
        const retryConfig = this.retryConfig;
        op = async () => {
          const result = await retry(originalOp, retryConfig);
          this.metrics.totalRetries += result.attempts - 1;
          if (!result.success && result.totalDelayMs > 0) {
            this.metrics.averageRetryDelay =
              (this.metrics.averageRetryDelay * (this.metrics.totalRetries - result.attempts) +
                result.totalDelayMs) /
              this.metrics.totalRetries;
          }
          if (!result.success) {
            this.metrics.totalFailures++;
          }
          return result.result as T;
        };
      }

      return await op();
    } catch (error) {
      this.metrics.totalFailures++;

      if (this.circuitBreaker) {
        this.metrics.circuitBreakerState = this.circuitBreaker.getState();
      }

      if (this.fallback && fallbackValue !== undefined) {
        this.metrics.fallbackUsage++;
        return fallbackValue;
      }

      throw error;
    }
  }

  getMetrics(): RecoveryMetrics {
    return { ...this.metrics };
  }

  getCircuitBreakerStats(): CircuitBreakerStats | undefined {
    return this.circuitBreaker?.getStats();
  }
}

export function createErrorRecoveryManager(
  enableCircuitBreaker = true,
  enableRetry = true,
  enableFallback = true,
  circuitBreakerConfig?: CircuitBreakerConfig,
  retryConfig?: RetryConfig,
  fallback?: FallbackHandler<unknown>
): ErrorRecoveryManager {
  return new ErrorRecoveryManager(
    enableCircuitBreaker,
    enableRetry,
    enableFallback,
    circuitBreakerConfig,
    retryConfig,
    fallback
  );
}