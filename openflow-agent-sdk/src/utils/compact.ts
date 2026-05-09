/**
 * Context Compression / Auto-Compaction
 *
 * Summarizes long conversation histories when context window fills up.
 * Three-tier system:
 * 1. Auto-compact: triggered when tokens exceed threshold
 * 2. Micro-compact: cache-aware per-request optimization
 * 3. Full compaction with nine-section summary
 *
 * Part 08: Context Management implementation
 */

import type { LLMProvider } from '../providers/types.js'
import type { NormalizedMessageParam } from '../providers/types.js'
import {
  estimateMessagesTokens,
  estimateTokens,
  getAutoCompactThreshold,
  getContextWindowSize,
} from './tokens.js'

/**
 * Nine-section summary structure (Tier3 full compaction)
 * 1. Intent - What the user is trying to accomplish
 * 2. Concepts - Domain terms, constraints, definitions
 * 3. Files - Key paths and module responsibilities
 * 4. Errors - Unresolved issues with reproduction info
 * 5. Messages - Key user messages to preserve
 * 6. Tasks - Decomposed TODO and completion criteria
 * 7. Current Work - Next suggested action
 * 8. Environment - Dependencies and setup
 * 9. Chain-of-thought - Intermediate reasoning (stripped on Tier3)
 */
export interface NineSectionSummary {
  intent?: string
  concepts?: string[]
  files?: { path: string; responsibility: string }[]
  errors?: { error: string; reproduction?: string }[]
  messages?: string[]
  tasks?: { task: string; status: 'pending' | 'in_progress' | 'completed' }[]
  currentWork?: string
  environment?: string
  risks?: string[]
}

/**
 * State for tracking auto-compaction across turns.
 */
export interface AutoCompactState {
  compacted: boolean
  turnCounter: number
  consecutiveFailures: number
}

/**
 * Cost warning levels
 */
export type CostWarningLevel = 'normal' | 'attention' | 'warning' | 'critical'

/**
 * Check if cost warning should be triggered at 60% threshold
 */
export function getCostWarningLevel(
  usedTokens: number,
  model: string,
): CostWarningLevel {
  const contextWindow = getContextWindowSize(model)
  if (!contextWindow) return 'normal'
  
  const ratio = usedTokens / contextWindow
  
  if (ratio >= 0.87) return 'critical'
  if (ratio >= 0.75) return 'warning'
  if (ratio >= 0.60) return 'attention'
  return 'normal'
}

/**
 * Get recommendation message for cost warning
 */
export function getCostWarningMessage(
  level: CostWarningLevel,
): string | null {
  switch (level) {
    case 'attention':
      return 'Context at 60% - Consider manual /compact or reducing large tool outputs'
    case 'warning':
      return 'Context at 75% - Auto-compaction may trigger soon. Act now to preserve focus.'
    case 'critical':
      return 'Context at 87%+ - Aggressive compression may occur. Consider starting new session.'
    default:
      return null
  }
}

/**
 * Create initial auto-compact state.
 */
export function createAutoCompactState(): AutoCompactState {
  return {
    compacted: false,
    turnCounter: 0,
    consecutiveFailures: 0,
  }
}

/**
 * Check if auto-compaction should trigger.
 */
export function shouldAutoCompact(
  messages: any[],
  model: string,
  state: AutoCompactState,
): boolean {
  const estimatedTokens = estimateMessagesTokens(messages)
  const threshold = getAutoCompactThreshold(model)

  return estimatedTokens >= threshold
}

/**
 * Check if compaction circuit breaker should trigger.
 * Returns true if consecutiveFailures >= threshold (default 3).
 * - undefined: trigger after 3 consecutive failures
 * - false: never trigger (disabled)
 * - number >= 1: trigger after N consecutive failures
 */
export function shouldTriggerCircuitBreaker(
  state: AutoCompactState,
  threshold?: number | false,
): boolean {
  // If threshold is false, never trigger (disabled)
  if (threshold === false) {
    return false
  }
  // Default threshold is 3 (when undefined)
  const effectiveThreshold = threshold !== undefined ? threshold : 3
  return state.consecutiveFailures >= effectiveThreshold
}



/**
 * Sends the entire conversation to the LLM for summarization,
 * then replaces the history with a compact summary.
 */
