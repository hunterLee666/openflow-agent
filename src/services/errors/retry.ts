import type { AppError } from './AppError'
import { isRetryable, toAppError } from './AppError'

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitterFactor: number
  context?: { provider?: string; subsystem?: string }
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.2,
}

export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 500,
  maxDelayMs: 120000,
  jitterFactor: 0.3,
}

export const CONSERVATIVE_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
}

export type OnRetryCallback = (error: AppError, attempt: number, delayMs: number) => void

export async function withRetries<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: OnRetryCallback,
): Promise<T> {
  let lastError: AppError | undefined

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const appError = toAppError(error, config.context)
      lastError = appError

      if (!isRetryable(appError)) {
        throw appError
      }

      if (attempt === config.maxRetries) {
        throw appError
      }

      let delay = calculateBackoffDelay(attempt, config)

      if (appError.kind === 'rate_limit' && appError.retryAfterMs) {
        delay = Math.max(delay, appError.retryAfterMs)
      }

      delay = applyJitter(delay, config.jitterFactor)

      onRetry?.(appError, attempt + 1, delay)

      await sleep(delay)
    }
  }

  throw lastError || new Error('Unexpected retry loop exit')
}

export async function withRetriesAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: OnRetryCallback,
): Promise<T> {
  const startTime = Date.now()
  let lastError: AppError | undefined

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (Date.now() - startTime > timeoutMs) {
      throw lastError || new Error(`Operation timed out after ${timeoutMs}ms`)
    }

    try {
      const remainingTime = timeoutMs - (Date.now() - startTime)
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), remainingTime),
        ),
      ])
    } catch (error) {
      const appError = toAppError(error, config.context)
      lastError = appError

      if (!isRetryable(appError) || attempt === config.maxRetries) {
        throw appError
      }

      let delay = calculateBackoffDelay(attempt, config)

      if (appError.kind === 'rate_limit' && appError.retryAfterMs) {
        delay = Math.max(delay, appError.retryAfterMs)
      }

      delay = applyJitter(delay, config.jitterFactor)

      const remainingTime = timeoutMs - (Date.now() - startTime)
      if (delay > remainingTime) {
        throw lastError
      }

      onRetry?.(appError, attempt + 1, delay)

      await sleep(delay)
    }
  }

  throw lastError
}

function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt)
  return Math.min(delay, config.maxDelayMs)
}

function applyJitter(delay: number, jitterFactor: number): number {
  const jitter = delay * jitterFactor * (Math.random() - 0.5) * 2
  return Math.max(0, Math.floor(delay + jitter))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createRetryWrapper(
  context?: { provider?: string; subsystem?: string },
  config: Partial<RetryConfig> = {},
): <T>(fn: () => Promise<T>, onRetry?: OnRetryCallback) => Promise<T> {
  const mergedConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
    context,
  }

  return <T>(fn: () => Promise<T>, onRetry?: OnRetryCallback) =>
    withRetries(fn, mergedConfig, onRetry)
}

export function shouldRetry(error: unknown, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return false
  const appError = toAppError(error)
  return isRetryable(appError)
}

export function getRetryDelay(error: unknown, attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const appError = toAppError(error, config.context)
  let delay = calculateBackoffDelay(attempt, config)

  if (appError.kind === 'rate_limit' && appError.retryAfterMs) {
    delay = Math.max(delay, appError.retryAfterMs)
  }

  return applyJitter(delay, config.jitterFactor)
}
