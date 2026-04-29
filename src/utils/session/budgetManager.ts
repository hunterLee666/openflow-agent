import { getModelManager } from '@utils/model'
import { getGlobalConfig } from '@utils/config'
import { addToTotalCost, getTotalCost } from '@costTracker'
import { countTokens } from '@utils/model/tokens'
import { Message } from '@query'
import { debug as debugLogger } from '@utils/log/debugLogger'

export type TerminationReason =
  | 'completed'
  | 'cancelled'
  | 'token_window_exceeded'
  | 'money_budget_exceeded'
  | 'max_turns_exceeded'
  | 'compaction_circuit_breaker'
  | 'fatal_error'

export interface BudgetVerdict {
  ok: boolean
  reason?: TerminationReason
  details?: {
    currentTurn?: number
    maxTurns?: number
    currentCostUsd?: number
    maxCostUsd?: number
    currentTokens?: number
    maxTokens?: number
    percentUsed?: number
  }
}

export interface BudgetState {
  currentTurn: number
  maxTurns: number
  estimatedCostUsd: number
  maxCostUsd?: number
  currentTokenUsage: number
  tokenWindowLimit: number
  tokenWarningThreshold: number
}

export interface BudgetConfig {
  maxTurns?: number
  maxCostUsd?: number
  tokenWarningThresholdRatio?: number
}

const DEFAULT_MAX_TURNS = 100
const DEFAULT_TOKEN_WARNING_RATIO = 0.87
const MAX_TOKENS_FALLBACK = 200_000

export function createBudgetState(config: BudgetConfig = {}): BudgetState {
  const modelManager = getModelManager()
  const modelProfile = modelManager.getModel('main')
  
  const tokenWindowLimit = modelProfile?.contextLength || MAX_TOKENS_FALLBACK
  const tokenWarningThresholdRatio = config.tokenWarningThresholdRatio ?? DEFAULT_TOKEN_WARNING_RATIO
  
  return {
    currentTurn: 0,
    maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
    estimatedCostUsd: getTotalCost(),
    maxCostUsd: config.maxCostUsd,
    currentTokenUsage: 0,
    tokenWindowLimit,
    tokenWarningThreshold: Math.floor(tokenWindowLimit * tokenWarningThresholdRatio),
  }
}

export function updateBudgetState(
  state: BudgetState,
  updates: Partial<BudgetState>
): BudgetState {
  return { ...state, ...updates }
}

export function incrementTurn(state: BudgetState): BudgetState {
  return { ...state, currentTurn: state.currentTurn + 1 }
}

export function addCost(state: BudgetState, costUsd: number): BudgetState {
  return { ...state, estimatedCostUsd: state.estimatedCostUsd + costUsd }
}

export function updateTokenUsage(state: BudgetState, messages: Message[]): BudgetState {
  const tokenCount = countTokens(messages)
  return { ...state, currentTokenUsage: tokenCount }
}

export function checkTokenBudget(state: BudgetState): BudgetVerdict {
  if (state.currentTokenUsage >= state.tokenWindowLimit) {
    const percentUsed = Math.round(
      (state.currentTokenUsage / state.tokenWindowLimit) * 100
    )
    
    debugLogger.warn('BUDGET_TOKEN_EXCEEDED', {
      currentTokens: state.currentTokenUsage,
      maxTokens: state.tokenWindowLimit,
      percentUsed,
    })
    
    return {
      ok: false,
      reason: 'token_window_exceeded',
      details: {
        currentTokens: state.currentTokenUsage,
        maxTokens: state.tokenWindowLimit,
        percentUsed,
      },
    }
  }
  
  return { ok: true }
}

export function checkMoneyBudget(state: BudgetState): BudgetVerdict {
  if (state.maxCostUsd === undefined) {
    return { ok: true }
  }
  
  if (state.estimatedCostUsd >= state.maxCostUsd) {
    debugLogger.warn('BUDGET_MONEY_EXCEEDED', {
      currentCost: state.estimatedCostUsd,
      maxCost: state.maxCostUsd,
    })
    
    return {
      ok: false,
      reason: 'money_budget_exceeded',
      details: {
        currentCostUsd: state.estimatedCostUsd,
        maxCostUsd: state.maxCostUsd,
      },
    }
  }
  
  return { ok: true }
}

export function checkTurnBudget(state: BudgetState): BudgetVerdict {
  if (state.currentTurn > state.maxTurns) {
    debugLogger.warn('BUDGET_TURNS_EXCEEDED', {
      currentTurn: state.currentTurn,
      maxTurns: state.maxTurns,
    })
    
    return {
      ok: false,
      reason: 'max_turns_exceeded',
      details: {
        currentTurn: state.currentTurn,
        maxTurns: state.maxTurns,
      },
    }
  }
  
  return { ok: true }
}

