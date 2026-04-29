import { Message, UserMessage, AssistantMessage } from '@query'
import { countTokens } from '@utils/model/tokens'

export interface Tier1Config {
  enabled: boolean
  preserveRecentToolResults: number
  maxToolResultChars: number
  elideThreshold: number
}

export const DEFAULT_TIER1_CONFIG: Tier1Config = {
  enabled: true,
  preserveRecentToolResults: 5,
  maxToolResultChars: 10000,
  elideThreshold: 0.6,
}

export interface Tier1Result {
  messages: Message[]
  elidedCount: number
  preservedCount: number
  tokensSaved: number
  strategy: string
}

export interface ToolResultInfo {
  message: Message
  index: number
  isToolResult: boolean
  toolName?: string
  charCount: number
}

function isUserMessage(msg: Message): msg is UserMessage {
  return msg.type === 'user'
}

function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.type === 'assistant'
}

function isToolResultMessage(message: Message): boolean {
  if (isUserMessage(message)) {
    const content = message.message?.content
    if (Array.isArray(content)) {
      return content.some(
        (block: any) => block.type === 'tool_result'
      )
    }
  }
  
  if (isAssistantMessage(message)) {
    const content = message.message?.content
    if (Array.isArray(content)) {
      return content.some(
        (block: any) => block.type === 'tool_use'
      )
    }
  }
  
  return false
}

function extractToolName(message: Message): string | undefined {
  if (!isUserMessage(message) && !isAssistantMessage(message)) return undefined
  
  const content = message.message?.content
  if (!Array.isArray(content)) return undefined
  
  for (const block of content) {
    if (block.type === 'tool_use' && block.name) {
      return block.name
    }
    if (block.type === 'tool_result' && block.tool_use_id) {
      return `tool_result_${block.tool_use_id}`
    }
  }
  
  return undefined
}

function getContentLength(message: Message): number {
  if (!isUserMessage(message) && !isAssistantMessage(message)) return 0
  
  const content = message.message?.content
  
  if (typeof content === 'string') {
    return content.length
  }
  
  if (Array.isArray(content)) {
    return content.reduce((total: number, block: any) => {
      if (block.type === 'text' && block.text) {
        return total + block.text.length
      }
      if (block.type === 'tool_result' && block.content) {
        if (typeof block.content === 'string') {
          return total + block.content.length
        }
        if (Array.isArray(block.content)) {
          return total + block.content.reduce((sum: number, c: any) => {
            return sum + (typeof c === 'string' ? c.length : (c.text?.length || 0))
          }, 0)
        }
      }
      return total
    }, 0)
  }
  
  return 0
}

function createElidedUserMessage(original: UserMessage, reason: string): UserMessage {
  const content = original.message?.content
  let elidedContent: string
  
  if (typeof content === 'string') {
    elidedContent = `[elided by Tier1 micro-compaction: ${reason}]\nOriginal length: ${content.length} chars`
  } else if (Array.isArray(content)) {
    const summary = content.map((block: any) => {
      if (block.type === 'tool_result') {
        return `tool_result for ${block.tool_use_id || 'unknown'}`
      }
      return block.type
    }).join(', ')
    elidedContent = `[elided by Tier1 micro-compaction: ${reason}]\nBlocks: ${summary}`
  } else {
    elidedContent = `[elided by Tier1 micro-compaction: ${reason}]`
  }
  
  return {
    ...original,
    message: {
      role: 'user',
      content: elidedContent,
    },
  }
}

function truncateUserMessage(message: UserMessage, maxChars: number): UserMessage {
  const content = message.message?.content
  
  if (typeof content === 'string') {
    if (content.length <= maxChars) return message
    
    const truncated = content.slice(0, maxChars)
    const remaining = content.length - maxChars
    return {
      ...message,
      message: {
        role: 'user',
        content: `${truncated}\n\n... [truncated ${remaining} chars by Tier1]`,
      },
    }
  }
  
  if (Array.isArray(content)) {
    const truncatedBlocks = content.map((block: any) => {
      if (block.type === 'tool_result' && typeof block.content === 'string') {
        if (block.content.length <= maxChars) return block
        
        const truncated = block.content.slice(0, maxChars)
        const remaining = block.content.length - maxChars
        return {
          ...block,
          content: `${truncated}\n\n... [truncated ${remaining} chars by Tier1]`,
        }
      }
      return block
    })
    
    return {
      ...message,
      message: {
        role: 'user',
        content: truncatedBlocks,
      },
    }
  }
  
  return message
}

