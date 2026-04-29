import { Message, UserMessage, AssistantMessage } from '@query'
import { countTokens } from '@utils/model/tokens'
import crypto from 'crypto'

export interface CacheEdit {
  messageIndex: number
  blockIndex?: number
  operation: 'replace' | 'truncate' | 'elide'
  originalHash: string
  newContent: string
  metadata?: {
    toolName?: string
    originalLength: number
    savedChars: number
  }
}

export interface CacheAwareResult {
  messages: Message[]
  edits: CacheEdit[]
  prefixPreserved: boolean
  tokensSaved: number
  cacheIntegrityScore: number
}

export interface CacheBoundary {
  index: number
  hash: string
  isStable: boolean
  reason: string
}

function isUserMessage(msg: Message): msg is UserMessage {
  return msg.type === 'user'
}

function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.type === 'assistant'
}

function computeContentHash(content: any): string {
  const str = typeof content === 'string' 
    ? content 
    : JSON.stringify(content)
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16)
}

function computeMessageHash(message: Message): string {
  if (!isUserMessage(message) && !isAssistantMessage(message)) {
    return ''
  }
  return computeContentHash(message.message?.content)
}

export function identifyCacheBoundaries(messages: Message[]): CacheBoundary[] {
  const boundaries: CacheBoundary[] = []
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const hash = computeMessageHash(msg)
    
    let isStable = false
    let reason = ''
    
    if (i < 3) {
      isStable = true
      reason = 'System prompt region - always stable'
    } else if (isAssistantMessage(msg)) {
      const content = msg.message?.content
      if (Array.isArray(content)) {
        const hasToolUse = content.some((b: any) => b.type === 'tool_use')
        if (hasToolUse) {
          isStable = false
          reason = 'Tool use message - may be modified'
        } else {
          isStable = true
          reason = 'Text-only assistant message - stable'
        }
      } else {
        isStable = true
        reason = 'Simple assistant message - stable'
      }
    } else if (isUserMessage(msg)) {
      const content = msg.message?.content
      if (Array.isArray(content)) {
        const hasToolResult = content.some((b: any) => b.type === 'tool_result')
        if (hasToolResult) {
          isStable = false
          reason = 'Tool result - candidate for elision'
        } else {
          isStable = true
          reason = 'User text message - stable'
        }
      } else {
        isStable = true
        reason = 'Simple user message - stable'
      }
    } else {
      isStable = true
      reason = 'Unknown message type - treat as stable'
    }
    
    boundaries.push({
      index: i,
      hash,
      isStable,
      reason,
    })
  }
  
  return boundaries
}

export function findStablePrefixLength(boundaries: CacheBoundary[]): number {
  let stableCount = 0
  for (const boundary of boundaries) {
    if (boundary.isStable) {
      stableCount++
    } else {
      break
    }
  }
  return Math.max(stableCount, 3)
}

function createCacheEdit(
  messageIndex: number,
  blockIndex: number | undefined,
  operation: CacheEdit['operation'],
  originalContent: any,
  newContent: string,
  metadata?: CacheEdit['metadata'],
): CacheEdit {
  return {
    messageIndex,
    blockIndex,
    operation,
    originalHash: computeContentHash(originalContent),
    newContent,
    metadata,
  }
}

function applyEditToMessage(message: Message, edit: CacheEdit): Message {
  if (!isUserMessage(message)) {
    return message
  }
  
  const content = message.message?.content
  
  if (typeof content === 'string') {
    return {
      ...message,
      message: {
        role: 'user',
        content: edit.newContent,
      },
    }
  }
  
  if (Array.isArray(content) && edit.blockIndex !== undefined) {
    const newBlocks = [...content]
    const block = newBlocks[edit.blockIndex]
    
    if (block && block.type === 'tool_result') {
      newBlocks[edit.blockIndex] = {
        ...block,
        content: edit.newContent,
      }
    }
    
    return {
      ...message,
      message: {
        role: 'user',
        content: newBlocks,
      },
    }
  }
  
  return message
}

