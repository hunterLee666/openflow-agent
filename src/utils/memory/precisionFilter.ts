import type { MemoryCard, MemoryCategory } from '@assistant/types'
import type { RetrievalScore } from './memoryRetriever'

export type PrecisionLevel = 'conservative' | 'balanced' | 'aggressive'

export type PrecisionConfig = {
  level: PrecisionLevel
  thresholds: {
    high: number
    medium: number
    low: number
  }
  maxCards: number
  categoryWeights: Record<MemoryCategory, number>
  recencyBonus: number
  accessCountPenalty: number
}

export const PRECISION_PRESETS: Record<PrecisionLevel, PrecisionConfig> = {
  conservative: {
    level: 'conservative',
    thresholds: {
      high: 0.85,
      medium: 0.75,
      low: 0.65,
    },
    maxCards: 3,
    categoryWeights: {
      preference: 1.0,
      project_context: 0.9,
      workflow: 0.8,
      correction: 1.1,
    },
    recencyBonus: 0.05,
    accessCountPenalty: 0.02,
  },
  balanced: {
    level: 'balanced',
    thresholds: {
      high: 0.75,
      medium: 0.65,
      low: 0.55,
    },
    maxCards: 5,
    categoryWeights: {
      preference: 1.0,
      project_context: 1.0,
      workflow: 0.9,
      correction: 1.0,
    },
    recencyBonus: 0.03,
    accessCountPenalty: 0.01,
  },
  aggressive: {
    level: 'aggressive',
    thresholds: {
      high: 0.65,
      medium: 0.55,
      low: 0.45,
    },
    maxCards: 7,
    categoryWeights: {
      preference: 1.0,
      project_context: 1.0,
      workflow: 1.0,
      correction: 1.0,
    },
    recencyBonus: 0.02,
    accessCountPenalty: 0.005,
  },
}

export function getThresholdForConfidence(
  confidence: 'high' | 'medium' | 'low',
  config: PrecisionConfig,
): number {
  return config.thresholds[confidence]
}

export function shouldInject(
  card: MemoryCard,
  score: number,
  config: PrecisionConfig,
): { inject: boolean; reason: string } {
  const threshold = getThresholdForConfidence(card.confidence, config)
  
  if (score < threshold) {
    return {
      inject: false,
      reason: `Score ${score.toFixed(2)} below threshold ${threshold.toFixed(2)} for ${card.confidence} confidence`,
    }
  }
  
  if (card.scope.isGlobal === false && !card.scope.projectRoot) {
    return {
      inject: false,
      reason: 'Card has invalid scope (not global and no project root)',
    }
  }
  
  if (card.evidence.toLowerCase().includes('temporary') ||
      card.evidence.toLowerCase().includes('todo') ||
      card.evidence.toLowerCase().includes('pending')) {
    return {
      inject: false,
      reason: 'Card contains temporary/pending markers in evidence',
    }
  }
  
  return {
    inject: true,
    reason: `Score ${score.toFixed(2)} meets threshold ${threshold.toFixed(2)}`,
  }
}

