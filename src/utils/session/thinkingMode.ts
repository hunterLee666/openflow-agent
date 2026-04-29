import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages/messages'

export type ThinkingBlock = {
  type: 'thinking'
  thinking: string
}

export type TextBlock = {
  type: 'text'
  text: string
}

export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export type ContentBlockUnion = ThinkingBlock | TextBlock | ToolUseBlock | ContentBlock

export interface ThinkingState {
  enabled: boolean
  content: string
  tokenCount: number
  startTime: number
  isComplete: boolean
}

export function createThinkingState(enabled: boolean = false): ThinkingState {
  return {
    enabled,
    content: '',
    tokenCount: 0,
    startTime: Date.now(),
    isComplete: false,
  }
}

export function appendThinkingContent(
  state: ThinkingState,
  delta: string
): ThinkingState {
  const newContent = state.content + delta
  const estimatedTokens = Math.ceil(newContent.length / 4)
  
  return {
    ...state,
    content: newContent,
    tokenCount: estimatedTokens,
  }
}

export function completeThinking(state: ThinkingState): ThinkingState {
  return {
    ...state,
    isComplete: true,
  }
}

export function isThinkingBlock(block: unknown): block is ThinkingBlock {
  return (
    block !== null &&
    typeof block === 'object' &&
    (block as any).type === 'thinking'
  )
}

export function extractThinkingBlocks(
  content: ContentBlockUnion[]
): ThinkingBlock[] {
  return content.filter(isThinkingBlock)
}

export function extractTextBlocks(content: ContentBlockUnion[]): TextBlock[] {
  return content.filter(
    (block): block is TextBlock =>
      block !== null &&
      typeof block === 'object' &&
      (block as any).type === 'text'
  )
}

export function extractToolUseBlocks(
  content: ContentBlockUnion[]
): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock =>
      block !== null &&
      typeof block === 'object' &&
      (block as any).type === 'tool_use'
  )
}

export type ThinkingDisplayMode = 'hidden' | 'collapsed' | 'expanded'

export interface ThinkingDisplayConfig {
  mode: ThinkingDisplayMode
  showTokenCount: boolean
  showDuration: boolean
  maxPreviewLength: number
}

export const DEFAULT_THINKING_DISPLAY_CONFIG: ThinkingDisplayConfig = {
  mode: 'collapsed',
  showTokenCount: true,
  showDuration: true,
  maxPreviewLength: 200,
}

export function formatThinkingForDisplay(
  state: ThinkingState,
  config: ThinkingDisplayConfig = DEFAULT_THINKING_DISPLAY_CONFIG
): string {
  if (!state.enabled || !state.content) {
    return ''
  }
  
  const parts: string[] = []
  
  parts.push('🧠 **Thinking Process**')
  
  const metadata: string[] = []
  if (config.showTokenCount && state.tokenCount > 0) {
    metadata.push(`~${state.tokenCount} tokens`)
  }
  if (config.showDuration) {
    const durationMs = Date.now() - state.startTime
    if (durationMs > 0) {
      metadata.push(`${(durationMs / 1000).toFixed(1)}s`)
    }
  }
  
  if (metadata.length > 0) {
    parts.push(`(${metadata.join(', ')})`)
  }
  
  if (config.mode === 'collapsed') {
    const preview = state.content.slice(0, config.maxPreviewLength)
    const ellipsis = state.content.length > config.maxPreviewLength ? '...' : ''
    parts.push(`\n> ${preview}${ellipsis}`)
  } else if (config.mode === 'expanded') {
    parts.push('\n```')
    parts.push(state.content)
    parts.push('```')
  }
  
  return parts.join('\n')
}

export interface ThinkingStreamingEvent {
  type: 'thinking_start' | 'thinking_delta' | 'thinking_end'
  content?: string
  tokenCount?: number
}

export function createThinkingStartEvent(): ThinkingStreamingEvent {
  return { type: 'thinking_start' }
}

export function createThinkingDeltaEvent(
  content: string,
  tokenCount?: number
): ThinkingStreamingEvent {
  return { type: 'thinking_delta', content, tokenCount }
}

export function createThinkingEndEvent(tokenCount: number): ThinkingStreamingEvent {
  return { type: 'thinking_end', tokenCount }
}

export interface ThinkingBudget {
  maxThinkingTokens: number
  currentThinkingTokens: number
  remainingTokens: number
}

export function createThinkingBudget(maxTokens: number = 0): ThinkingBudget {
  return {
    maxThinkingTokens: maxTokens,
    currentThinkingTokens: 0,
    remainingTokens: maxTokens,
  }
}

export function updateThinkingBudget(
  budget: ThinkingBudget,
  usedTokens: number
): ThinkingBudget {
  const current = budget.currentThinkingTokens + usedTokens
  return {
    ...budget,
    currentThinkingTokens: current,
    remainingTokens: Math.max(0, budget.maxThinkingTokens - current),
  }
}

export function isThinkingBudgetExceeded(budget: ThinkingBudget): boolean {
  if (budget.maxThinkingTokens <= 0) return false
  return budget.currentThinkingTokens >= budget.maxThinkingTokens
}

export function stripThinkingFromHistory(
  messages: any[]
): any[] {
  return messages.map(message => {
    if (!message || typeof message !== 'object') return message
    
    if (message.message && Array.isArray(message.message.content)) {
      return {
        ...message,
        message: {
          ...message.message,
          content: message.message.content.filter(
            (block: any) => !isThinkingBlock(block)
          ),
        },
      }
    }
    
    return message
  })
}

export function summarizeThinkingForCompaction(
  thinkingContent: string,
  maxLength: number = 500
): string {
  if (thinkingContent.length <= maxLength) {
    return thinkingContent
  }
  
  const sentences = thinkingContent.split(/[.!?]+/).filter(s => s.trim())
  const summary: string[] = []
  let currentLength = 0
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (currentLength + trimmed.length + 1 <= maxLength) {
      summary.push(trimmed)
      currentLength += trimmed.length + 1
    } else {
      break
    }
  }
  
  if (summary.length === 0) {
    return thinkingContent.slice(0, maxLength) + '...'
  }
  
  return summary.join('. ') + (summary.length < sentences.length ? '...' : '')
}

export function estimateThinkingTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

export function shouldIncludeThinkingInContext(
  thinkingState: ThinkingState,
  contextTokens: number,
  maxContextTokens: number,
  thresholdRatio: number = 0.8
): boolean {
  if (!thinkingState.enabled || !thinkingState.content) {
    return false
  }
  
  const threshold = maxContextTokens * thresholdRatio
  const availableSpace = maxContextTokens - contextTokens
  
  return availableSpace > thinkingState.tokenCount && contextTokens < threshold
}