export function cacheAwareCompaction(
  messages: Message[],
  targetTokenReduction: number = 0.3,
): CacheAwareResult {
  const originalTokens = countTokens(messages)
  const targetSaved = Math.floor(originalTokens * targetTokenReduction)
  
  const boundaries = identifyCacheBoundaries(messages)
  const stablePrefixLength = findStablePrefixLength(boundaries)
  
  const edits: CacheEdit[] = []
  let estimatedSaved = 0
  
  for (let i = messages.length - 1; i >= stablePrefixLength; i--) {
    if (estimatedSaved >= targetSaved) break
    
    const msg = messages[i]
    const boundary = boundaries[i]
    
    if (boundary.isStable) continue
    
    if (isUserMessage(msg)) {
      const content = msg.message?.content
      
      if (Array.isArray(content)) {
        for (let j = 0; j < content.length; j++) {
          const block = content[j]
          
          if (block.type === 'tool_result' && typeof block.content === 'string') {
            const originalLength = block.content.length
            const truncatedLength = Math.min(originalLength, 2000)
            
            if (originalLength > truncatedLength) {
              const newContent = block.content.slice(0, truncatedLength) + 
                `\n\n... [cache-aware truncation: ${originalLength - truncatedLength} chars saved]`
              
              edits.push(createCacheEdit(
                i,
                j,
                'truncate',
                block.content,
                newContent,
                {
                  originalLength,
                  savedChars: originalLength - truncatedLength,
                },
              ))
              
              estimatedSaved += Math.floor((originalLength - truncatedLength) / 4)
            }
          }
        }
      }
    }
  }
  
  let processedMessages = [...messages]
  for (const edit of edits) {
    processedMessages[edit.messageIndex] = applyEditToMessage(
      processedMessages[edit.messageIndex],
      edit,
    )
  }
  
  const newTokens = countTokens(processedMessages)
  const tokensSaved = originalTokens - newTokens
  
  let cacheIntegrityScore = 100
  for (let i = 0; i < stablePrefixLength; i++) {
    const originalHash = boundaries[i].hash
    const newHash = computeMessageHash(processedMessages[i])
    if (originalHash !== newHash) {
      cacheIntegrityScore -= 20
    }
  }
  cacheIntegrityScore = Math.max(0, cacheIntegrityScore)
  
  return {
    messages: processedMessages,
    edits,
    prefixPreserved: cacheIntegrityScore >= 80,
    tokensSaved,
    cacheIntegrityScore,
  }
}

export function surgicalToolResultElision(
  messages: Message[],
  toolResultIndices: number[],
  maxPreserveChars: number = 2000,
): CacheAwareResult {
  const originalTokens = countTokens(messages)
  const boundaries = identifyCacheBoundaries(messages)
  const stablePrefixLength = findStablePrefixLength(boundaries)
  
  const edits: CacheEdit[] = []
  
  for (const idx of toolResultIndices) {
    if (idx < stablePrefixLength) continue
    
    const msg = messages[idx]
    if (!isUserMessage(msg)) continue
    
    const content = msg.message?.content
    if (!Array.isArray(content)) continue
    
    for (let j = 0; j < content.length; j++) {
      const block = content[j]
      
      if (block.type === 'tool_result' && typeof block.content === 'string') {
        const originalLength = block.content.length
        
        if (originalLength > maxPreserveChars) {
          const newContent = block.content.slice(0, maxPreserveChars) +
            `\n\n... [surgical elision: ${originalLength - maxPreserveChars} chars]`
          
          edits.push(createCacheEdit(
            idx,
            j,
            'elide',
            block.content,
            newContent,
            {
              originalLength,
              savedChars: originalLength - maxPreserveChars,
            },
          ))
        }
      }
    }
  }
  
  let processedMessages = [...messages]
  for (const edit of edits) {
    processedMessages[edit.messageIndex] = applyEditToMessage(
      processedMessages[edit.messageIndex],
      edit,
    )
  }
  
  const newTokens = countTokens(processedMessages)
  
  return {
    messages: processedMessages,
    edits,
    prefixPreserved: true,
    tokensSaved: originalTokens - newTokens,
    cacheIntegrityScore: 100,
  }
}

export function preserveCachePrefix(
  messages: Message[],
  newMessages: Message[],
): Message[] {
  const oldBoundaries = identifyCacheBoundaries(messages)
  const stablePrefixLength = findStablePrefixLength(oldBoundaries)
  
  let overlapEnd = stablePrefixLength
  for (let i = stablePrefixLength; i < messages.length && i < newMessages.length; i++) {
    const oldHash = computeMessageHash(messages[i])
    const newHash = computeMessageHash(newMessages[i])
    
    if (oldHash === newHash) {
      overlapEnd = i + 1
    } else {
      break
    }
  }
  
  const result = [
    ...messages.slice(0, overlapEnd),
    ...newMessages.slice(overlapEnd),
  ]
  
  return result
}

export function computeCacheEfficiency(messages: Message[]): {
  stablePrefixRatio: number
  editableRatio: number
  estimatedCacheHitRate: number
} {
  const boundaries = identifyCacheBoundaries(messages)
  const stableCount = boundaries.filter(b => b.isStable).length
  const total = messages.length
  
  const stablePrefixRatio = total > 0 ? stableCount / total : 0
  const editableRatio = 1 - stablePrefixRatio
  
  const estimatedCacheHitRate = stablePrefixRatio * 0.9 + editableRatio * 0.1
  
  return {
    stablePrefixRatio,
    editableRatio,
    estimatedCacheHitRate,
  }
}
