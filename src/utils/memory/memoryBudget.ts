import type { MemoryCard } from '@assistant/types'
import { estimateTokenCost } from './precisionFilter'

export type MemoryBudgetConfig = {
  maxMemoryTokens: number
  warningThreshold: number
  criticalThreshold: number
  reservedForSystem: number
  reservedForTools: number
}

export const DEFAULT_MEMORY_BUDGET_CONFIG: MemoryBudgetConfig = {
  maxMemoryTokens: 2000,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  reservedForSystem: 500,
  reservedForTools: 1000,
}

export type MemoryBudgetStatus = {
  usedTokens: number
  maxTokens: number
  utilizationPercent: number
  status: 'ok' | 'warning' | 'critical'
  cardCount: number
  perCard: Array<{
    id: string
    title: string
    tokens: number
    percentOfBudget: number
  }>
}

export type BudgetAllocation = {
  systemPrompt: number
  tools: number
  memories: number
  userContent: number
  response: number
}

export const DEFAULT_BUDGET_ALLOCATION: BudgetAllocation = {
  systemPrompt: 2000,
  tools: 1000,
  memories: 2000,
  userContent: 8000,
  response: 4000,
}

export class MemoryBudgetTracker {
  private config: MemoryBudgetConfig
  private currentCards: MemoryCard[] = []
  private currentTokens: number = 0

  constructor(config: Partial<MemoryBudgetConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_BUDGET_CONFIG, ...config }
  }

  setCards(cards: MemoryCard[]): MemoryBudgetStatus {
    this.currentCards = cards
    const cost = estimateTokenCost(cards)
    this.currentTokens = cost.estimatedTokens
    return this.getStatus()
  }

  addCard(card: MemoryCard): { added: boolean; status: MemoryBudgetStatus } {
    const cardTokens = this.estimateCardTokens(card)
    const newTotal = this.currentTokens + cardTokens

    if (newTotal > this.config.maxMemoryTokens) {
      return {
        added: false,
        status: this.getStatus(),
      }
    }

    this.currentCards.push(card)
    this.currentTokens = newTotal
    return {
      added: true,
      status: this.getStatus(),
    }
  }

  removeCard(cardId: string): MemoryBudgetStatus {
    const index = this.currentCards.findIndex(c => c.id === cardId)
    if (index >= 0) {
      const removed = this.currentCards.splice(index, 1)[0]
      this.currentTokens -= this.estimateCardTokens(removed)
    }
    return this.getStatus()
  }

  getStatus(): MemoryBudgetStatus {
    const utilizationPercent = (this.currentTokens / this.config.maxMemoryTokens) * 100
    
    let status: 'ok' | 'warning' | 'critical'
    if (utilizationPercent >= this.config.criticalThreshold * 100) {
      status = 'critical'
    } else if (utilizationPercent >= this.config.warningThreshold * 100) {
      status = 'warning'
    } else {
      status = 'ok'
    }

    const cost = estimateTokenCost(this.currentCards)

    return {
      usedTokens: this.currentTokens,
      maxTokens: this.config.maxMemoryTokens,
      utilizationPercent,
      status,
      cardCount: this.currentCards.length,
      perCard: cost.perCard.map(c => {
        const card = this.currentCards.find(card => card.id === c.id)
        return {
          id: c.id,
          title: card?.title ?? 'Unknown',
          tokens: c.tokens,
          percentOfBudget: (c.tokens / this.config.maxMemoryTokens) * 100,
        }
      }),
    }
  }

  getAvailableTokens(): number {
    return Math.max(0, this.config.maxMemoryTokens - this.currentTokens)
  }

  canFitCards(cards: MemoryCard[]): { canFit: boolean; requiredTokens: number } {
    const cost = estimateTokenCost(cards)
    const canFit = this.currentTokens + cost.estimatedTokens <= this.config.maxMemoryTokens
    return {
      canFit,
      requiredTokens: cost.estimatedTokens,
    }
  }

  optimizeForBudget(targetTokens: number): MemoryCard[] {
    if (this.currentTokens <= targetTokens) {
      return [...this.currentCards]
    }

    const sorted = [...this.currentCards].sort((a, b) => {
      const priorityOrder = { correction: 0, preference: 1, project_context: 2, workflow: 3 }
      const aPriority = priorityOrder[a.category] ?? 4
      const bPriority = priorityOrder[b.category] ?? 4
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }
      
      const confidenceOrder = { high: 0, medium: 1, low: 2 }
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
    })

    const result: MemoryCard[] = []
    let usedTokens = 0

    for (const card of sorted) {
      const cardTokens = this.estimateCardTokens(card)
      if (usedTokens + cardTokens <= targetTokens) {
        result.push(card)
        usedTokens += cardTokens
      }
    }

    return result
  }

  private estimateCardTokens(card: MemoryCard): number {
    return Math.ceil(
      (card.title.length + card.description.length + card.evidence.length) / 4
    ) + 20
  }
}

export function createMemoryBudgetTracker(
  config?: Partial<MemoryBudgetConfig>,
): MemoryBudgetTracker {
  return new MemoryBudgetTracker(config)
}

export function calculateContextBudget(
  totalContextWindow: number,
  allocation: Partial<BudgetAllocation> = {},
): BudgetAllocation & { total: number } {
  const alloc = { ...DEFAULT_BUDGET_ALLOCATION, ...allocation }
  const total = alloc.systemPrompt + alloc.tools + alloc.memories + alloc.userContent + alloc.response
  
  if (total > totalContextWindow) {
    const scale = totalContextWindow / total
    return {
      systemPrompt: Math.floor(alloc.systemPrompt * scale),
      tools: Math.floor(alloc.tools * scale),
      memories: Math.floor(alloc.memories * scale),
      userContent: Math.floor(alloc.userContent * scale),
      response: Math.floor(alloc.response * scale),
      total: totalContextWindow,
    }
  }

  return { ...alloc, total }
}

export function formatBudgetStatus(status: MemoryBudgetStatus): string {
  const statusIcon = {
    ok: '🟢',
    warning: '🟡',
    critical: '🔴',
  }[status.status]

  const lines = [
    `${statusIcon} Memory Budget: ${status.usedTokens}/${status.maxTokens} tokens (${status.utilizationPercent.toFixed(1)}%)`,
    `Cards: ${status.cardCount}`,
  ]

  if (status.perCard.length > 0) {
    lines.push('\nTop cards by token usage:')
    const topCards = status.perCard
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5)
    
    for (const card of topCards) {
      lines.push(`  - ${card.title}: ${card.tokens} tokens (${card.percentOfBudget.toFixed(1)}%)`)
    }
  }

  return lines.join('\n')
}