export async function compactConversation(
  provider: LLMProvider,
  model: string,
  messages: any[],
  state: AutoCompactState,
): Promise<{
  compactedMessages: NormalizedMessageParam[]
  summary: string
  state: AutoCompactState
}> {
  try {
    // Strip images before compacting to save tokens
    const strippedMessages = stripImagesFromMessages(messages)

    // Build compaction prompt
    const compactionPrompt = buildCompactionPrompt(strippedMessages)

    const response = await provider.createMessage({
      model,
      maxTokens: 8192,
      system: 'You are a conversation summarizer. Create a detailed summary of the conversation that preserves all important context, decisions made, files modified, tool outputs, and current state. The summary should allow the conversation to continue seamlessly.',
      messages: [
        {
          role: 'user',
          content: compactionPrompt,
        },
      ],
    })

    const summary = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')

    // Replace messages with summary
    const compactedMessages: NormalizedMessageParam[] = [
      {
        role: 'user',
        content: `[Previous conversation summary]\n\n${summary}\n\n[End of summary - conversation continues below]`,
      },
      {
        role: 'assistant',
        content: 'I understand the context from the previous conversation. I\'ll continue from where we left off.',
      },
    ]

    return {
      compactedMessages,
      summary,
      state: {
        compacted: true,
        turnCounter: state.turnCounter,
        consecutiveFailures: 0,
      },
    }
  } catch (err: any) {
    return {
      compactedMessages: messages,
      summary: '',
      state: {
        ...state,
        consecutiveFailures: state.consecutiveFailures + 1,
      },
    }
  }
}

/**
 * Strip images from messages for compaction safety.
 */
function stripImagesFromMessages(
  messages: any[],
): any[] {
  return messages.map((msg: any) => {
    if (typeof msg.content === 'string') return msg

    const filtered = (msg.content as any[]).filter((block: any) => {
      return block.type !== 'image'
    })

    return { ...msg, content: filtered.length > 0 ? filtered : '[content removed for compaction]' }
  })
}

// --------------------------------------------------------------------------
// Test Helpers
// --------------------------------------------------------------------------



/**
 * Build nine-section summary template
 */
export function buildNineSectionTemplate(summary: NineSectionSummary): string {
  const sections: string[] = [
    '## Compaction Summary (Tier3 - Nine Section)\n',
  ]
  
  if (summary.intent) {
    sections.push(`### 1. Intent\n${summary.intent}\n`)
  }
  
  if (summary.concepts && summary.concepts.length > 0) {
    sections.push(`### 2. Concepts\n${summary.concepts.map((c) => `- ${c}`).join('\n')}\n`)
  }
  
  if (summary.files && summary.files.length > 0) {
    sections.push(`### 3. Files\n${summary.files.map((f) => `- ${f.path}: ${f.responsibility}`).join('\n')}\n`)
  }
  
  if (summary.errors && summary.errors.length > 0) {
    sections.push(`### 4. Errors\n${summary.errors.map((e) => `- ${e.error}${e.reproduction ? ` (repro: ${e.reproduction})` : ''}`).join('\n')}\n`)
  }
  
  if (summary.messages && summary.messages.length > 0) {
    sections.push(`### 5. Message Highlights\n${summary.messages.map((m) => `- ${m}`).join('\n')}\n`)
  }
  
  if (summary.tasks && summary.tasks.length > 0) {
    sections.push(`### 6. Tasks\n${summary.tasks.map((t) => `- [${t.status}] ${t.task}`).join('\n')}\n`)
  }
  
  if (summary.currentWork) {
    sections.push(`### 7. Current Work\n${summary.currentWork}\n`)
  }
  
  if (summary.environment) {
    sections.push(`### 8. Environment\n${summary.environment}\n`)
  }
  
  if (summary.risks && summary.risks.length > 0) {
    sections.push(`### 9. Risks\n${summary.risks.map((r) => `- ${r}`).join('\n')}\n`)
  }
  
  return sections.join('\n')
}

/**
 * Compact conversation with focus hint (manual /compact equivalent)
 * SDK callers can use this to manually compact with priority focus
 */