export function tier1MicroCompaction(
  messages: Message[],
  config: Partial<Tier1Config> = {},
): Tier1Result {
  const cfg = { ...DEFAULT_TIER1_CONFIG, ...config }
  
  if (!cfg.enabled) {
    return {
      messages,
      elidedCount: 0,
      preservedCount: messages.length,
      tokensSaved: 0,
      strategy: 'Tier1 disabled',
    }
  }
  
  const originalTokens = countTokens(messages)
  
  const toolResultInfos: ToolResultInfo[] = messages.map((m, i) => ({
    message: m,
    index: i,
    isToolResult: isToolResultMessage(m),
    toolName: extractToolName(m),
    charCount: getContentLength(m),
  }))
  
  const toolResults = toolResultInfos.filter(info => info.isToolResult)
  
  if (toolResults.length <= cfg.preserveRecentToolResults) {
    return {
      messages,
      elidedCount: 0,
      preservedCount: messages.length,
      tokensSaved: 0,
      strategy: `Only ${toolResults.length} tool results, no elision needed`,
    }
  }
  
  const recentToolResults = toolResults.slice(-cfg.preserveRecentToolResults)
  const recentIndices = new Set(recentToolResults.map(r => r.index))
  
  const processedMessages: Message[] = []
  let elidedCount = 0
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const info = toolResultInfos[i]
    
    if (!info.isToolResult) {
      processedMessages.push(msg)
      continue
    }
    
    if (recentIndices.has(i)) {
      if (isUserMessage(msg) && info.charCount > cfg.maxToolResultChars) {
        processedMessages.push(truncateUserMessage(msg, cfg.maxToolResultChars))
      } else {
        processedMessages.push(msg)
      }
      continue
    }
    
    if (isUserMessage(msg)) {
      processedMessages.push(createElidedUserMessage(msg, 'old tool result'))
      elidedCount++
    } else {
      processedMessages.push(msg)
    }
  }
  
  const newTokens = countTokens(processedMessages)
  const tokensSaved = originalTokens - newTokens
  
  return {
    messages: processedMessages,
    elidedCount,
    preservedCount: messages.length - elidedCount,
    tokensSaved,
    strategy: `Elided ${elidedCount} old tool results, preserved ${cfg.preserveRecentToolResults} recent`,
  }
}

export function tier1QuickClean(messages: Message[]): Message[] {
  const result = tier1MicroCompaction(messages)
  return result.messages
}

export function getToolResultStats(messages: Message[]): {
  total: number
  totalChars: number
  byTool: Record<string, { count: number; chars: number }>
} {
  const toolResultInfos = messages.map(m => ({
    isToolResult: isToolResultMessage(m),
    toolName: extractToolName(m),
    charCount: getContentLength(m),
  }))
  
  const toolResults = toolResultInfos.filter(info => info.isToolResult)
  
  const byTool: Record<string, { count: number; chars: number }> = {}
  
  for (const info of toolResults) {
    const toolName = info.toolName || 'unknown'
    if (!byTool[toolName]) {
      byTool[toolName] = { count: 0, chars: 0 }
    }
    byTool[toolName].count++
    byTool[toolName].chars += info.charCount
  }
  
  return {
    total: toolResults.length,
    totalChars: toolResults.reduce((sum, info) => sum + info.charCount, 0),
    byTool,
  }
}

export function estimateCompactionBenefit(messages: Message[]): {
  potentialTokensSaved: number
  toolResultCount: number
  recommendation: string
} {
  const stats = getToolResultStats(messages)
  
  const avgCharsPerToken = 4
  const preserveCount = DEFAULT_TIER1_CONFIG.preserveRecentToolResults
  const elidableCount = Math.max(0, stats.total - preserveCount)
  
  const avgToolResultChars = stats.total > 0 ? stats.totalChars / stats.total : 0
  const estimatedSavedTokens = Math.floor((elidableCount * avgToolResultChars) / avgCharsPerToken)
  
  let recommendation = ''
  if (elidableCount > 10) {
    recommendation = 'High benefit: Many old tool results can be elided'
  } else if (elidableCount > 5) {
    recommendation = 'Moderate benefit: Some old tool results can be elided'
  } else if (elidableCount > 0) {
    recommendation = 'Low benefit: Few old tool results to elide'
  } else {
    recommendation = 'No benefit: All tool results are recent'
  }
  
  return {
    potentialTokensSaved: estimatedSavedTokens,
    toolResultCount: stats.total,
    recommendation,
  }
}
