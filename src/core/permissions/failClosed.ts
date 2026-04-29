export type FailClosedReason =
  | 'parse_error'
  | 'validation_error'
  | 'classifier_malformed'
  | 'sandbox_unavailable'
  | 'rule_ambiguous'
  | 'unknown_state'
  | 'timeout'
  | 'network_error'
  | 'permission_denied'

export interface FailClosedResult {
  decision: 'deny' | 'ask'
  reason: FailClosedReason
  message: string
  recoverable: boolean
  suggestedActions?: string[]
  metadata?: Record<string, unknown>
}

export interface FailClosedConfig {
  defaultDecision: 'deny' | 'ask'
  logErrors: boolean
  collectMetrics: boolean
  maxRetryAttempts: number
  retryDelayMs: number
}

export const DEFAULT_FAIL_CLOSED_CONFIG: FailClosedConfig = {
  defaultDecision: 'deny',
  logErrors: true,
  collectMetrics: true,
  maxRetryAttempts: 2,
  retryDelayMs: 100,
}

export class FailClosedHandler {
  private config: FailClosedConfig
  private metrics: Map<FailClosedReason, number> = new Map()

  constructor(config: Partial<FailClosedConfig> = {}) {
    this.config = { ...DEFAULT_FAIL_CLOSED_CONFIG, ...config }
  }

  handleParseError(
    context: string,
    error: Error,
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('parse_error')

    return {
      decision: this.config.defaultDecision,
      reason: 'parse_error',
      message: `Parse error in ${context}: ${error.message}`,
      recoverable: false,
      suggestedActions: [
        'Check input format',
        'Review parsing logic',
        'Contact support if issue persists',
      ],
      metadata: {
        context,
        error: error.message,
        ...metadata,
      },
    }
  }

  handleValidationError(
    context: string,
    errors: string[],
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('validation_error')

    return {
      decision: this.config.defaultDecision,
      reason: 'validation_error',
      message: `Validation failed in ${context}: ${errors.join(', ')}`,
      recoverable: false,
      suggestedActions: [
        'Fix validation errors',
        'Check input constraints',
        'Review validation rules',
      ],
      metadata: {
        context,
        errors,
        ...metadata,
      },
    }
  }

  handleClassifierMalformed(
    rawOutput: string,
    parseErrors: string[],
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('classifier_malformed')

    return {
      decision: 'ask',
      reason: 'classifier_malformed',
      message: 'Classifier output is malformed. Defaulting to ask for safety.',
      recoverable: true,
      suggestedActions: [
        'Review classifier configuration',
        'Check model output format',
        'Consider manual approval for this operation',
      ],
      metadata: {
        rawOutput: rawOutput.substring(0, 200),
        parseErrors,
        ...metadata,
      },
    }
  }

  handleSandboxUnavailable(
    sandboxType: string,
    fallbackAvailable: boolean,
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('sandbox_unavailable')

    return {
      decision: fallbackAvailable ? 'ask' : 'deny',
      reason: 'sandbox_unavailable',
      message: `Sandbox '${sandboxType}' is unavailable. ${
        fallbackAvailable
          ? 'Fallback execution requires approval.'
          : 'Execution denied for safety.'
      }`,
      recoverable: fallbackAvailable,
      suggestedActions: fallbackAvailable
        ? [
            'Approve fallback execution',
            'Fix sandbox configuration',
            'Use alternative sandbox',
          ]
        : [
            'Fix sandbox configuration',
            'Install required sandbox tools',
            'Contact system administrator',
          ],
      metadata: {
        sandboxType,
        fallbackAvailable,
        ...metadata,
      },
    }
  }

  handleRuleAmbiguous(
    conflictingRules: string[],
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('rule_ambiguous')

    return {
      decision: 'ask',
      reason: 'rule_ambiguous',
      message: `Ambiguous rule matching detected: ${conflictingRules.join(', ')}`,
      recoverable: true,
      suggestedActions: [
        'Review conflicting rules',
        'Clarify rule priorities',
        'Update rule configuration',
      ],
      metadata: {
        conflictingRules,
        ...metadata,
      },
    }
  }

  handleUnknownState(
    context: string,
    state: unknown,
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('unknown_state')

    return {
      decision: this.config.defaultDecision,
      reason: 'unknown_state',
      message: `Unknown state encountered in ${context}`,
      recoverable: false,
      suggestedActions: [
        'Report this issue',
        'Check system logs',
        'Restart the session',
      ],
      metadata: {
        context,
        state: String(state),
        ...metadata,
      },
    }
  }

  handleTimeout(
    operation: string,
    timeoutMs: number,
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('timeout')

    return {
      decision: 'deny',
      reason: 'timeout',
      message: `Operation '${operation}' timed out after ${timeoutMs}ms`,
      recoverable: true,
      suggestedActions: [
        'Retry the operation',
        'Increase timeout value',
        'Check system performance',
      ],
      metadata: {
        operation,
        timeoutMs,
        ...metadata,
      },
    }
  }

  handleNetworkError(
    operation: string,
    error: Error,
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('network_error')

    return {
      decision: 'deny',
      reason: 'network_error',
      message: `Network error during '${operation}': ${error.message}`,
      recoverable: true,
      suggestedActions: [
        'Check network connection',
        'Retry the operation',
        'Check API endpoint availability',
      ],
      metadata: {
        operation,
        error: error.message,
        ...metadata,
      },
    }
  }

  handlePermissionDenied(
    resource: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): FailClosedResult {
    this.recordMetric('permission_denied')

    return {
      decision: 'deny',
      reason: 'permission_denied',
      message: `Permission denied for '${resource}': ${reason}`,
      recoverable: false,
      suggestedActions: [
        'Check permission settings',
        'Request necessary permissions',
        'Contact administrator',
      ],
      metadata: {
        resource,
        reason,
        ...metadata,
      },
    }
  }

  private recordMetric(reason: FailClosedReason): void {
    if (!this.config.collectMetrics) {
      return
    }

    const current = this.metrics.get(reason) || 0
    this.metrics.set(reason, current + 1)
  }

  getMetrics(): Map<FailClosedReason, number> {
    return new Map(this.metrics)
  }

  resetMetrics(): void {
    this.metrics.clear()
  }

  updateConfig(updates: Partial<FailClosedConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  getConfig(): FailClosedConfig {
    return { ...this.config }
  }
}

export function createFailClosedDeny(
  reason: FailClosedReason,
  message: string,
  metadata?: Record<string, unknown>,
): FailClosedResult {
  return {
    decision: 'deny',
    reason,
    message,
    recoverable: false,
    metadata,
  }
}

export function createFailClosedAsk(
  reason: FailClosedReason,
  message: string,
  suggestedActions?: string[],
  metadata?: Record<string, unknown>,
): FailClosedResult {
  return {
    decision: 'ask',
    reason,
    message,
    recoverable: true,
    suggestedActions,
    metadata,
  }
}