export async function compactConversationWithFocus(
  provider: LLMProvider,
  model: string,
  messages: any[],
  state: AutoCompactState,
  focusHint?: string,
): Promise<{
  compactedMessages: NormalizedMessageParam[]
  summary: string
  state: AutoCompactState
}> {
  try {
    const strippedMessages = stripImagesFromMessages(messages)
    
    // Build focus-aware compaction prompt
    const focusSection = focusHint 
      ? `\n## Focus Priority (preserve these especially):\n${focusHint}\n` 
      : ''
    
    const compactionPrompt = buildFocusCompactionPrompt(strippedMessages, focusSection)
    
    const response = await provider.createMessage({
      model,
      maxTokens: 8192,
      system: `You are a conversation summarizer. Create a nine-section summary of this conversation.
      
The summary MUST follow this structure:
1. Intent - What the user is trying to accomplish
2. Concepts - Domain terms, constraints, definitions  
3. Files - Key paths and module responsibilities
4. Errors - Unresolved issues with reproduction info
5. Messages - Key user messages to preserve
6. Tasks - TODO items and completion status
7. Current Work - Next suggested action
8. Environment - Dependencies and setup
9. Risks - Potential issues to be aware of

Keep all critical context for task continuity.`,
      messages: [
        {
          role: 'user',
          content: compactionPrompt,
        },
      ],
    })
    
    const summary = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
    
    // Build nine-section summary
    const nineSection = buildNineSectionTemplate(parseNineSectionFromSummary(summary))
    
    const compactedMessages: NormalizedMessageParam[] = [
      {
        role: 'user',
        content: `${nineSection}\n\n---\n*Conversation continues below*`,
      },
      {
        role: 'assistant',
        content: 'I understand the context from the summary. I\'ll continue from where we left off.',
      },
    ]
    
    return {
      compactedMessages,
      summary,
      state: {
        compacted: true,
        turnCounter: state.turnCounter,
        consecutiveFailures: 0,
      },
    }
  } catch (err: any) {
    return {
      compactedMessages: messages,
      summary: '',
      state: {
        ...state,
        consecutiveFailures: state.consecutiveFailures + 1,
      },
    }
  }
}

/**
 * Parse nine-section summary from LLM response
 */
function parseNineSectionFromSummary(text: string): NineSectionSummary {
  const result: NineSectionSummary = {}
  const lines = text.split('\n')
  let currentSection = ''
  
  for (const line of lines) {
    const sectionMatch = line.match(/^###?\s*(\d+)\.\s*(\w+)/)
    if (sectionMatch) {
      currentSection = sectionMatch[2].toLowerCase()
      continue
    }
    
    if (currentSection === 'intent' && line.trim()) {
      result.intent = (result.intent || '') + line.trim() + '\n'
    } else if (currentSection === 'concepts' && line.trim().startsWith('-')) {
      result.concepts = result.concepts || []
      result.concepts.push(line.trim().slice(1).trim())
    } else if (currentSection === 'files' && line.trim().startsWith('-')) {
      result.files = result.files || []
      const match = line.match(/- (.+?): (.+)/)
      if (match) {
        result.files.push({ path: match[1], responsibility: match[2] })
      }
    } else if (currentSection === 'errors' && line.trim().startsWith('-')) {
      result.errors = result.errors || []
      result.errors.push({ error: line.trim().slice(1).trim() })
    } else if (currentSection === 'tasks' && line.trim().startsWith('-')) {
      result.tasks = result.tasks || []
      const statusMatch = line.match(/\[(\w+)\]\s*(.+)/)
      result.tasks.push({ 
        task: statusMatch ? statusMatch[2] : line.trim().slice(1).trim(),
        status: (statusMatch && statusMatch[1] === 'completed') ? 'completed' : 'pending'
      })
    } else if (currentSection === 'currentwork' && line.trim()) {
      result.currentWork = (result.currentWork || '') + line.trim() + '\n'
    } else if (currentSection === 'environment' && line.trim()) {
      result.environment = (result.environment || '') + line.trim() + '\n'
    } else if (currentSection === 'risks' && line.trim().startsWith('-')) {
      result.risks = result.risks || []
      result.risks.push(line.trim().slice(1).trim())
    }
  }
  
  return result
}

/**
 * Build compaction prompt (simpler version without focus)
 */
function buildCompactionPrompt(messages: any[]): string {
  const parts: string[] = ['Please summarize this conversation:\n']

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant'

    if (typeof msg.content === 'string') {
      parts.push(`${role}: ${msg.content.slice(0, 5000)}`)
    } else if (Array.isArray(msg.content)) {
      const texts: string[] = []
      for (const block of msg.content as any[]) {
        if (block.type === 'text') {
          texts.push(block.text.slice(0, 3000))
        } else if (block.type === 'tool_use') {
          texts.push(`[Tool: ${block.name}]`)
        } else if (block.type === 'tool_result') {
          const content = typeof block.content === 'string'
            ? block.content.slice(0, 1000)
            : '[tool result]'
          texts.push(`[Tool Result: ${content}]`)
        }
      }
      if (texts.length > 0) {
        parts.push(`${role}: ${texts.join('\n')}`)
      }
    }
  }

  return parts.join('\n\n')
}