export function checkAllBudgets(state: BudgetState): BudgetVerdict {
  const tokenCheck = checkTokenBudget(state)
  if (!tokenCheck.ok) return tokenCheck
  
  const moneyCheck = checkMoneyBudget(state)
  if (!moneyCheck.ok) return moneyCheck
  
  const turnCheck = checkTurnBudget(state)
  if (!turnCheck.ok) return turnCheck
  
  return { ok: true }
}

export function shouldTriggerCompaction(state: BudgetState): boolean {
  return state.currentTokenUsage >= state.tokenWarningThreshold
}

export function getBudgetSummary(state: BudgetState): string {
  const lines: string[] = []
  
  lines.push(`Turn: ${state.currentTurn}/${state.maxTurns}`)
  lines.push(`Tokens: ${state.currentTokenUsage.toLocaleString()}/${state.tokenWindowLimit.toLocaleString()} (${Math.round((state.currentTokenUsage / state.tokenWindowLimit) * 100)}%)`)
  
  if (state.maxCostUsd !== undefined) {
    lines.push(`Cost: $${state.estimatedCostUsd.toFixed(4)}/$${state.maxCostUsd.toFixed(2)}`)
  } else {
    lines.push(`Cost: $${state.estimatedCostUsd.toFixed(4)}`)
  }
  
  return lines.join(' | ')
}

export function getBudgetWarningMessage(verdict: BudgetVerdict): string {
  if (verdict.ok) return ''
  if (!verdict.reason) return 'Budget check failed'
  
  const messages: Record<TerminationReason, string> = {
    completed: 'Task completed successfully',
    cancelled: 'Operation was cancelled',
    token_window_exceeded: `Context window exceeded. Current usage: ${verdict.details?.currentTokens?.toLocaleString()} tokens (${verdict.details?.percentUsed}% of limit). Consider starting a new conversation or using /compact to reduce context.`,
    money_budget_exceeded: `Cost budget exceeded. Current: $${verdict.details?.currentCostUsd?.toFixed(4)}, Limit: $${verdict.details?.maxCostUsd?.toFixed(2)}. Please adjust your budget limit or start a new session.`,
    max_turns_exceeded: `Maximum turns exceeded (${verdict.details?.currentTurn}/${verdict.details?.maxTurns}). Consider breaking down your task into smaller parts.`,
    compaction_circuit_breaker: 'Context compression has failed multiple times. Please start a new conversation to continue.',
    fatal_error: 'A fatal error occurred. Please check the logs for details.',
  }
  
  return messages[verdict.reason] || 'Unknown budget issue'
}

export const MAX_COMPACTION_FAILURES = 3

export interface CompactionCircuitState {
  failures: number
  isOpen: boolean
  lastFailureTime?: number
  lastError?: string
}

export function createCompactionCircuitState(): CompactionCircuitState {
  return {
    failures: 0,
    isOpen: false,
  }
}

export function recordCompactionFailure(
  state: CompactionCircuitState,
  error?: string
): CompactionCircuitState {
  const newFailures = state.failures + 1
  const isOpen = newFailures >= MAX_COMPACTION_FAILURES
  
  if (isOpen) {
    debugLogger.error('COMPACTION_CIRCUIT_OPEN', {
      failures: newFailures,
      maxFailures: MAX_COMPACTION_FAILURES,
      lastError: error,
    })
  }
  
  return {
    failures: newFailures,
    isOpen,
    lastFailureTime: Date.now(),
    lastError: error,
  }
}

export function recordCompactionSuccess(
  state: CompactionCircuitState
): CompactionCircuitState {
  return {
    failures: 0,
    isOpen: false,
    lastFailureTime: undefined,
    lastError: undefined,
  }
}

export function checkCompactionCircuit(
  state: CompactionCircuitState
): BudgetVerdict {
  if (state.isOpen) {
    return {
      ok: false,
      reason: 'compaction_circuit_breaker',
      details: {
        currentTurn: state.failures,
        maxTurns: MAX_COMPACTION_FAILURES,
      },
    }
  }
  
  return { ok: true }
}

export class CompactionCircuitOpenError extends Error {
  constructor(
    public readonly failures: number,
    public readonly lastError?: string
  ) {
    super(
      `Compaction circuit breaker opened after ${failures} consecutive failures${lastError ? `: ${lastError}` : ''}`
    )
    this.name = 'CompactionCircuitOpenError'
  }
}
