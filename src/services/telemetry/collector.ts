import {
  type TelemetryEvent,
  type ToolUseTelemetry,
  type QueryTelemetry,
  type SessionTelemetry,
  type ErrorTelemetry,
  STANDARD_EVENT_NAMES,
  formatTelemetryEvent,
  createToolUseTelemetry,
  createQueryTelemetry,
  createSessionTelemetry,
  createErrorTelemetry,
} from './types'

export interface TelemetryCollector {
  trackToolUse(telemetry: ToolUseTelemetry): void
  trackQuery(telemetry: QueryTelemetry): void
  trackSession(telemetry: SessionTelemetry): void
  trackError(telemetry: ErrorTelemetry): void
  getEvents(): TelemetryEvent[]
  flush(): Promise<void>
}

class InMemoryTelemetryCollector implements TelemetryCollector {
  private events: TelemetryEvent[] = []
  private sessionId: string
  private maxEvents: number

  constructor(sessionId: string, maxEvents: number = 1000) {
    this.sessionId = sessionId
    this.maxEvents = maxEvents
  }

  trackToolUse(telemetry: ToolUseTelemetry): void {
    this.addEvent({
      name: telemetry.success ? STANDARD_EVENT_NAMES.TOOL_USE : STANDARD_EVENT_NAMES.TOOL_ERROR,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: {
        toolName: telemetry.toolName,
        toolCategory: telemetry.toolCategory,
        success: telemetry.success,
        isReadOnly: telemetry.isReadOnly,
        isConcurrencySafe: telemetry.isConcurrencySafe,
        riskLevel: telemetry.riskLevel,
        cachedResult: telemetry.cachedResult,
        errorMessage: telemetry.errorMessage,
        errorType: telemetry.errorType,
      },
      measurements: {
        inputSize: telemetry.inputSize,
        outputSize: telemetry.outputSize,
        durationMs: telemetry.durationMs,
        retryCount: telemetry.retryCount,
      },
    })
  }

  trackQuery(telemetry: QueryTelemetry): void {
    this.addEvent({
      name: telemetry.success ? STANDARD_EVENT_NAMES.QUERY_END : STANDARD_EVENT_NAMES.ERROR_OCCURRED,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: {
        modelId: telemetry.modelId,
        success: telemetry.success,
        terminationReason: telemetry.terminationReason,
        budgetNearLimit: telemetry.budgetStatus.isNearLimit,
        budgetExceeded: telemetry.budgetStatus.isExceeded,
      },
      measurements: {
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        totalTokens: telemetry.totalTokens,
        costUsd: telemetry.costUsd,
        durationMs: telemetry.durationMs,
        turnCount: telemetry.turnCount,
        toolUseCount: telemetry.toolUseCount,
        tokenUsagePercent: telemetry.budgetStatus.tokenUsagePercent,
        costUsagePercent: telemetry.budgetStatus.costUsagePercent,
        turnUsagePercent: telemetry.budgetStatus.turnUsagePercent,
      },
    })
  }

  trackSession(telemetry: SessionTelemetry): void {
    this.addEvent({
      name: STANDARD_EVENT_NAMES.SESSION_END,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: {
        startTime: telemetry.startTime,
        endTime: telemetry.endTime,
        errorCount: telemetry.errors.length,
        errorTypes: telemetry.errors.map(e => e.type),
      },
      measurements: {
        durationMs: telemetry.durationMs,
        totalQueries: telemetry.totalQueries,
        totalToolUses: telemetry.totalToolUses,
        totalTokens: telemetry.totalTokens,
        totalCostUsd: telemetry.totalCostUsd,
        filesRead: telemetry.filesRead,
        filesWritten: telemetry.filesWritten,
        commandsExecuted: telemetry.commandsExecuted,
      },
    })
  }

  trackError(telemetry: ErrorTelemetry): void {
    this.addEvent({
      name: telemetry.recoverable ? STANDARD_EVENT_NAMES.ERROR_RECOVERED : STANDARD_EVENT_NAMES.ERROR_OCCURRED,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: {
        errorType: telemetry.errorType,
        errorMessage: telemetry.errorMessage,
        errorStack: telemetry.errorStack,
        context: telemetry.context,
        recoverable: telemetry.recoverable,
      },
      measurements: {
        retryCount: telemetry.retryCount,
      },
    })
  }

  getEvents(): TelemetryEvent[] {
    return [...this.events]
  }

  async flush(): Promise<void> {
    this.events = []
  }

  private addEvent(event: TelemetryEvent): void {
    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }
  }
}

let collectorInstance: TelemetryCollector | null = null

export function getTelemetryCollector(sessionId?: string): TelemetryCollector {
  if (!collectorInstance) {
    collectorInstance = new InMemoryTelemetryCollector(sessionId || 'default')
  }
  return collectorInstance
}

export function resetTelemetryCollector(sessionId: string): TelemetryCollector {
  collectorInstance = new InMemoryTelemetryCollector(sessionId)
  return collectorInstance
}

export {
  createToolUseTelemetry,
  createQueryTelemetry,
  createSessionTelemetry,
  createErrorTelemetry,
  formatTelemetryEvent,
}

export * from './types'