/**
 * Build focus-aware compaction prompt
 */
function buildFocusCompactionPrompt(messages: any[], focusSection: string): string {
  const sections: string[] = [
    'Summarize this conversation into a nine-section structure.\n',
    focusSection,
    '\n## Conversation History:\n',
  ]
  
  // Only include recent messages for efficiency
  const recentMessages = messages.slice(-20)
  
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    
    if (typeof msg.content === 'string') {
      sections.push(`${role}: ${msg.content.slice(0, 3000)}`)
    } else if (Array.isArray(msg.content)) {
      const texts: string[] = []
      for (const block of msg.content as any[]) {
        if (block.type === 'text') {
          texts.push(block.text.slice(0, 1500))
        } else if (block.type === 'tool_use') {
          texts.push(`[Tool: ${block.name}]`)
        } else if (block.type === 'tool_result') {
          const content = typeof block.content === 'string'
            ? block.content.slice(0, 500)
            : '[tool result]'
          texts.push(`[Tool Result: ${content}]`)
        }
      }
      if (texts.length > 0) {
        sections.push(`${role}: ${texts.join('\n')}`)
      }
    }
  }
  
  return sections.join('\n\n')
}

/**
 * Micro-compact: optimize messages by truncating large tool results
 * to fit within token budgets.
 */
/**
 * Micro-compact: optimize messages by truncating large tool results
 * to fit within token budgets.
 */
export function microCompactMessages(
  messages: any[],
  maxToolResultChars: number = 50000,
): any[] {
  const truncationMarker = '\n...(truncated)...\n'
  const markerLen = truncationMarker.length
  return messages.map((msg: any) => {
    // Direct string content truncation
    if (typeof msg.content === 'string') {
      if (msg.content.length <= maxToolResultChars) return msg
      const half = Math.floor((maxToolResultChars - markerLen) / 2)
      return {
        ...msg,
        content: msg.content.slice(0, half) + truncationMarker + msg.content.slice(-half),
      }
    }
    // If msg.content is not array, return as-is
    if (!Array.isArray(msg.content)) return msg

    // For messages with content as array of blocks
    const content = (msg.content as any[]).map((block: any) => {
      if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > maxToolResultChars) {
        const half = Math.floor((maxToolResultChars - markerLen) / 2)
        return {
          ...block,
          content: block.content.slice(0, half) + truncationMarker + block.content.slice(-half),
        }
      }
      return block
    })

    return { ...msg, content }
  })
}



// --------------------------------------------------------------------------
// Test Helpers
// --------------------------------------------------------------------------

/**
 * Compact messages with simple truncation (no LLM needed for testing).
 */
export async function compactMessagesForTest(
  messages: any[],
  options?: {
    maxMessages?: number
    preserveRecent?: number
  }
): Promise<{ compacted: boolean; messages: any[] }> {
  const maxMessages = options?.maxMessages || 10
  const preserveRecent = options?.preserveRecent || 3
  
  if (messages.length <= maxMessages) {
    return { compacted: false, messages }
  }

  const systemMsgs = messages.filter(m => m.role === 'system')
  const otherMsgs = messages.filter(m => m.role !== 'system')
  const recent = otherMsgs.slice(-preserveRecent)
  const old = otherMsgs.slice(0, -preserveRecent)

  const summary = `[Summarized ${old.length} messages]` + 
    (old.length > 0 ? `: ${old.map(m => m.content?.slice(0, 50)).join(' | ')}` : '')

  const summarized: any[] = systemMsgs.concat(
    [{ role: 'user' as const, content: summary }],
    recent
  )

  return { compacted: true, messages: summarized }
}

/**
 * Get compaction statistics (for testing/monitoring).
 */
export function getCompactionStats(): {
  totalCompactions: number
  tokensSaved: number
  lastCompactionTime: number | null
} {
  return {
    totalCompactions: (globalThis as any).__compactionCount || 0,
    tokensSaved: (globalThis as any).__compactionTokensSaved || 0,
    lastCompactionTime: (globalThis as any).__compactionLastTime || null,
  }
}
