/**
 * Retry Logic with Exponential Backoff
 *
 * Handles API retries for rate limits, overloaded servers,
 * and transient failures.
 */

/**
 * Retry configuration.
 */
export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatusCodes: number[]
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 529],
}

/**
 * Aggressive retry config for 429 errors.
 */
export const RATE_LIMIT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  retryableStatusCodes: [429, 529],
}

/**
 * Get retry-after delay from response headers.
 */
export function getRetryAfterDelay(headers: Record<string, string | undefined>): number | null {
  const retryAfter = headers?.['retry-after'] || headers?.['Retry-After']
  if (!retryAfter) return null

  const parsed = parseInt(retryAfter, 10)
  if (!isNaN(parsed)) {
    return parsed * 1000 // Convert seconds to ms
  }

  // Parse HTTP date if present
  return null
}

/**
 * Error classification for detailed handling.
 */
export type ErrorClass = 'rate_limit' | 'server_error' | 'network' | 'auth' | 'prompt_too_long' | 'unknown'

/**
 * Classify an error for targeted retry strategy.
 */
export function classifyError(err: any): ErrorClass {
  if (err?.status === 429) return 'rate_limit'
  if (err?.status === 529) return 'rate_limit'
  if (err?.status === 401 || err?.status === 403) return 'auth'
  if (err?.status === 400 && isPromptTooLongError(err)) return 'prompt_too_long'
  if (err?.status && err.status >= 500 && err.status < 600) return 'server_error'
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED' || err?.code === 'EAI_AGAIN') {
    return 'network'
  }
  if (err?.error?.type === 'overloaded_error') return 'rate_limit'
  return 'unknown'
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(err: any, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  const class_ = classifyError(err)

  // Rate limits and server errors are always retryable
  if (class_ === 'rate_limit' || class_ === 'server_error' || class_ === 'network') {
    return true
  }

  if (err?.status && config.retryableStatusCodes.includes(err.status)) {
    return true
  }

  // API overloaded
  if (err?.error?.type === 'overloaded_error') {
    return true
  }

  return false
}

/**
 * Calculate delay for exponential backoff.
 */
export function getRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  retryAfterMs?: number | null,
): number {
  // If retry-after is provided (from 429 response), use it with a cap
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, config.maxDelayMs)
  }

  // Exponential backoff with jitter
  const delay = config.baseDelayMs * Math.pow(2, attempt)
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.min(delay + jitter, config.maxDelayMs)
}

/**
 * Execute a function with retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  abortSignal?: AbortSignal,
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      throw new Error('Aborted')
    }

    try {
      return await fn()
    } catch (err: any) {
      lastError = err

      if (!isRetryableError(err, config)) {
        throw err
      }

      if (attempt === config.maxRetries) {
        throw err
      }

      // Extract retry-after delay for 429 errors
      const retryAfterMs = getRetryAfterDelay(err?.response?.headers)

      // Wait before retry
      const delay = getRetryDelay(attempt, config, retryAfterMs)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Check if an error is a "prompt too long" error.
 */
export function isPromptTooLongError(err: any): boolean {
  if (err?.status === 400) {
    const message = err?.error?.error?.message || err?.message || ''
    return message.includes('prompt is too long') ||
      message.includes('max_tokens') ||
      message.includes('context length')
  }
  return false
}

/**
 * Check if error is an auth error.
 */
export function isAuthError(err: any): boolean {
  return err?.status === 401 || err?.status === 403
}

/**
 * Check if error is a rate limit error.
 */
export function isRateLimitError(err: any): boolean {
  return err?.status === 429
}

/**
 * Format an API error for display.
 */
export function formatApiError(err: any): string {
  if (isAuthError(err)) {
    return 'Authentication failed. Check your OPENFLOW_API_KEY.'
  }
  if (isRateLimitError(err)) {
    const retryAfter = getRetryAfterDelay(err?.response?.headers)
    if (retryAfter) {
      return `Rate limit exceeded. Retrying in ${Math.ceil(retryAfter / 1000)}s...`
    }
    return 'Rate limit exceeded. Please retry after a short wait.'
  }
  if (err?.status === 529) {
    return 'API overloaded. Please retry later.'
  }
  if (isPromptTooLongError(err)) {
    return 'Prompt too long. Auto-compacting conversation...'
  }
  return `API error: ${err.message || err}`
}
