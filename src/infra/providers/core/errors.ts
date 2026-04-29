/**
 * Provider Error Hierarchy
 *
 * Typed error classes for all provider operations with retry support.
 * Each error type has a unique code and retryable flag.
 */

export type ProviderErrorCode =
  | 'RATE_LIMIT'
  | 'AUTH_FAILED'
  | 'CONTEXT_LENGTH'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'CONTENT_FILTER'
  | 'MODEL_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'
  | 'THINKING_SIGNATURE_INVALID'
  | 'STREAM_ERROR'
  | 'PARSE_ERROR'

export interface ProviderErrorDetails {
  name: string
  code: ProviderErrorCode
  message: string
  provider: string
  requestId?: string
  retryable: boolean
  timestamp: number
  statusCode?: number
}

/**
 * Base class for all provider errors.
 * Provides common properties and JSON serialization.
 */
export abstract class ProviderError extends Error {
  abstract readonly code: ProviderErrorCode
  abstract readonly retryable: boolean

  readonly provider: string
  readonly requestId?: string
  readonly timestamp: number
  readonly statusCode?: number

  constructor(
    message: string,
    provider: string,
    options?: { requestId?: string; statusCode?: number },
  ) {
    super(message)
    this.name = this.constructor.name
    this.provider = provider
    this.requestId = options?.requestId
    this.statusCode = options?.statusCode
    this.timestamp = Date.now()

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON(): ProviderErrorDetails {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      requestId: this.requestId,
      retryable: this.retryable,
      timestamp: this.timestamp,
      statusCode: this.statusCode,
    }
  }
}

/**
 * Rate limit exceeded (429).
 * Retryable after the specified delay.
 */
export class RateLimitError extends ProviderError {
  readonly code = 'RATE_LIMIT' as const
  readonly retryable = true

  readonly retryAfter?: number
  readonly limitType?: 'requests' | 'tokens'

  constructor(
    provider: string,
    options?: {
      retryAfter?: number
      limitType?: 'requests' | 'tokens'
      requestId?: string
    },
  ) {
    super(
      `Rate limit exceeded${options?.retryAfter ? `, retry after ${options.retryAfter}s` : ''}`,
      provider,
      { requestId: options?.requestId, statusCode: 429 },
    )
    this.retryAfter = options?.retryAfter
    this.limitType = options?.limitType
  }
}

/**
 * Authentication failed (401/403).
 * Not retryable - API key or permissions issue.
 */
export class AuthenticationError extends ProviderError {
  readonly code = 'AUTH_FAILED' as const
  readonly retryable = false

  constructor(
    provider: string,
    options?: { requestId?: string; statusCode?: number },
  ) {
    super('Authentication failed - check API key and permissions', provider, {
      requestId: options?.requestId,
      statusCode: options?.statusCode || 401,
    })
  }
}

/**
 * Context/token length exceeded.
 * Not retryable - need to reduce input size.
 */
export class ContextLengthError extends ProviderError {
  readonly code = 'CONTEXT_LENGTH' as const
  readonly retryable = false

  readonly maxTokens: number
  readonly requestedTokens: number

  constructor(
    provider: string,
    maxTokens: number,
    requestedTokens: number,
    options?: { requestId?: string },
  ) {
    super(
      `Context length ${requestedTokens} exceeds maximum ${maxTokens}`,
      provider,
      { requestId: options?.requestId, statusCode: 400 },
    )
    this.maxTokens = maxTokens
    this.requestedTokens = requestedTokens
  }
}

/**
 * Invalid request (400).
 * Not retryable - request format issue.
 */
export class InvalidRequestError extends ProviderError {
  readonly code = 'INVALID_REQUEST' as const
  readonly retryable = false

  readonly details?: Record<string, unknown>

  constructor(
    provider: string,
    message: string,
    options?: { requestId?: string; details?: Record<string, unknown> },
  ) {
    super(message, provider, { requestId: options?.requestId, statusCode: 400 })
    this.details = options?.details
  }
}

