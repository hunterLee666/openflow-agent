import type { ProviderErrorCode } from '../../infra/providers/core/errors'

export type AppErrorKind = 'api' | 'network' | 'auth' | 'rate_limit' | 'mcp' | 'lsp' | 'unknown'

export interface ApiError {
  kind: 'api'
  status: number
  code?: string
  message: string
  requestId?: string
  retryable: boolean
  provider?: string
}

export interface NetworkError {
  kind: 'network'
  code: 'ECONNRESET' | 'ETIMEDOUT' | 'ENOTFOUND' | 'ECONNREFUSED' | 'EAI_AGAIN' | string
  message: string
  retryable: true
  cause?: Error
}

export interface AuthError {
  kind: 'auth'
  reason: 'expired' | 'invalid' | 'missing' | 'refresh_failed'
  message: string
  retryable: false
}

export interface RateLimitError {
  kind: 'rate_limit'
  retryAfterMs?: number
  message: string
  requestId?: string
  retryable: true
  limitType?: 'requests' | 'tokens'
}

export interface McpError {
  kind: 'mcp'
  serverName: string
  code: string
  message: string
  retryable: boolean
  method?: string
}

export interface LspError {
  kind: 'lsp'
  language: string
  code: string
  message: string
  retryable: boolean
  operation?: string
}

export interface UnknownError {
  kind: 'unknown'
  message: string
  raw?: unknown
  retryable: false
}

export type AppError = ApiError | NetworkError | AuthError | RateLimitError | McpError | LspError | UnknownError

export function isRetryable(e: AppError): boolean {
  if (!e.retryable) return false
  if (e.kind === 'api' && e.status >= 400 && e.status < 500) return false
  return true
}

export function isApiError(e: AppError): e is ApiError {
  return e.kind === 'api'
}

export function isNetworkError(e: AppError): e is NetworkError {
  return e.kind === 'network'
}

export function isAuthError(e: AppError): e is AuthError {
  return e.kind === 'auth'
}

export function isRateLimitError(e: AppError): e is RateLimitError {
  return e.kind === 'rate_limit'
}

export function isMcpError(e: AppError): e is McpError {
  return e.kind === 'mcp'
}

export function isLspError(e: AppError): e is LspError {
  return e.kind === 'lsp'
}

export function toAppError(error: unknown, context?: { provider?: string; subsystem?: string }): AppError {
  if (isAppError(error)) return error

  if (error && typeof error === 'object') {
    const anyError = error as Record<string, unknown>

    if (anyError.kind && typeof anyError.kind === 'string' && isAppErrorKind(anyError.kind)) {
      return error as AppError
    }

    const status = anyError.status || anyError.statusCode || (anyError.response as Record<string, unknown>)?.status
    const requestId = anyError.request_id || anyError.requestId || (anyError.headers as Record<string, unknown>)?.['x-request-id']
    const message = String(anyError.message || 'Unknown error')

    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        reason: status === 401 ? 'invalid' : 'missing',
        message,
        retryable: false,
      }
    }

    if (status === 429) {
      const retryAfter = anyError.headers?.['retry-after'] || anyError.retry_after
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
      return {
        kind: 'rate_limit',
        retryAfterMs,
        message,
        requestId: requestId as string,
        retryable: true,
      }
    }

    if (status && typeof status === 'number' && status >= 500) {
      return {
        kind: 'api',
        status,
        code: String(anyError.code || 'SERVER_ERROR'),
        message,
        requestId: requestId as string,
        retryable: true,
        provider: context?.provider,
      }
    }

    if (status && typeof status === 'number' && status >= 400) {
      return {
        kind: 'api',
        status,
        code: String(anyError.code || 'CLIENT_ERROR'),
        message,
        requestId: requestId as string,
        retryable: false,
        provider: context?.provider,
      }
    }

    const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']
    if (anyError.code && networkCodes.includes(String(anyError.code))) {
      return {
        kind: 'network',
        code: String(anyError.code),
        message,
        retryable: true,
        cause: error as Error,
      }
    }
  }

  return {
    kind: 'unknown',
    message: error instanceof Error ? error.message : 'Unknown error',
    raw: error,
    retryable: false,
  }
}

