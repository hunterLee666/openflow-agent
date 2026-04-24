import type { ErrorCategory } from './types';

export class ApiError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends ApiError {
  constructor(
    message: string,
    public readonly rateLimitInfo: { requestsRemaining: number; resetAt: Date; limit: number },
    details?: Record<string, unknown>
  ) {
    super('rate_limit_error', 'RATE_LIMIT_EXCEEDED', message, true, 429, details);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('auth_error', 'AUTHENTICATION_FAILED', message, false, 401, details);
  }
}

export class NetworkError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('network_error', 'NETWORK_ERROR', message, true, undefined, details);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('validation_error', 'VALIDATION_FAILED', message, false, 400, details);
  }
}

export function categorizeError(error: unknown, statusCode?: number): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (statusCode === 401 || statusCode === 403) {
    return new AuthenticationError(message);
  }

  if (statusCode === 429) {
    return new NetworkError(message);
  }

  if (statusCode === 400) {
    return new ValidationError(message);
  }

  if (error instanceof TypeError || error instanceof SyntaxError) {
    return new ApiError('validation_error', 'PARSE_ERROR', message, false, statusCode);
  }

  if (statusCode && statusCode >= 500) {
    return new ApiError('api_error', 'SERVER_ERROR', message, true, statusCode);
  }

  return new ApiError('unknown_error', 'UNKNOWN', message, false, statusCode);
}