import type { MemoryEntry, MemoryCard, MemoryCategory } from '@assistant/types'
import { queryQuick } from '@services/llm'
import { createMemoryCard, validateMemoryCard } from './memoryManager'
import { logError } from '@utils/log'

export type DistillationPattern = 
  | 'user_preference'
  | 'project_context'
  | 'workflow_pattern'
  | 'error_correction'
  | 'tool_usage_pattern'

export type DistillationResult = {
  cards: MemoryCard[]
  patterns: Array<{
    pattern: DistillationPattern
    count: number
    examples: string[]
  }>
  processedEntries: number
  skippedEntries: number
}

export type DistillationConfig = {
  maxCardsPerRun: number
  minOccurrences: number
  enablePreferenceExtraction: boolean
  enableContextExtraction: boolean
  enableWorkflowExtraction: boolean
  enableCorrectionExtraction: boolean
  timeout: number
}

const DEFAULT_DISTILLATION_CONFIG: DistillationConfig = {
  maxCardsPerRun: 10,
  minOccurrences: 2,
  enablePreferenceExtraction: true,
  enableContextExtraction: true,
  enableWorkflowExtraction: true,
  enableCorrectionExtraction: true,
  timeout: 30000,
}

const DISTILLATION_PROMPTS = {
  preference: `Analyze the following memory entries and extract user preferences.
Look for patterns like:
- Preferred coding style or conventions
- Tool or library preferences
- Workflow preferences
- Communication style preferences

For each preference found, provide:
- title: A concise label (max 50 chars)
- description: Brief explanation (max 200 chars)
- evidence: Quote from the memories that supports this
- confidence: "high", "medium", or "low"

Return a JSON array of preferences. Example:
[{"title": "Prefers TypeScript", "description": "User consistently chooses TypeScript over JavaScript", "evidence": "User requested TypeScript in 5 sessions", "confidence": "high"}]`,

  context: `Analyze the following memory entries and extract project context.
Look for patterns like:
- Project structure or architecture decisions
- Domain-specific knowledge
- Team conventions
- Technical constraints

For each context found, provide:
- title: A concise label (max 50 chars)
- description: Brief explanation (max 200 chars)
- evidence: Quote from the memories that supports this
- confidence: "high", "medium", or "low"

Return a JSON array of context items.`,

  workflow: `Analyze the following memory entries and extract workflow patterns.
Look for patterns like:
- Common task sequences
- Repeated problem-solving approaches
- Standard operating procedures
- Automation opportunities

For each workflow found, provide:
- title: A concise label (max 50 chars)
- description: Brief explanation (max 200 chars)
- evidence: Quote from the memories that supports this
- confidence: "high", "medium", or "low"

Return a JSON array of workflow patterns.`,

  correction: `Analyze the following memory entries and extract error corrections.
Look for patterns like:
- Mistakes that were corrected
- Solutions to recurring problems
- Gotchas and pitfalls discovered
- Best practices learned from errors

For each correction found, provide:
- title: A concise label (max 50 chars)
- description: Brief explanation (max 200 chars)
- evidence: Quote from the memories that supports this
- confidence: "high", "medium", or "low"

Return a JSON array of corrections.`,
}

export async function distillMemories(
  entries: MemoryEntry[],
  projectRoot?: string,
  config: Partial<DistillationConfig> = {},
): Promise<DistillationResult> {
  const cfg = { ...DEFAULT_DISTILLATION_CONFIG, ...config }
  const cards: MemoryCard[] = []
  const patterns: Array<{
    pattern: DistillationPattern
    count: number
    examples: string[]
  }> = []

  if (entries.length === 0) {
    return {
      cards: [],
      patterns: [],
      processedEntries: 0,
      skippedEntries: 0,
    }
  }

  const entriesText = entries
    .map(e => `[${e.type}] ${e.content}`)
    .join('\n')

  const scope = {
    isGlobal: false,
    projectRoot,
  }

  let processedEntries = 0
  let skippedEntries = 0

  if (cfg.enablePreferenceExtraction) {
    try {
      const preferenceCards = await extractPattern(
        entriesText,
        'preference',
        scope,
        cfg.timeout,
      )
      cards.push(...preferenceCards)
      patterns.push({
        pattern: 'user_preference',
        count: preferenceCards.length,
        examples: preferenceCards.slice(0, 2).map(c => c.title),
      })
      processedEntries += preferenceCards.length
    } catch (error) {
      logError(error)
    }
  }

  if (cfg.enableContextExtraction) {
    try {
      const contextCards = await extractPattern(
        entriesText,
        'context',
        scope,
        cfg.timeout,
      )
      cards.push(...contextCards)
      patterns.push({
        pattern: 'project_context',
        count: contextCards.length,
        examples: contextCards.slice(0, 2).map(c => c.title),
      })
      processedEntries += contextCards.length
    } catch (error) {
      logError(error)
    }
  }

  if (cfg.enableWorkflowExtraction) {
    try {
      const workflowCards = await extractPattern(
        entriesText,
        'workflow',
        scope,
        cfg.timeout,
      )
      cards.push(...workflowCards)
      patterns.push({
        pattern: 'workflow_pattern',
        count: workflowCards.length,
        examples: workflowCards.slice(0, 2).map(c => c.title),
      })
      processedEntries += workflowCards.length
    } catch (error) {
      logError(error)
    }
  }

  if (cfg.enableCorrectionExtraction) {
    try {
      const correctionCards = await extractPattern(
        entriesText,
        'correction',
        scope,
        cfg.timeout,
      )
      cards.push(...correctionCards)
      patterns.push({
        pattern: 'error_correction',
        count: correctionCards.length,
        examples: correctionCards.slice(0, 2).map(c => c.title),
      })
      processedEntries += correctionCards.length
    } catch (error) {
      logError(error)
    }
  }

  const validCards = cards
    .filter(card => {
      const errors = validateMemoryCard({
        title: card.title,
        description: card.description,
        category: card.category,
        scope: card.scope,
        confidence: card.confidence,
        evidence: card.evidence,
      })
      return errors.length === 0
    })
    .slice(0, cfg.maxCardsPerRun)

  skippedEntries = cards.length - validCards.length

  return {
    cards: validCards,
    patterns,
    processedEntries,
    skippedEntries,
  }
}