/**
 * Server error (500/502/503/529).
 * Retryable with exponential backoff.
 */
export class ServerError extends ProviderError {
  readonly code = 'SERVER_ERROR' as const
  readonly retryable = true

  constructor(
    provider: string,
    options?: { statusCode?: number; requestId?: string; message?: string },
  ) {
    super(
      options?.message ||
        `Server error${options?.statusCode ? ` (${options.statusCode})` : ''}`,
      provider,
      { requestId: options?.requestId, statusCode: options?.statusCode || 500 },
    )
  }
}

/**
 * Request timeout.
 * Retryable - may be transient.
 */
export class TimeoutError extends ProviderError {
  readonly code = 'TIMEOUT' as const
  readonly retryable = true

  readonly timeoutMs: number

  constructor(
    provider: string,
    timeoutMs: number,
    options?: { requestId?: string },
  ) {
    super(`Request timed out after ${timeoutMs}ms`, provider, {
      requestId: options?.requestId,
    })
    this.timeoutMs = timeoutMs
  }
}

/**
 * Network error (connection failed, DNS, etc).
 * Retryable - may be transient.
 */
export class NetworkError extends ProviderError {
  readonly code = 'NETWORK_ERROR' as const
  readonly retryable = true

  readonly cause?: Error

  constructor(
    provider: string,
    message: string,
    options?: { cause?: Error; requestId?: string },
  ) {
    super(message, provider, { requestId: options?.requestId })
    this.cause = options?.cause
  }
}

/**
 * Content filtered by provider safety systems.
 * Not retryable - content policy violation.
 */
export class ContentFilterError extends ProviderError {
  readonly code = 'CONTENT_FILTER' as const
  readonly retryable = false

  readonly category?: string
  readonly severity?: string

  constructor(
    provider: string,
    options?: {
      category?: string
      severity?: string
      requestId?: string
    },
  ) {
    super(
      `Content filtered${options?.category ? `: ${options.category}` : ''}`,
      provider,
      { requestId: options?.requestId },
    )
    this.category = options?.category
    this.severity = options?.severity
  }
}

/**
 * Model not found or not available.
 * Not retryable - model doesn't exist.
 */
export class ModelNotFoundError extends ProviderError {
  readonly code = 'MODEL_NOT_FOUND' as const
  readonly retryable = false

  readonly modelId: string

  constructor(
    provider: string,
    modelId: string,
    options?: { requestId?: string },
  ) {
    super(`Model not found: ${modelId}`, provider, {
      requestId: options?.requestId,
      statusCode: 404,
    })
    this.modelId = modelId
  }
}

/**
 * Quota exceeded (different from rate limit).
 * Not retryable without billing action.
 */
export class QuotaExceededError extends ProviderError {
  readonly code = 'QUOTA_EXCEEDED' as const
  readonly retryable = false

  readonly quotaType?: 'daily' | 'monthly' | 'total'

  constructor(
    provider: string,
    options?: {
      quotaType?: 'daily' | 'monthly' | 'total'
      requestId?: string
    },
  ) {
    super(
      `Quota exceeded${options?.quotaType ? ` (${options.quotaType})` : ''}`,
      provider,
      { requestId: options?.requestId, statusCode: 402 },
    )
    this.quotaType = options?.quotaType
  }
}

/**
 * Service temporarily unavailable.
 * Retryable - usually overload or maintenance.
 */
export class ServiceUnavailableError extends ProviderError {
  readonly code = 'SERVICE_UNAVAILABLE' as const
  readonly retryable = true

  readonly retryAfter?: number

  constructor(
    provider: string,
    options?: { retryAfter?: number; requestId?: string },
  ) {
    super('Service temporarily unavailable', provider, {
      requestId: options?.requestId,
      statusCode: 503,
    })
    this.retryAfter = options?.retryAfter
  }
}

