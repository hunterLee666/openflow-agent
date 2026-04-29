import { Message } from '@query'
import { countTokens } from '@utils/model/tokens'
import { getMessagesGetter, getMessagesSetter } from '@messages'
import { getContext } from '@context'
import { getCodeStyle } from '@utils/config/style'
import { clearTerminal } from '@utils/terminal'
import { resetFileFreshnessSession } from '@services/fileFreshness'
import { createUserMessage, normalizeMessagesForAPI } from '@utils/messages'
import { queryLLM } from '@services/llmLazy'
import { selectAndReadFiles } from './fileRecoveryCore'
import { addLineNumbers } from '@utils/fs/file'
import { getModelManager } from '@utils/model'
import { debug as debugLogger } from '@utils/log/debugLogger'
import { logError } from '@utils/log'
import { calculateAutoCompactThresholds } from './autoCompactThreshold'
import {
  CompactionCircuitOpenError,
  type CompactionCircuitState,
  createCompactionCircuitState,
  recordCompactionFailure,
  recordCompactionSuccess,
  MAX_COMPACTION_FAILURES,
} from './budgetManager'
import { CONVERSATION_SUMMARY_PROMPT } from '@constants/summaryPrompts'

let globalCompactionCircuitState = createCompactionCircuitState()

export function getCompactionCircuitState(): CompactionCircuitState {
  return globalCompactionCircuitState
}

export function resetCompactionCircuitState(): void {
  globalCompactionCircuitState = createCompactionCircuitState()
}

export function isCompactionCircuitOpen(): boolean {
  return globalCompactionCircuitState.isOpen
}

async function getMainConversationContextLimit(): Promise<number> {
  try {
    const modelManager = getModelManager()
    const resolution = modelManager.resolveModelWithInfo('main')
    const modelProfile = resolution.success ? resolution.profile : null

    if (modelProfile?.contextLength) {
      return modelProfile.contextLength
    }

    return 200_000
  } catch (error) {
    return 200_000
  }
}

const COMPRESSION_PROMPT = CONVERSATION_SUMMARY_PROMPT

async function calculateThresholds(tokenCount: number) {
  const contextLimit = await getMainConversationContextLimit()
  return calculateAutoCompactThresholds(tokenCount, contextLimit)
}

async function shouldAutoCompact(messages: Message[]): Promise<boolean> {
  if (messages.length < 3) return false

  const tokenCount = countTokens(messages)
  const { isAboveAutoCompactThreshold } = await calculateThresholds(tokenCount)

  return isAboveAutoCompactThreshold
}

export async function checkAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<{ messages: Message[]; wasCompacted: boolean }> {
  if (globalCompactionCircuitState.isOpen) {
    debugLogger.warn('COMPACTION_CIRCUIT_OPEN_SKIP', {
      failures: globalCompactionCircuitState.failures,
      lastError: globalCompactionCircuitState.lastError,
    })
    throw new CompactionCircuitOpenError(
      globalCompactionCircuitState.failures,
      globalCompactionCircuitState.lastError
    )
  }

  if (!(await shouldAutoCompact(messages))) {
    return { messages, wasCompacted: false }
  }

  try {
    const compactedMessages = await executeAutoCompact(messages, toolUseContext)
    
    globalCompactionCircuitState = recordCompactionSuccess(globalCompactionCircuitState)
    
    debugLogger.info('COMPACTION_SUCCESS', {
      previousFailures: globalCompactionCircuitState.failures,
    })

    return {
      messages: compactedMessages,
      wasCompacted: true,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    globalCompactionCircuitState = recordCompactionFailure(
      globalCompactionCircuitState,
      errorMessage
    )
    
    logError(error)
    debugLogger.warn('AUTO_COMPACT_FAILED', {
      error: errorMessage,
      failures: globalCompactionCircuitState.failures,
      maxFailures: MAX_COMPACTION_FAILURES,
      circuitOpen: globalCompactionCircuitState.isOpen,
    })
    
    if (globalCompactionCircuitState.isOpen) {
      throw new CompactionCircuitOpenError(
        globalCompactionCircuitState.failures,
        errorMessage
      )
    }
    
    return { messages, wasCompacted: false }
  }
}

async function executeAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<Message[]> {
  const summaryRequest = createUserMessage(COMPRESSION_PROMPT)

  const tokenCount = countTokens(messages)
  const modelManager = getModelManager()
  const compactResolution = modelManager.resolveModelWithInfo('compact')
  const mainResolution = modelManager.resolveModelWithInfo('main')

  let compressionModelPointer: 'compact' | 'main' = 'compact'
  let compressionNotice: string | null = null

  if (!compactResolution.success || !compactResolution.profile) {
    compressionModelPointer = 'main'
    compressionNotice =
      compactResolution.error ||
      "Compression model pointer 'compact' is not configured."
  } else {
    const compactBudget = Math.floor(
      compactResolution.profile.contextLength * 0.9,
    )
    if (compactBudget > 0 && tokenCount > compactBudget) {
      compressionModelPointer = 'main'
      compressionNotice = `Compression model '${compactResolution.profile.name}' does not fit current context (~${Math.round(tokenCount / 1000)}k tokens).`
    }
  }

  if (
    compressionModelPointer === 'main' &&
    (!mainResolution.success || !mainResolution.profile)
  ) {
    throw new Error(
      mainResolution.error ||
        "Compression fallback failed: model pointer 'main' is not configured.",
    )
  }

  const summaryResponse = await queryLLM(
    normalizeMessagesForAPI([...messages, summaryRequest]),
    [
      'You are a helpful AI assistant tasked with creating comprehensive conversation summaries that preserve all essential context for continuing development work.',
    ],
    0,
    [],
    toolUseContext.abortController.signal,
    {
      safeMode: false,
      model: compressionModelPointer,
      prependCLISysprompt: true,
    },
  )

  const content = summaryResponse.message.content
  const summary =
    typeof content === 'string'
      ? content
      : content.length > 0 && content[0]?.type === 'text'
        ? content[0].text
        : null

  if (!summary) {
    throw new Error(
      'Failed to generate conversation summary - response did not contain valid text content',
    )
  }

  summaryResponse.message.usage = {
    input_tokens: 0,
    output_tokens: summaryResponse.message.usage.output_tokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  const recoveredFiles = await selectAndReadFiles()

  const compactedMessages = [
    createUserMessage(
      compressionNotice
        ? `Context automatically compressed due to token limit. ${compressionNotice} Using '${compressionModelPointer}' for compression.`
        : `Context automatically compressed due to token limit. Using '${compressionModelPointer}' for compression.`,
    ),
    summaryResponse,
  ]

  if (recoveredFiles.length > 0) {
    for (const file of recoveredFiles) {
      const contentWithLines = addLineNumbers({
        content: file.content,
        startLine: 1,
      })
      const recoveryMessage = createUserMessage(
        `**Recovered File: ${file.path}**\n\n\`\`\`\n${contentWithLines}\n\`\`\`\n\n` +
          `*Automatically recovered (${file.tokens} tokens)${file.truncated ? ' [truncated]' : ''}*`,
      )
      compactedMessages.push(recoveryMessage)
    }
  }

  getMessagesSetter()([])
  getContext.cache.clear?.()
  getCodeStyle.cache.clear?.()
  resetFileFreshnessSession()

  return compactedMessages
}
