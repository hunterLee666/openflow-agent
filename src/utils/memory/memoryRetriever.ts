import type { MemoryCard, MemoryEntry } from '@assistant/types'
import { queryQuick } from '@services/llm'
import { getGlobalMemory } from './memoryManager'
import { logError } from '@utils/log'

export type RetrievalScore = {
  cardId: string
  score: number
  reason: string
}

export type RetrievalResult = {
  cards: MemoryCard[]
  scores: RetrievalScore[]
  query: string
  retrievedAt: Date
}

export type RetrievalConfig = {
  maxCards: number
  minScore: number
  enableSemanticSearch: boolean
  timeout: number
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxCards: 5,
  minScore: 0.75,
  enableSemanticSearch: true,
  timeout: 10000,
}

export async function dualModelRetrieve(
  candidates: MemoryCard[],
  query: string,
  context?: {
    projectRoot?: string
    recentTopics?: string[]
  },
  config: Partial<RetrievalConfig> = {},
): Promise<RetrievalResult> {
  const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...config }
  const now = new Date()

  if (candidates.length === 0) {
    return {
      cards: [],
      scores: [],
      query,
      retrievedAt: now,
    }
  }

  const filteredByScope = filterByScope(candidates, context?.projectRoot)

  if (!cfg.enableSemanticSearch || filteredByScope.length <= cfg.maxCards) {
    const limited = filteredByScope.slice(0, cfg.maxCards)
    return {
      cards: limited,
      scores: limited.map(card => ({
        cardId: card.id,
        score: 1.0,
        reason: 'Direct retrieval (no semantic search needed)',
      })),
      query,
      retrievedAt: now,
    }
  }

  try {
    const scores = await scoreWithSonnet(filteredByScope, query, cfg.timeout)
    
    const sortedScores = scores
      .filter(s => s.score >= cfg.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, cfg.maxCards)

    const topCards = sortedScores
      .map(s => filteredByScope.find(c => c.id === s.cardId))
      .filter((c): c is MemoryCard => c !== undefined)

    return {
      cards: topCards,
      scores: sortedScores,
      query,
      retrievedAt: now,
    }
  } catch (error) {
    logError(error)
    
    const fallback = filteredByScope.slice(0, cfg.maxCards)
    return {
      cards: fallback,
      scores: fallback.map(card => ({
        cardId: card.id,
        score: 0.5,
        reason: 'Fallback due to semantic search failure',
      })),
      query,
      retrievedAt: now,
    }
  }
}

function filterByScope(cards: MemoryCard[], projectRoot?: string): MemoryCard[] {
  if (!projectRoot) {
    return cards.filter(c => c.scope.isGlobal)
  }
  
  return cards.filter(c => {
    if (c.scope.isGlobal) return true
    if (c.scope.projectRoot === projectRoot) return true
    return false
  })
}

async function scoreWithSonnet(
  cards: MemoryCard[],
  query: string,
  timeout: number,
): Promise<RetrievalScore[]> {
  const cardList = cards.map((c, i) => 
    `${i + 1}. [${c.category}] ${c.title}: ${c.description}`
  ).join('\n')

  const systemPrompt = [
    'You are a memory retrieval assistant. Score each memory card for relevance to the query.',
    'Return a JSON array with objects containing: index (number), score (0.0-1.0), reason (brief explanation).',
    'Score based on:',
    '- Direct relevance to the query topic',
    '- Applicability to the current context',
    '- Actionability of the information',
    'Be conservative: if uncertain, give a lower score.',
  ]

  const userPrompt = `Query: "${query}"

Memory Cards:
${cardList}

Return JSON array with scores for each card. Example:
[{"index": 1, "score": 0.85, "reason": "Directly addresses the query topic"}]`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await queryQuick({
      systemPrompt,
      userPrompt,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const content = typeof response.message.content === 'string'
      ? response.message.content
      : response.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')

    return parseScoreResponse(content, cards)
  } catch (error) {
    throw error
  }
}

function parseScoreResponse(content: string, cards: MemoryCard[]): RetrievalScore[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return cards.map(c => ({
        cardId: c.id,
        score: 0.5,
        reason: 'Failed to parse score response',
      }))
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    if (!Array.isArray(parsed)) {
      return cards.map(c => ({
        cardId: c.id,
        score: 0.5,
        reason: 'Invalid score format',
      }))
    }

    return parsed.map((item: any, idx: number) => {
      const cardIndex = (item.index ?? idx + 1) - 1
      const card = cards[cardIndex]
      
      if (!card) {
        return {
          cardId: `unknown-${idx}`,
          score: 0,
          reason: 'Card not found',
        }
      }

      return {
        cardId: card.id,
        score: Math.max(0, Math.min(1, Number(item.score) || 0)),
        reason: String(item.reason || 'No reason provided'),
      }
    })
  } catch {
    return cards.map(c => ({
      cardId: c.id,
      score: 0.5,
      reason: 'JSON parse error',
    }))
  }
}

