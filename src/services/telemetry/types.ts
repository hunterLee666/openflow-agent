export interface TelemetryEvent {
  name: string
  timestamp: string
  sessionId: string
  requestId?: string
  properties: Record<string, TelemetryValue>
  measurements?: Record<string, number>
}

export type TelemetryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TelemetryValue[]
  | { [key: string]: TelemetryValue }

export interface ToolUseTelemetry {
  toolName: string
  toolCategory: ToolCategory
  inputSize: number
  outputSize: number
  durationMs: number
  success: boolean
  errorMessage?: string
  errorType?: string
  isReadOnly: boolean
  isConcurrencySafe: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  cachedResult: boolean
  retryCount: number
}

export type ToolCategory =
  | 'filesystem'
  | 'search'
  | 'bash'
  | 'network'
  | 'mcp'
  | 'agent'
  | 'interaction'
  | 'ai'
  | 'system'

export interface QueryTelemetry {
  modelId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  durationMs: number
  turnCount: number
  toolUseCount: number
  success: boolean
  terminationReason?: string
  budgetStatus: BudgetTelemetry
}

export interface BudgetTelemetry {
  tokenUsagePercent: number
  costUsagePercent: number
  turnUsagePercent: number
  isNearLimit: boolean
  isExceeded: boolean
}

export interface SessionTelemetry {
  sessionId: string
  startTime: string
  endTime?: string
  durationMs: number
  totalQueries: number
  totalToolUses: number
  totalTokens: number
  totalCostUsd: number
  filesRead: number
  filesWritten: number
  commandsExecuted: number
  errors: Array<{
    type: string
    message: string
    count: number
  }>
}

export interface ErrorTelemetry {
  errorType: string
  errorMessage: string
  errorStack?: string
  context: Record<string, TelemetryValue>
  recoverable: boolean
  retryCount: number
}

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: 'filesystem',
  Write: 'filesystem',
  Edit: 'filesystem',
  MultiEdit: 'filesystem',
  Glob: 'filesystem',
  NotebookRead: 'filesystem',
  NotebookEdit: 'filesystem',
  Grep: 'search',
  LSP: 'search',
  ToolSearch: 'search',
  Bash: 'bash',
  KillShell: 'bash',
  TaskOutput: 'bash',
  WebFetch: 'network',
  WebSearch: 'network',
  mcp: 'mcp',
  ListMcpResources: 'mcp',
  ReadMcpResource: 'mcp',
  Task: 'agent',
  EnterPlanMode: 'agent',
  ExitPlanMode: 'agent',
  AskUserQuestion: 'interaction',
  TodoWrite: 'interaction',
  SlashCommand: 'interaction',
  AskExpertModel: 'ai',
  Skill: 'ai',
}

export function getToolCategory(toolName: string): ToolCategory {
  return TOOL_CATEGORIES[toolName] || 'system'
}

export function createToolUseTelemetry(
  toolName: string,
  input: unknown,
  output: unknown,
  durationMs: number,
  error?: Error,
  metadata?: {
    isReadOnly?: boolean
    isConcurrencySafe?: boolean
    riskLevel?: 'low' | 'medium' | 'high' | 'critical'
    cachedResult?: boolean
    retryCount?: number
  },
): ToolUseTelemetry {
  const inputSize = typeof input === 'string'
    ? input.length
    : JSON.stringify(input).length

  const outputSize = typeof output === 'string'
    ? output.length
    : JSON.stringify(output).length

  return {
    toolName,
    toolCategory: getToolCategory(toolName),
    inputSize,
    outputSize,
    durationMs,
    success: !error,
    errorMessage: error?.message,
    errorType: error?.constructor?.name,
    isReadOnly: metadata?.isReadOnly ?? true,
    isConcurrencySafe: metadata?.isConcurrencySafe ?? true,
    riskLevel: metadata?.riskLevel ?? 'low',
    cachedResult: metadata?.cachedResult ?? false,
    retryCount: metadata?.retryCount ?? 0,
  }
}

