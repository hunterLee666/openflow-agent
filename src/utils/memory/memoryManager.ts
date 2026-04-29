import { JarvisMemory } from '@assistant/memory'
import type { MemoryEntry, MemoryCard, MemoryCategory, MemoryScope } from '@assistant/types'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface StructuredMemory {
  statement: string
  evidence: string
  confidence: ConfidenceLevel
  type: MemoryEntry['type']
  metadata?: Record<string, unknown>
}

export interface MemoryCardInput {
  title: string
  description: string
  category: MemoryCategory
  scope: MemoryScope
  confidence: ConfidenceLevel
  evidence: string
  source?: 'auto_extracted' | 'user_provided' | 'dream_distilled'
}

let globalMemoryInstance: JarvisMemory | null = null

export function getGlobalMemory(): JarvisMemory {
  if (!globalMemoryInstance) {
    globalMemoryInstance = new JarvisMemory()
  }
  return globalMemoryInstance
}

export function resetGlobalMemory(): void {
  globalMemoryInstance = null
}

export async function getMemoriesForPrompt(maxCount: number = 5): Promise<MemoryEntry[]> {
  const memory = getGlobalMemory()
  try {
    const recent = await memory.getRecent(maxCount)
    return recent
  } catch {
    return []
  }
}

export async function appendMemory(
  type: MemoryEntry['type'],
  content: string,
  metadata?: Record<string, unknown>
): Promise<MemoryEntry> {
  const memory = getGlobalMemory()
  return memory.append({
    type,
    content,
    metadata,
  })
}

export async function appendStructuredMemory(
  structured: StructuredMemory
): Promise<MemoryEntry> {
  const memory = getGlobalMemory()
  return memory.append({
    type: structured.type,
    content: structured.statement,
    metadata: {
      ...structured.metadata,
      evidence: structured.evidence,
      confidence: structured.confidence,
    },
  })
}

export function createMemoryCard(input: MemoryCardInput): MemoryCard {
  const now = new Date()
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    description: input.description,
    category: input.category,
    scope: input.scope,
    confidence: input.confidence,
    evidence: input.evidence,
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    source: input.source ?? 'user_provided',
  }
}

export function entryToCard(entry: MemoryEntry): MemoryCard | null {
  if (!entry.title || !entry.description) {
    return null
  }
  
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    category: entry.category ?? 'preference',
    scope: entry.scope ?? { isGlobal: false },
    confidence: entry.confidence ?? 'medium',
    evidence: entry.evidence ?? 'No evidence provided',
    createdAt: entry.timestamp,
    updatedAt: entry.timestamp,
    accessCount: 0,
    source: 'auto_extracted',
  }
}

export function cardToEntry(card: MemoryCard, type: MemoryEntry['type'] = 'thought'): MemoryEntry {
  return {
    id: card.id,
    timestamp: card.updatedAt,
    type,
    content: `${card.title}: ${card.description}`,
    title: card.title,
    description: card.description,
    category: card.category,
    scope: card.scope,
    confidence: card.confidence,
    evidence: card.evidence,
    metadata: {
      accessCount: card.accessCount,
      lastAccessedAt: card.lastAccessedAt,
      source: card.source,
    },
  }
}

export function validateMemoryCard(card: Partial<MemoryCardInput>): string[] {
  const errors: string[] = []
  
  if (!card.title || card.title.trim().length === 0) {
    errors.push('Title is required and cannot be empty')
  } else if (card.title.length > 100) {
    errors.push('Title should be concise (max 100 characters)')
  }
  
  if (!card.description || card.description.trim().length === 0) {
    errors.push('Description is required and cannot be empty')
  } else if (card.description.length > 500) {
    errors.push('Description should be concise (max 500 characters)')
  }
  
  if (!card.category || !['preference', 'project_context', 'workflow', 'correction'].includes(card.category)) {
    errors.push('Category must be one of: preference, project_context, workflow, correction')
  }
  
  if (!card.confidence || !['high', 'medium', 'low'].includes(card.confidence)) {
    errors.push('Confidence must be one of: high, medium, low')
  }
  
  if (!card.evidence || card.evidence.trim().length === 0) {
    errors.push('Evidence is required and cannot be empty')
  }
  
  if (!card.scope || typeof card.scope.isGlobal !== 'boolean') {
    errors.push('Scope with isGlobal flag is required')
  }
  
  return errors
}

