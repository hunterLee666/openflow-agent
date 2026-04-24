export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface CircuitBreakerStats {
  failures: number;
  successes: number;
  state: CircuitState;
  lastFailure?: Date;
  lastSuccess?: Date;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter?: boolean;
}

export interface BackoffConfig {
  type: 'exponential' | 'linear' | 'fibonacci';
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

export interface FallbackHandler<T> {
  handle: (error: Error, context?: unknown) => T | Promise<T>;
  priority?: number;
}

export interface ErrorRecoveryPolicy {
  enableCircuitBreaker: boolean;
  enableRetry: boolean;
  enableFallback: boolean;
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  fallback?: FallbackHandler<unknown>;
}

export interface RecoveryMetrics {
  totalRetries: number;
  totalFailures: number;
  circuitBreakerState: CircuitState;
  averageRetryDelay: number;
  fallbackUsage: number;
}