export function adjustScore(
  card: MemoryCard,
  baseScore: number,
  config: PrecisionConfig,
): number {
  let adjustedScore = baseScore
  
  const categoryWeight = config.categoryWeights[card.category] ?? 1.0
  adjustedScore *= categoryWeight
  
  const ageInDays = (Date.now() - card.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  if (ageInDays < 7) {
    adjustedScore += config.recencyBonus
  }
  
  if (card.accessCount > 10) {
    adjustedScore -= config.accessCountPenalty * Math.log(card.accessCount)
  }
  
  return Math.max(0, Math.min(1, adjustedScore))
}

export function precisionFirstFilter(
  cards: MemoryCard[],
  scores: RetrievalScore[],
  config: PrecisionConfig = PRECISION_PRESETS.conservative,
): { cards: MemoryCard[]; filtered: Array<{ card: MemoryCard; reason: string }> } {
  const cardMap = new Map(cards.map(c => [c.id, c]))
  const filtered: Array<{ card: MemoryCard; reason: string }> = []
  const passed: Array<{ card: MemoryCard; score: number }> = []
  
  for (const scoreResult of scores) {
    const card = cardMap.get(scoreResult.cardId)
    if (!card) continue
    
    const adjustedScore = adjustScore(card, scoreResult.score, config)
    const decision = shouldInject(card, adjustedScore, config)
    
    if (decision.inject) {
      passed.push({ card, score: adjustedScore })
    } else {
      filtered.push({ card, reason: decision.reason })
    }
  }
  
  passed.sort((a, b) => b.score - a.score)
  
  const topCards = passed
    .slice(0, config.maxCards)
    .map(p => p.card)
  
  return {
    cards: topCards,
    filtered,
  }
}

export function deduplicateCards(cards: MemoryCard[]): MemoryCard[] {
  const seen = new Map<string, MemoryCard>()
  
  for (const card of cards) {
    const key = `${card.category}:${card.title.toLowerCase().trim()}`
    const existing = seen.get(key)
    
    if (!existing) {
      seen.set(key, card)
    } else {
      if (card.updatedAt > existing.updatedAt) {
        seen.set(key, card)
      }
    }
  }
  
  return Array.from(seen.values())
}

export function prioritizeByCategory(
  cards: MemoryCard[],
  priorityOrder: MemoryCategory[] = ['correction', 'preference', 'project_context', 'workflow'],
): MemoryCard[] {
  const grouped = new Map<MemoryCategory, MemoryCard[]>()
  
  for (const card of cards) {
    const group = grouped.get(card.category) ?? []
    group.push(card)
    grouped.set(card.category, group)
  }
  
  const result: MemoryCard[] = []
  for (const category of priorityOrder) {
    const group = grouped.get(category) ?? []
    result.push(...group)
  }
  
  return result
}

export function estimateTokenCost(cards: MemoryCard[]): {
  estimatedTokens: number
  perCard: Array<{ id: string; tokens: number }>
} {
  const perCard = cards.map(card => {
    const titleTokens = Math.ceil(card.title.length / 4)
    const descTokens = Math.ceil(card.description.length / 4)
    const evidenceTokens = Math.ceil(card.evidence.length / 4)
    const overhead = 20
    
    return {
      id: card.id,
      tokens: titleTokens + descTokens + evidenceTokens + overhead,
    }
  })
  
  const totalTokens = perCard.reduce((sum, c) => sum + c.tokens, 0)
  
  return {
    estimatedTokens: totalTokens,
    perCard,
  }
}

export function budgetAwareFilter(
  cards: MemoryCard[],
  scores: RetrievalScore[],
  tokenBudget: number,
  config: PrecisionConfig = PRECISION_PRESETS.conservative,
): { cards: MemoryCard[]; usedTokens: number; remainingBudget: number } {
  const { cards: filteredCards } = precisionFirstFilter(cards, scores, config)
  const deduped = deduplicateCards(filteredCards)
  
  const result: MemoryCard[] = []
  let usedTokens = 0
  
  for (const card of deduped) {
    const cardTokens = Math.ceil(
      (card.title.length + card.description.length + card.evidence.length) / 4
    ) + 20
    
    if (usedTokens + cardTokens <= tokenBudget) {
      result.push(card)
      usedTokens += cardTokens
    }
  }
  
  return {
    cards: result,
    usedTokens,
    remainingBudget: tokenBudget - usedTokens,
  }
}

export function createPrecisionFilter(
  level: PrecisionLevel = 'conservative',
): (cards: MemoryCard[], scores: RetrievalScore[]) => MemoryCard[] {
  const config = PRECISION_PRESETS[level]
  
  return (cards: MemoryCard[], scores: RetrievalScore[]): MemoryCard[] => {
    const { cards: filtered } = precisionFirstFilter(cards, scores, config)
    return deduplicateCards(filtered)
  }
}