export function keywordMatchScore(cards: MemoryCard[], query: string): RetrievalScore[] {
  const queryWords = new Set(
    query.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
  )

  return cards.map(card => {
    const titleWords = new Set(
      card.title.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
    )
    const descWords = new Set(
      card.description.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
    )

    const titleMatches = [...queryWords].filter(w => titleWords.has(w)).length
    const descMatches = [...queryWords].filter(w => descWords.has(w)).length
    
    const titleScore = titleMatches / Math.max(queryWords.size, 1) * 0.6
    const descScore = descMatches / Math.max(queryWords.size, 1) * 0.4
    const totalScore = Math.min(1, titleScore + descScore)

    return {
      cardId: card.id,
      score: totalScore,
      reason: `Keyword match: ${titleMatches} title, ${descMatches} description`,
    }
  })
}

export async function hybridRetrieve(
  cards: MemoryCard[],
  query: string,
  context?: {
    projectRoot?: string
    recentTopics?: string[]
  },
  config: Partial<RetrievalConfig> = {},
): Promise<RetrievalResult> {
  const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...config }
  const filtered = filterByScope(cards, context?.projectRoot)

  if (filtered.length === 0) {
    return {
      cards: [],
      scores: [],
      query,
      retrievedAt: new Date(),
    }
  }

  const keywordScores = keywordMatchScore(filtered, query)
  
  const highKeywordMatches = keywordScores
    .filter(s => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)

  if (highKeywordMatches.length >= cfg.maxCards) {
    const topScores = highKeywordMatches.slice(0, cfg.maxCards)
    const topCards = topScores
      .map(s => filtered.find(c => c.id === s.cardId))
      .filter((c): c is MemoryCard => c !== undefined)

    return {
      cards: topCards,
      scores: topScores,
      query,
      retrievedAt: new Date(),
    }
  }

  return dualModelRetrieve(filtered, query, context, config)
}

export function entriesToCards(entries: MemoryEntry[]): MemoryCard[] {
  return entries
    .map(entry => {
      if (!entry.title || !entry.description) {
        return {
          id: entry.id,
          title: entry.content.slice(0, 50),
          description: entry.content,
          category: entry.category ?? 'preference',
          scope: entry.scope ?? { isGlobal: false },
          confidence: entry.confidence ?? 'medium',
          evidence: entry.evidence ?? 'No evidence',
          createdAt: entry.timestamp,
          updatedAt: entry.timestamp,
          accessCount: 0,
          source: 'auto_extracted' as const,
        }
      }
      return {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        category: entry.category ?? 'preference',
        scope: entry.scope ?? { isGlobal: false },
        confidence: entry.confidence ?? 'medium',
        evidence: entry.evidence ?? 'No evidence',
        createdAt: entry.timestamp,
        updatedAt: entry.timestamp,
        accessCount: 0,
        source: 'auto_extracted' as const,
      }
    })
}

export async function retrieveMemories(
  query: string,
  context?: {
    projectRoot?: string
    recentTopics?: string[]
  },
  config: Partial<RetrievalConfig> = {},
): Promise<RetrievalResult> {
  const memory = getGlobalMemory()
  const entries = await memory.getRecent(100)
  const cards = entriesToCards(entries)
  
  return hybridRetrieve(cards, query, context, config)
}
