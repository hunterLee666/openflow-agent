export interface RetryWithBackoffConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs?: number;
  jitterFactor?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export const DEFAULT_BACKOFF_CONFIG: RetryWithBackoffConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.5,
  backoffMultiplier: 2,
};

export interface RetryAttempt {
  attempt: number;
  maxRetries: number;
  delay: number;
  error: Error;
  timestamp: number;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
  retries: RetryAttempt[];
}

export function calculateExponentialBackoff(
  attempt: number,
  config: RetryWithBackoffConfig
): number {
  const multiplier = config.backoffMultiplier ?? 2;
  const baseDelay = config.baseDelayMs;
  const maxDelay = config.maxDelayMs;

  const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);

  const jitterFactor = config.jitterFactor ?? 0.5;
  const randomJitter = Math.random() * jitterFactor * exponentialDelay;

  const delayWithJitter = Math.min(maxDelay, exponentialDelay + randomJitter);

  return Math.max(0, Math.floor(delayWithJitter));
}

export function isRetryableError(
  error: Error,
  config: RetryWithBackoffConfig
): boolean {
  if (!config.retryableErrors || config.retryableErrors.length === 0) {
    return true;
  }

  const errorMessage = error.message.toLowerCase();
  return config.retryableErrors.some((pattern) =>
    errorMessage.includes(pattern.toLowerCase())
  );
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryWithBackoffConfig>
): Promise<RetryResult<T>> {
  const mergedConfig: RetryWithBackoffConfig = {
    ...DEFAULT_BACKOFF_CONFIG,
    ...config,
  };

  const retries: RetryAttempt[] = [];
  let totalDelay = 0;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        value: result,
        attempts: attempt + 1,
        totalDelay,
        retries,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === mergedConfig.maxRetries) {
        break;
      }

      if (!isRetryableError(lastError, mergedConfig)) {
        break;
      }

      const delay = calculateExponentialBackoff(attempt, mergedConfig);
      totalDelay += delay;

      const retryAttempt: RetryAttempt = {
        attempt: attempt + 1,
        maxRetries: mergedConfig.maxRetries,
        delay,
        error: lastError,
        timestamp: Date.now(),
      };
      retries.push(retryAttempt);

      mergedConfig.onRetry?.(attempt + 1, lastError, delay);

      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: retries.length + 1,
    totalDelay,
    retries,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryBudget {
  private maxRetriesPerWindow: number;
  private windowMs: number;
  private retries: number[] = [];

  constructor(maxRetriesPerWindow = 10, windowMs = 60000) {
    this.maxRetriesPerWindow = maxRetriesPerWindow;
    this.windowMs = windowMs;
  }

  canRetry(): boolean {
    this.cleanOldRetries();
    return this.retries.length < this.maxRetriesPerWindow;
  }

  recordRetry(): void {
    this.cleanOldRetries();
    this.retries.push(Date.now());
  }

  getRetryCount(): number {
    this.cleanOldRetries();
    return this.retries.length;
  }

  getRemainingBudget(): number {
    this.cleanOldRetries();
    return Math.max(0, this.maxRetriesPerWindow - this.retries.length);
  }

  private cleanOldRetries(): void {
    const cutoff = Date.now() - this.windowMs;
    this.retries = this.retries.filter((time) => time > cutoff);
  }

  reset(): void {
    this.retries = [];
  }
}
