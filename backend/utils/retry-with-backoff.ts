import { z } from "zod";

export const RetryWithBackoffConfigSchema = z.object({
  maxRetries: z.number(),
  baseDelayMs: z.number(),
  maxDelayMs: z.number(),
  jitterMs: z.number().optional(),
  jitterFactor: z.number().optional(),
  backoffMultiplier: z.number().optional(),
  retryableErrors: z.array(z.string()).optional(),
  onRetry: z.function().args(z.number(), z.instanceof(Error), z.number()).returns(z.void()).optional(),
});

export type RetryWithBackoffConfig = z.infer<typeof RetryWithBackoffConfigSchema>;

export const DEFAULT_BACKOFF_CONFIG: RetryWithBackoffConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.5,
  backoffMultiplier: 2,
};

export const RetryAttemptSchema = z.object({
  attempt: z.number(),
  maxRetries: z.number(),
  delay: z.number(),
  error: z.instanceof(Error),
  timestamp: z.number(),
});

export type RetryAttempt = z.infer<typeof RetryAttemptSchema>;

export const RetryResultSchema: z.ZodType<any> = z.object({
  success: z.boolean(),
  value: z.unknown().optional(),
  error: z.instanceof(Error).optional(),
  attempts: z.number(),
  totalDelay: z.number(),
  retries: z.array(RetryAttemptSchema),
});

export type RetryResult<T> = z.infer<typeof RetryResultSchema>;

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