export async function searchMemories(query: string, limit: number = 10): Promise<MemoryEntry[]> {
  const memory = getGlobalMemory()
  return memory.search(query, limit)
}

export async function getMemoriesByType(type: MemoryEntry['type']): Promise<MemoryEntry[]> {
  const memory = getGlobalMemory()
  return memory.getByType(type)
}

export function formatMemoryForDisplay(entry: MemoryEntry): string {
  const timestamp = entry.timestamp.toISOString()
  const title = entry.title ? `[${entry.title}] ` : ''
  const category = entry.category ? ` [${entry.category.toUpperCase()}]` : ''
  const metadata = entry.metadata ? ` | ${JSON.stringify(entry.metadata)}` : ''
  return `[${timestamp}]${category} ${title}${entry.content}${metadata}`
}

export function formatMemoriesForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ''
  
  return entries.map((entry, index) => {
    const title = entry.title ?? entry.content.slice(0, 50)
    const description = entry.description ?? entry.content
    const confidence = entry.confidence ?? (entry.metadata as any)?.confidence ?? 'medium'
    const evidence = entry.evidence ?? (entry.metadata as any)?.evidence ?? 'N/A'
    const category = entry.category ?? 'preference'
    
    return `${index + 1}. **[${category.toUpperCase()}] ${title}**
   - Description: ${description}
   - Evidence: ${evidence}
   - Confidence: ${confidence}`
  }).join('\n\n')
}

export function formatCardsForPrompt(cards: MemoryCard[], maxCount: number = 5): string {
  const limited = cards.slice(0, maxCount)
  if (limited.length === 0) return ''
  
  const formatted = limited.map((card, index) => {
    const icon = getConfidenceIcon(card.confidence)
    const scopeLabel = card.scope.isGlobal ? 'Global' : 'Project'
    
    return `${index + 1}. ${icon} **[${card.category.toUpperCase()}] ${card.title}**
   - Description: ${card.description}
   - Scope: ${scopeLabel}
   - Evidence: ${card.evidence}`
  }).join('\n\n')
  
  return `# Retrieved Memories (max ${maxCount})\n\n${formatted}`
}

export function entryToStructured(entry: MemoryEntry): StructuredMemory {
  return {
    statement: entry.content,
    evidence: (entry.metadata as any)?.evidence ?? 'No evidence provided',
    confidence: (entry.metadata as any)?.confidence ?? 'medium',
    type: entry.type,
    metadata: entry.metadata,
  }
}

export function validateStructuredMemory(memory: Partial<StructuredMemory>): string[] {
  const errors: string[] = []
  
  if (!memory.statement || memory.statement.trim().length === 0) {
    errors.push('Statement is required and cannot be empty')
  }
  
  if (!memory.evidence || memory.evidence.trim().length === 0) {
    errors.push('Evidence is required and cannot be empty')
  }
  
  if (memory.confidence && !['high', 'medium', 'low'].includes(memory.confidence)) {
    errors.push('Confidence must be one of: high, medium, low')
  }
  
  if (!memory.type || !['thought', 'action', 'observation', 'reflection'].includes(memory.type)) {
    errors.push('Type must be one of: thought, action, observation, reflection')
  }
  
  return errors
}

export function getConfidenceIcon(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high': return '🟢'
    case 'medium': return '🟡'
    case 'low': return '🔴'
  }
}

export function formatStructuredMemoryForDisplay(memory: StructuredMemory): string {
  const icon = getConfidenceIcon(memory.confidence)
  return `${icon} **${memory.type.toUpperCase()}**
Statement: ${memory.statement}
Evidence: ${memory.evidence}
Confidence: ${memory.confidence}`
}
