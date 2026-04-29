import type { TerminationReason } from './budgetManager'

export type QueryStatus =
  | 'completed'
  | 'cancelled'
  | 'budget_exceeded'
  | 'fatal_error'
  | 'compaction_circuit_breaker'

export interface UsageCounters {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  estimatedCostUsd: number
}

export function createEmptyUsageCounters(): UsageCounters {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0,
  }
}

export function mergeUsageCounters(
  a: UsageCounters,
  b: Partial<UsageCounters>
): UsageCounters {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    totalTokens: a.totalTokens + (b.totalTokens ?? 0),
    cacheCreationTokens: a.cacheCreationTokens + (b.cacheCreationTokens ?? 0),
    cacheReadTokens: a.cacheReadTokens + (b.cacheReadTokens ?? 0),
    estimatedCostUsd: a.estimatedCostUsd + (b.estimatedCostUsd ?? 0),
  }
}

export interface QueryDiagnostics {
  requestId?: string
  modelUsed?: string
  provider?: string
  durationMs?: number
  turnCount?: number
  toolCallsCount?: number
  compactionCount?: number
}

export interface QueryResult {
  status: QueryStatus
  reason?: TerminationReason
  finalText?: string
  usage: UsageCounters
  diagnostics?: QueryDiagnostics
  error?: {
    message: string
    code?: string
    stack?: string
  }
}

export function createQueryResult(
  status: QueryStatus,
  options: Partial<QueryResult> = {}
): QueryResult {
  return {
    status,
    reason: options.reason,
    finalText: options.finalText,
    usage: options.usage ?? createEmptyUsageCounters(),
    diagnostics: options.diagnostics,
    error: options.error,
  }
}

export function createCompletedResult(
  finalText?: string,
  usage?: UsageCounters,
  diagnostics?: QueryDiagnostics
): QueryResult {
  return createQueryResult('completed', {
    reason: 'completed',
    finalText,
    usage,
    diagnostics,
  })
}

export function createCancelledResult(
  reason: string = 'User cancelled',
  usage?: UsageCounters
): QueryResult {
  return createQueryResult('cancelled', {
    reason: 'cancelled',
    finalText: reason,
    usage,
  })
}

export function createBudgetExceededResult(
  reason: TerminationReason,
  details: {
    message: string
    usage?: UsageCounters
    diagnostics?: QueryDiagnostics
  }
): QueryResult {
  return createQueryResult('budget_exceeded', {
    reason,
    finalText: details.message,
    usage: details.usage,
    diagnostics: details.diagnostics,
  })
}

export function createFatalErrorResult(
  error: Error,
  usage?: UsageCounters,
  diagnostics?: QueryDiagnostics
): QueryResult {
  return createQueryResult('fatal_error', {
    reason: 'fatal_error',
    finalText: error.message,
    usage,
    diagnostics,
    error: {
      message: error.message,
      stack: error.stack,
    },
  })
}

export function createCompactionCircuitResult(
  failures: number,
  lastError?: string,
  usage?: UsageCounters
): QueryResult {
  return createQueryResult('compaction_circuit_breaker', {
    reason: 'compaction_circuit_breaker',
    finalText: `Context compression failed ${failures} times. ${lastError ? `Last error: ${lastError}` : 'Please start a new conversation.'}`,
    usage,
  })
}

export function isTerminalStatus(status: QueryStatus): boolean {
  return status !== 'completed'
}

export function getQueryResultMessage(result: QueryResult): string {
  const messages: Record<QueryStatus, string> = {
    completed: 'Task completed successfully.',
    cancelled: 'Operation was cancelled by user.',
    budget_exceeded: getBudgetExceededMessage(result.reason),
    fatal_error: `A fatal error occurred: ${result.error?.message || 'Unknown error'}`,
    compaction_circuit_breaker: 'Context compression circuit breaker triggered. Please start a new conversation.',
  }
  
  return result.finalText || messages[result.status] || 'Unknown status'
}

function getBudgetExceededMessage(reason?: TerminationReason): string {
  switch (reason) {
    case 'token_window_exceeded':
      return 'Context window limit exceeded. Consider using /compact or starting a new conversation.'
    case 'money_budget_exceeded':
      return 'Cost budget limit exceeded. Please adjust your budget or start a new session.'
    case 'max_turns_exceeded':
      return 'Maximum conversation turns exceeded. Consider breaking down your task.'
    default:
      return 'Budget limit exceeded.'
  }
}

export interface QueryState {
  turn: number
  messages: any[]
  usage: UsageCounters
  compactionFailures: number
  compactionCircuitOpen: boolean
  startTime: number
  toolCallsCount: number
  compactionCount: number
}

export function createQueryState(messages: any[] = []): QueryState {
  return {
    turn: 0,
    messages,
    usage: createEmptyUsageCounters(),
    compactionFailures: 0,
    compactionCircuitOpen: false,
    startTime: Date.now(),
    toolCallsCount: 0,
    compactionCount: 0,
  }
}

export function incrementQueryStateTurn(state: QueryState): QueryState {
  return { ...state, turn: state.turn + 1 }
}

export function incrementToolCallsCount(state: QueryState): QueryState {
  return { ...state, toolCallsCount: state.toolCallsCount + 1 }
}

export function incrementCompactionCount(state: QueryState): QueryState {
  return { 
    ...state, 
    compactionCount: state.compactionCount + 1,
    compactionFailures: 0,
  }
}

export function recordCompactionFailureInState(state: QueryState): QueryState {
  const newFailures = state.compactionFailures + 1
  return {
    ...state,
    compactionFailures: newFailures,
    compactionCircuitOpen: newFailures >= 3,
  }
}

export function updateQueryStateUsage(
  state: QueryState,
  usage: Partial<UsageCounters>
): QueryState {
  return {
    ...state,
    usage: mergeUsageCounters(state.usage, usage),
  }
}

export function getQueryDiagnostics(
  state: QueryState,
  requestId?: string,
  modelUsed?: string,
  provider?: string
): QueryDiagnostics {
  return {
    requestId,
    modelUsed,
    provider,
    durationMs: Date.now() - state.startTime,
    turnCount: state.turn,
    toolCallsCount: state.toolCallsCount,
    compactionCount: state.compactionCount,
  }
}