export function createQueryTelemetry(
  modelId: string,
  usage: {
    inputTokens: number
    outputTokens: number
  },
  costUsd: number,
  durationMs: number,
  turnCount: number,
  toolUseCount: number,
  success: boolean,
  terminationReason?: string,
  budgetStatus?: {
    tokenLimit?: number
    costLimit?: number
    turnLimit?: number
    tokenUsage?: number
    costUsage?: number
    turnUsage?: number
  },
): QueryTelemetry {
  const totalTokens = usage.inputTokens + usage.outputTokens

  const budget: BudgetTelemetry = {
    tokenUsagePercent: budgetStatus?.tokenLimit && budgetStatus?.tokenUsage
      ? (budgetStatus.tokenUsage / budgetStatus.tokenLimit) * 100
      : 0,
    costUsagePercent: budgetStatus?.costLimit && budgetStatus?.costUsage
      ? (budgetStatus.costUsage / budgetStatus.costLimit) * 100
      : 0,
    turnUsagePercent: budgetStatus?.turnLimit && budgetStatus?.turnUsage
      ? (budgetStatus.turnUsage / budgetStatus.turnLimit) * 100
      : 0,
    isNearLimit: false,
    isExceeded: false,
  }

  budget.isNearLimit =
    budget.tokenUsagePercent > 80 ||
    budget.costUsagePercent > 80 ||
    budget.turnUsagePercent > 80

  budget.isExceeded =
    budget.tokenUsagePercent > 100 ||
    budget.costUsagePercent > 100 ||
    budget.turnUsagePercent > 100

  return {
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens,
    costUsd,
    durationMs,
    turnCount,
    toolUseCount,
    success,
    terminationReason,
    budgetStatus: budget,
  }
}

export function createSessionTelemetry(
  sessionId: string,
  startTime: Date,
  stats: {
    totalQueries: number
    totalToolUses: number
    totalTokens: number
    totalCostUsd: number
    filesRead: number
    filesWritten: number
    commandsExecuted: number
    errors: Map<string, { message: string; count: number }>
  },
): SessionTelemetry {
  const endTime = new Date()
  const durationMs = endTime.getTime() - startTime.getTime()

  return {
    sessionId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMs,
    totalQueries: stats.totalQueries,
    totalToolUses: stats.totalToolUses,
    totalTokens: stats.totalTokens,
    totalCostUsd: stats.totalCostUsd,
    filesRead: stats.filesRead,
    filesWritten: stats.filesWritten,
    commandsExecuted: stats.commandsExecuted,
    errors: Array.from(stats.errors.entries()).map(([type, data]) => ({
      type,
      message: data.message,
      count: data.count,
    })),
  }
}

export function createErrorTelemetry(
  error: Error,
  context?: Record<string, TelemetryValue>,
  recoverable: boolean = false,
  retryCount: number = 0,
): ErrorTelemetry {
  return {
    errorType: error.constructor.name,
    errorMessage: error.message,
    errorStack: error.stack,
    context: context || {},
    recoverable,
    retryCount,
  }
}

export function formatTelemetryEvent(
  event: TelemetryEvent,
): string {
  return JSON.stringify({
    name: event.name,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    ...(event.requestId && { requestId: event.requestId }),
    properties: event.properties,
    ...(event.measurements && { measurements: event.measurements }),
  })
}

export const STANDARD_EVENT_NAMES = {
  TOOL_USE: 'tool_use',
  TOOL_ERROR: 'tool_error',
  QUERY_START: 'query_start',
  QUERY_END: 'query_end',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  BUDGET_WARNING: 'budget_warning',
  BUDGET_EXCEEDED: 'budget_exceeded',
  ERROR_OCCURRED: 'error_occurred',
  ERROR_RECOVERED: 'error_recovered',
} as const

export type StandardEventName = typeof STANDARD_EVENT_NAMES[keyof typeof STANDARD_EVENT_NAMES]