/**
 * Thinking signature invalid (Anthropic/Gemini multi-turn).
 * Not retryable - message history was modified.
 */
export class ThinkingSignatureError extends ProviderError {
  readonly code = 'THINKING_SIGNATURE_INVALID' as const
  readonly retryable = false

  constructor(provider: string, options?: { requestId?: string }) {
    super(
      'Thinking signature invalid - thinking blocks may have been modified',
      provider,
      { requestId: options?.requestId, statusCode: 400 },
    )
  }
}

/**
 * Stream error during SSE processing.
 * Retryable - stream may have been interrupted.
 */
export class StreamError extends ProviderError {
  readonly code = 'STREAM_ERROR' as const
  readonly retryable = true

  readonly cause?: Error

  constructor(
    provider: string,
    message: string,
    options?: { cause?: Error; requestId?: string },
  ) {
    super(message, provider, { requestId: options?.requestId })
    this.cause = options?.cause
  }
}

/**
 * Parse error in response.
 * Not retryable - unexpected response format.
 */
export class ParseError extends ProviderError {
  readonly code = 'PARSE_ERROR' as const
  readonly retryable = false

  readonly rawResponse?: string

  constructor(
    provider: string,
    message: string,
    options?: { rawResponse?: string; requestId?: string },
  ) {
    super(message, provider, { requestId: options?.requestId })
    this.rawResponse = options?.rawResponse
  }
}

/**
 * Parse error response from provider API and return appropriate ProviderError.
 */
export function parseProviderError(
  error: any,
  provider: string,
): ProviderError {
  const statusCode = error.status || error.statusCode || error.response?.status
  const requestId =
    error.request_id ||
    error.requestId ||
    error.headers?.['x-request-id'] ||
    error.response?.headers?.['x-request-id']

  const message = error.message || error.error?.message || 'Unknown error'

  // Rate limit (429)
  if (statusCode === 429) {
    const retryAfter = parseRetryAfter(error)
    return new RateLimitError(provider, { retryAfter, requestId })
  }

  // Auth errors (401/403)
  if (statusCode === 401 || statusCode === 403) {
    return new AuthenticationError(provider, { requestId, statusCode })
  }

  // Server overload (529 - Anthropic specific)
  if (statusCode === 529) {
    return new ServerError(provider, {
      statusCode,
      requestId,
      message: 'API temporarily overloaded',
    })
  }

  // Server errors (500+)
  if (statusCode && statusCode >= 500) {
    if (statusCode === 503) {
      const retryAfter = parseRetryAfter(error)
      return new ServiceUnavailableError(provider, { retryAfter, requestId })
    }
    return new ServerError(provider, { statusCode, requestId })
  }

  // Context length / token errors
  if (
    error.code === 'context_length_exceeded' ||
    message.toLowerCase().includes('context') ||
    message.toLowerCase().includes('token limit') ||
    message.toLowerCase().includes('too many tokens')
  ) {
    return new ContextLengthError(
      provider,
      error.max_tokens || 0,
      error.requested_tokens || 0,
      { requestId },
    )
  }

  // Content filter
  if (
    error.code === 'content_policy_violation' ||
    message.toLowerCase().includes('safety') ||
    message.toLowerCase().includes('content filter') ||
    message.toLowerCase().includes('blocked')
  ) {
    return new ContentFilterError(provider, {
      category: error.category,
      requestId,
    })
  }

  // Thinking signature (Anthropic)
  if (message.toLowerCase().includes('signature')) {
    return new ThinkingSignatureError(provider, { requestId })
  }

  // Model not found (404)
  if (statusCode === 404 || message.toLowerCase().includes('model not found')) {
    return new ModelNotFoundError(provider, error.model || 'unknown', {
      requestId,
    })
  }

  // Quota exceeded (402)
  if (statusCode === 402 || message.toLowerCase().includes('quota')) {
    return new QuotaExceededError(provider, { requestId })
  }

  // Network errors
  if (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET'
  ) {
    return new NetworkError(provider, message, { cause: error, requestId })
  }

  // Timeout
  if (error.code === 'TIMEOUT' || message.toLowerCase().includes('timeout')) {
    return new TimeoutError(provider, error.timeout || 0, { requestId })
  }

  // Default to invalid request for 400
  if (statusCode === 400) {
    return new InvalidRequestError(provider, message, {
      requestId,
      details: error.error || error.details,
    })
  }

  // Fallback to server error
  return new ServerError(provider, { statusCode, requestId, message })
}