function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return 'kind' in obj && typeof obj.kind === 'string' && isAppErrorKind(obj.kind)
}

function isAppErrorKind(value: string): value is AppErrorKind {
  return ['api', 'network', 'auth', 'rate_limit', 'mcp', 'lsp', 'unknown'].includes(value)
}

export function fromProviderErrorCode(code: ProviderErrorCode, message: string, options?: {
  status?: number
  requestId?: string
  provider?: string
}): AppError {
  switch (code) {
    case 'RATE_LIMIT':
      return { kind: 'rate_limit', message, requestId: options?.requestId, retryable: true }
    case 'AUTH_FAILED':
      return { kind: 'auth', reason: 'invalid', message, retryable: false }
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return { kind: 'network', code: code, message, retryable: true }
    case 'SERVER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return {
        kind: 'api',
        status: options?.status || 500,
        message,
        requestId: options?.requestId,
        retryable: true,
        provider: options?.provider,
      }
    default:
      return {
        kind: 'api',
        status: options?.status || 400,
        code,
        message,
        requestId: options?.requestId,
        retryable: false,
        provider: options?.provider,
      }
  }
}

export interface ErrorStrategy {
  action: 'retry' | 'refresh_auth' | 'user_action' | 'abort'
  delayMs?: number
  userMessage: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export function getErrorStrategy(e: AppError): ErrorStrategy {
  switch (e.kind) {
    case 'rate_limit':
      return {
        action: 'retry',
        delayMs: e.retryAfterMs || 5000,
        userMessage: `请求过于频繁，将在 ${Math.ceil((e.retryAfterMs || 5000) / 1000)} 秒后重试`,
        logLevel: 'warn',
      }
    case 'auth':
      return {
        action: 'refresh_auth',
        userMessage: '认证已过期，请重新登录',
        logLevel: 'error',
      }
    case 'network':
      return {
        action: 'retry',
        delayMs: 1000,
        userMessage: '网络连接异常，正在重试...',
        logLevel: 'warn',
      }
    case 'api':
      if (e.retryable) {
        return {
          action: 'retry',
          delayMs: 2000,
          userMessage: '服务暂时不可用，正在重试...',
          logLevel: 'warn',
        }
      }
      return {
        action: 'user_action',
        userMessage: `请求错误: ${e.message}`,
        logLevel: 'error',
      }
    case 'mcp':
      return {
        action: e.retryable ? 'retry' : 'user_action',
        delayMs: e.retryable ? 1000 : undefined,
        userMessage: `MCP服务(${e.serverName})错误: ${e.message}`,
        logLevel: 'warn',
      }
    case 'lsp':
      return {
        action: e.retryable ? 'retry' : 'user_action',
        delayMs: e.retryable ? 500 : undefined,
        userMessage: `语言服务(${e.language})错误: ${e.message}`,
        logLevel: 'warn',
      }
    default:
      return {
        action: 'abort',
        userMessage: `未知错误: ${e.message}`,
        logLevel: 'error',
      }
  }
}

export function formatErrorForLog(e: AppError): string {
  const parts = [`[${e.kind}]`, e.message]

  if (e.kind === 'api') {
    parts.push(`status=${e.status}`)
    if (e.code) parts.push(`code=${e.code}`)
    if (e.requestId) parts.push(`requestId=${e.requestId}`)
  } else if (e.kind === 'network') {
    parts.push(`code=${e.code}`)
  } else if (e.kind === 'rate_limit') {
    if (e.retryAfterMs) parts.push(`retryAfter=${e.retryAfterMs}ms`)
    if (e.requestId) parts.push(`requestId=${e.requestId}`)
  } else if (e.kind === 'mcp') {
    parts.push(`server=${e.serverName}`)
    parts.push(`code=${e.code}`)
  } else if (e.kind === 'lsp') {
    parts.push(`language=${e.language}`)
    parts.push(`code=${e.code}`)
  }

  parts.push(`retryable=${e.retryable}`)

  return parts.join(' ')
}

export function formatErrorForUser(e: AppError): string {
  const strategy = getErrorStrategy(e)
  return strategy.userMessage
}
