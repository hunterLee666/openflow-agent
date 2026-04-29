import { getModelManager } from '@utils/model'
import { countTokens, countCachedTokens } from '@utils/model/tokens'
import type { Message } from '@query'

export interface TokenBudgetInfo {
  used: number
  total: number
  remaining: number
  cached: number
  percentage: number
  usedPercentage: number
}

export interface BudgetWarningLevel {
  level: 'ok' | 'info' | 'advisory' | 'warning' | 'critical'
  threshold: number
  message: string
  recommendation: string
  shouldSuggestCompact: boolean
}

const MAX_TOKENS_FALLBACK = 200_000

export const BUDGET_THRESHOLDS = {
  OK: 75,
  INFO: 60,
  ADVISORY: 40,
  WARNING: 25,
  CRITICAL: 10,
} as const

export function getTokenBudget(messages: Message[]): TokenBudgetInfo {
  const modelManager = getModelManager()
  const modelProfile = modelManager.getModel('main')
  const total = modelProfile?.contextLength || MAX_TOKENS_FALLBACK
  
  const used = countTokens(messages)
  const cached = countCachedTokens(messages)
  const remaining = Math.max(0, total - used)
  const percentage = Math.round((remaining / total) * 100)
  const usedPercentage = Math.round((used / total) * 100)
  
  return {
    used,
    total,
    remaining,
    cached,
    percentage,
    usedPercentage,
  }
}

export function shouldWarnAboutBudget(budget: TokenBudgetInfo): boolean {
  return budget.percentage < BUDGET_THRESHOLDS.WARNING
}

export function isBudgetCritical(budget: TokenBudgetInfo): boolean {
  return budget.percentage < BUDGET_THRESHOLDS.CRITICAL
}

export function isBudgetAdvisory(budget: TokenBudgetInfo): boolean {
  return budget.percentage < BUDGET_THRESHOLDS.ADVISORY
}

export function isBudgetInfo(budget: TokenBudgetInfo): boolean {
  return budget.percentage < BUDGET_THRESHOLDS.INFO
}

export function getBudgetWarningLevel(budget: TokenBudgetInfo): 'critical' | 'warning' | 'ok' {
  if (budget.percentage < BUDGET_THRESHOLDS.CRITICAL) return 'critical'
  if (budget.percentage < BUDGET_THRESHOLDS.WARNING) return 'warning'
  return 'ok'
}

export function getDetailedBudgetWarning(budget: TokenBudgetInfo): BudgetWarningLevel {
  if (budget.percentage < BUDGET_THRESHOLDS.CRITICAL) {
    return {
      level: 'critical',
      threshold: BUDGET_THRESHOLDS.CRITICAL,
      message: 'CRITICAL: Context window nearly exhausted',
      recommendation: 'Use /compact immediately or reduce conversation complexity. Be extremely concise.',
      shouldSuggestCompact: true,
    }
  }
  
  if (budget.percentage < BUDGET_THRESHOLDS.WARNING) {
    return {
      level: 'warning',
      threshold: BUDGET_THRESHOLDS.WARNING,
      message: 'WARNING: Context window running low',
      recommendation: 'Consider using /compact to reduce context. Prioritize essential information.',
      shouldSuggestCompact: true,
    }
  }
  
  if (budget.percentage < BUDGET_THRESHOLDS.ADVISORY) {
    return {
      level: 'advisory',
      threshold: BUDGET_THRESHOLDS.ADVISORY,
      message: 'ADVISORY: Context window 60% used',
      recommendation: 'Be mindful of token usage. Consider compacting if conversation continues.',
      shouldSuggestCompact: false,
    }
  }
  
  if (budget.percentage < BUDGET_THRESHOLDS.INFO) {
    return {
      level: 'info',
      threshold: BUDGET_THRESHOLDS.INFO,
      message: 'INFO: Context window approaching moderate usage',
      recommendation: 'No action needed yet. Monitor usage in long conversations.',
      shouldSuggestCompact: false,
    }
  }
  
  return {
    level: 'ok',
    threshold: BUDGET_THRESHOLDS.OK,
    message: 'Context window usage is healthy',
    recommendation: 'Continue as normal.',
    shouldSuggestCompact: false,
  }
}

export function formatBudgetForDisplay(budget: TokenBudgetInfo): string {
  const warning = getDetailedBudgetWarning(budget)
  const emoji = warning.level === 'critical' ? '🔴' 
    : warning.level === 'warning' ? '🟠'
    : warning.level === 'advisory' ? '🟡'
    : warning.level === 'info' ? '🔵'
    : '🟢'
  
  return `${emoji} Tokens: ${budget.used.toLocaleString()}/${budget.total.toLocaleString()} (${budget.usedPercentage}% used, ${budget.percentage}% remaining)`
}

export function getBudgetHintMessage(budget: TokenBudgetInfo): string {
  const warning = getDetailedBudgetWarning(budget)
  return `${warning.message}. ${warning.recommendation}`
}

export function shouldTrigger60PercentWarning(budget: TokenBudgetInfo): boolean {
  return budget.usedPercentage >= BUDGET_THRESHOLDS.INFO
}

export function get60PercentWarningMessage(budget: TokenBudgetInfo): string | null {
  if (!shouldTrigger60PercentWarning(budget)) {
    return null
  }
  
  const warning = getDetailedBudgetWarning(budget)
  
  if (warning.level === 'ok') {
    return null
  }
  
  return `📊 Context Usage: ${budget.usedPercentage}% (${budget.used.toLocaleString()} / ${budget.total.toLocaleString()} tokens)
${warning.message}
💡 ${warning.recommendation}`
}

export function estimateTurnsBeforeCompact(budget: TokenBudgetInfo, avgTokensPerTurn: number = 2000): number {
  const tokensUntilWarning = Math.floor(budget.total * (1 - BUDGET_THRESHOLDS.WARNING / 100)) - budget.used
  return Math.max(0, Math.floor(tokensUntilWarning / avgTokensPerTurn))
}

export function getBudgetSummary(budget: TokenBudgetInfo): string {
  const warning = getDetailedBudgetWarning(budget)
  const turnsLeft = estimateTurnsBeforeCompact(budget)
  
  return `
Context Budget Summary:
- Used: ${budget.used.toLocaleString()} tokens (${budget.usedPercentage}%)
- Remaining: ${budget.remaining.toLocaleString()} tokens (${budget.percentage}%)
- Cached: ${budget.cached.toLocaleString()} tokens
- Status: ${warning.level.toUpperCase()}
- Estimated turns until compact needed: ${turnsLeft}
${warning.shouldSuggestCompact ? '- ⚠️ Consider using /compact' : ''}
`.trim()
}