/**
 * Parse retry-after header value.
 */
function parseRetryAfter(error: any): number | undefined {
  const header =
    error.headers?.['retry-after'] || error.response?.headers?.['retry-after']

  if (header) {
    const seconds = parseInt(header, 10)
    if (!isNaN(seconds)) return seconds
  }

  // Some providers include retry info in error body
  if (error.retry_after) {
    return error.retry_after
  }

  return undefined
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return error.retryable
  }
  return false
}

/**
 * Check if error is a specific type.
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError
}

export function isAuthError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError
}

export function isContextLengthError(
  error: unknown,
): error is ContextLengthError {
  return error instanceof ContextLengthError
}

export function isContentFilterError(
  error: unknown,
): error is ContentFilterError {
  return error instanceof ContentFilterError
}

export interface ErrorMessageMapping {
  title: string
  description: string
  action: string
  severity: 'error' | 'warning' | 'info'
}

const ERROR_MESSAGE_MAPPINGS: Record<ProviderErrorCode, ErrorMessageMapping> = {
  RATE_LIMIT: {
    title: 'Rate Limit Exceeded',
    description: 'Too many requests have been sent in a short period.',
    action: 'Please wait a moment and try again. The request will be automatically retried.',
    severity: 'warning',
  },
  AUTH_FAILED: {
    title: 'Authentication Failed',
    description: 'Your API key may be invalid or missing required permissions.',
    action: 'Please check your API key configuration and ensure it has the necessary permissions.',
    severity: 'error',
  },
  CONTEXT_LENGTH: {
    title: 'Context Too Long',
    description: 'The conversation has exceeded the maximum context length.',
    action: 'Use /compact to compress the conversation or start a new session.',
    severity: 'warning',
  },
  INVALID_REQUEST: {
    title: 'Invalid Request',
    description: 'The request format was invalid or missing required parameters.',
    action: 'This is likely a bug. Please report it if the issue persists.',
    severity: 'error',
  },
  SERVER_ERROR: {
    title: 'Server Error',
    description: 'The API server encountered an internal error.',
    action: 'The request will be automatically retried. If the problem persists, please try again later.',
    severity: 'warning',
  },
  TIMEOUT: {
    title: 'Request Timeout',
    description: 'The request took too long to complete.',
    action: 'Please check your network connection and try again.',
    severity: 'warning',
  },
  NETWORK_ERROR: {
    title: 'Network Error',
    description: 'Could not connect to the API server.',
    action: 'Please check your internet connection and try again.',
    severity: 'warning',
  },
  CONTENT_FILTER: {
    title: 'Content Filtered',
    description: 'Your request was blocked by content safety systems.',
    action: 'Please modify your request to comply with content policies.',
    severity: 'error',
  },
  MODEL_NOT_FOUND: {
    title: 'Model Not Found',
    description: 'The specified model does not exist or is not available.',
    action: 'Please check your model configuration and ensure the model ID is correct.',
    severity: 'error',
  },
  QUOTA_EXCEEDED: {
    title: 'Quota Exceeded',
    description: 'Your account has exceeded its usage quota.',
    action: 'Please check your billing settings or upgrade your plan.',
    severity: 'error',
  },
  SERVICE_UNAVAILABLE: {
    title: 'Service Unavailable',
    description: 'The API service is temporarily unavailable.',
    action: 'The request will be automatically retried. Please try again in a few minutes.',
    severity: 'warning',
  },
  THINKING_SIGNATURE_INVALID: {
    title: 'Thinking Signature Invalid',
    description: 'The thinking blocks in the conversation history have been modified.',
    action: 'This usually happens when the conversation history is corrupted. Please start a new conversation.',
    severity: 'error',
  },
  STREAM_ERROR: {
    title: 'Stream Error',
    description: 'The response stream was interrupted.',
    action: 'The request will be automatically retried.',
    severity: 'warning',
  },
  PARSE_ERROR: {
    title: 'Parse Error',
    description: 'Could not parse the API response.',
    action: 'This is likely a temporary issue. Please try again.',
    severity: 'warning',
  },
}

export function getErrorMessageMapping(code: ProviderErrorCode): ErrorMessageMapping {
  return ERROR_MESSAGE_MAPPINGS[code] || {
    title: 'Unknown Error',
    description: 'An unexpected error occurred.',
    action: 'Please try again or contact support if the issue persists.',
    severity: 'error',
  }
}

export function formatUserFriendlyError(error: ProviderError): string {
  const mapping = getErrorMessageMapping(error.code)
  const parts = [mapping.title]
  
  if (error.requestId) {
    parts.push(`(Request ID: ${error.requestId})`)
  }
  
  parts.push('\n' + mapping.description)
  parts.push('\n' + mapping.action)
  
  return parts.join(' ')
}

export function getErrorSeverity(code: ProviderErrorCode): 'error' | 'warning' | 'info' {
  return getErrorMessageMapping(code).severity
}

export function shouldShowErrorToUser(code: ProviderErrorCode): boolean {
  const mapping = getErrorMessageMapping(code)
  return mapping.severity === 'error' || mapping.severity === 'warning'
}

const RETRIABLE_ERROR_CODES = new Set<ProviderErrorCode>([
  'RATE_LIMIT',
  'SERVER_ERROR',
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'STREAM_ERROR',
])

const RETRIABLE_STATUS_CODES: Set<number> = new Set([
  408,
  409,
  429,
  500,
  502,
  503,
  504,
  529,
])

const RETRIABLE_NETWORK_CODES: Set<string> = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
])

export function isRetriableErrorDetailed(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return RETRIABLE_ERROR_CODES.has(error.code)
  }
  
  if (error && typeof error === 'object') {
    const anyError = error as any
    
    if (anyError.status && RETRIABLE_STATUS_CODES.has(anyError.status)) {
      return true
    }
    
    if (anyError.code && RETRIABLE_NETWORK_CODES.has(String(anyError.code))) {
      return true
    }
    
    const shouldRetry = anyError.headers?.['x-should-retry']
    if (shouldRetry === 'true') return true
    if (shouldRetry === 'false') return false
  }
  
  return false
}

export function getRetryDelay(
  error: unknown,
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000
): number {
  let delay = baseDelayMs * Math.pow(2, attempt)
  delay = Math.min(delay, maxDelayMs)
  
  if (error instanceof RateLimitError && error.retryAfter) {
    delay = Math.max(delay, error.retryAfter * 1000)
  }
  
  if (error instanceof ServiceUnavailableError && error.retryAfter) {
    delay = Math.max(delay, error.retryAfter * 1000)
  }
  
  if (error && typeof error === 'object') {
    const anyError = error as any
    const retryAfterHeader = anyError.headers?.['retry-after']
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10)
      if (!isNaN(seconds)) {
        delay = Math.max(delay, seconds * 1000)
      }
    }
  }
  
  return delay
}

export function applyJitter(delayMs: number, jitterFactor: number = 0.2): number {
  const jitter = delayMs * jitterFactor * (Math.random() - 0.5) * 2
  return Math.max(0, Math.floor(delayMs + jitter))
}