async function extractPattern(
  entriesText: string,
  patternType: 'preference' | 'context' | 'workflow' | 'correction',
  scope: { isGlobal: boolean; projectRoot?: string },
  timeout: number,
): Promise<MemoryCard[]> {
  const systemPrompt = DISTILLATION_PROMPTS[patternType]
  
  const categoryMap: Record<string, MemoryCategory> = {
    preference: 'preference',
    context: 'project_context',
    workflow: 'workflow',
    correction: 'correction',
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await queryQuick({
      systemPrompt: [systemPrompt],
      userPrompt: `Memory Entries:\n${entriesText}\n\nExtract ${patternType} patterns as JSON array:`,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const content = typeof response.message.content === 'string'
      ? response.message.content
      : response.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')

    const extracted = parseExtractionResult(content)
    
    return extracted.map(item => createMemoryCard({
      title: item.title,
      description: item.description,
      category: categoryMap[patternType],
      scope,
      confidence: item.confidence ?? 'medium',
      evidence: item.evidence,
      source: 'dream_distilled',
    }))
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

function parseExtractionResult(content: string): Array<{
  title: string
  description: string
  evidence: string
  confidence: 'high' | 'medium' | 'low'
}> {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item: any) => item.title && item.description)
      .map((item: any) => ({
        title: String(item.title).slice(0, 100),
        description: String(item.description).slice(0, 500),
        evidence: String(item.evidence || 'No evidence provided'),
        confidence: ['high', 'medium', 'low'].includes(item.confidence)
          ? item.confidence
          : 'medium' as const,
      }))
  } catch {
    return []
  }
}

export function mergeDuplicateCards(cards: MemoryCard[]): MemoryCard[] {
  const merged = new Map<string, MemoryCard>()

  for (const card of cards) {
    const key = `${card.category}:${card.title.toLowerCase().trim()}`
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, card)
    } else {
      const combinedEvidence = [
        existing.evidence,
        card.evidence,
      ].filter(e => e && e !== 'No evidence provided').join('; ')

      merged.set(key, {
        ...existing,
        evidence: combinedEvidence || existing.evidence,
        confidence: getHigherConfidence(existing.confidence, card.confidence),
        updatedAt: new Date(),
        accessCount: existing.accessCount + card.accessCount,
      })
    }
  }

  return Array.from(merged.values())
}

function getHigherConfidence(
  a: 'high' | 'medium' | 'low',
  b: 'high' | 'medium' | 'low',
): 'high' | 'medium' | 'low' {
  const order = { high: 3, medium: 2, low: 1 }
  return order[a] >= order[b] ? a : b
}

export function summarizeCards(cards: MemoryCard[]): string {
  if (cards.length === 0) {
    return 'No distilled memories'
  }

  const byCategory = cards.reduce((acc, card) => {
    const cat = card.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(card)
    return acc
  }, {} as Record<MemoryCategory, MemoryCard[]>)

  const sections = Object.entries(byCategory).map(([category, categoryCards]) => {
    const items = categoryCards
      .map(c => `- ${c.title}: ${c.description}`)
      .join('\n')
    return `## ${category.toUpperCase()}\n${items}`
  })

  return `# Distilled Memories\n\n${sections.join('\n\n')}`
}
