import { Command } from '@commands'
import { getContext } from '@context'
import { getMessagesGetter, getMessagesSetter } from '@messages'
import { API_ERROR_MESSAGE_PREFIX } from '@services/llmConstants'
import { queryLLM } from '@services/llmLazy'
import { getGlobalConfig } from '@utils/config'
import { createUserMessage, normalizeMessagesForAPI } from '@utils/messages'
import { getCodeStyle } from '@utils/config/style'
import { clearTerminal } from '@utils/terminal'
import { resetReminderSession } from '@services/systemReminder'
import { resetFileFreshnessSession } from '@services/fileFreshness'
import { CONVERSATION_SUMMARY_PROMPT } from '@constants/summaryPrompts'
import { tier1MicroCompaction, estimateCompactionBenefit } from '@utils/session/microCompact'
import { cacheAwareCompaction } from '@utils/session/cacheAwareCompaction'

const COMPRESSION_PROMPT = CONVERSATION_SUMMARY_PROMPT

export interface CompactOptions {
  focus?: string
  preserveFiles?: string[]
  tier1?: boolean
  cacheAware?: boolean
}

function parseCompactArgs(args: string): CompactOptions {
  const options: CompactOptions = {
    tier1: true,
    cacheAware: true,
  }
  
  if (!args) return options
  
  const focusMatch = args.match(/--focus[= ]+"?([^"]+)"?/)
  if (focusMatch) {
    options.focus = focusMatch[1]
  }
  
  const preserveMatch = args.match(/--preserve[= ]+"?([^"]+)"?/)
  if (preserveMatch) {
    options.preserveFiles = preserveMatch[1].split(',').map(f => f.trim()).filter(Boolean)
  }
  
  if (args.includes('--no-tier1')) {
    options.tier1 = false
  }
  
  if (args.includes('--no-cache-aware')) {
    options.cacheAware = false
  }
  
  return options
}

function buildFocusPrompt(focus?: string, preserveFiles?: string[]): string {
  let focusSection = ''
  
  if (focus) {
    focusSection = `

## Focus Directive

The user has specified the following focus for this summary:

**Focus: ${focus}**

When creating the summary, prioritize information related to this focus. Ensure that:
- Details relevant to "${focus}" are preserved with maximum fidelity
- Code snippets, file paths, and decisions related to "${focus}" are included in full
- Other information may be condensed more aggressively

`
  }
  
  if (preserveFiles && preserveFiles.length > 0) {
    focusSection += `

## Preserve Files

The following files must be preserved in full detail in the summary:
${preserveFiles.map(f => `- ${f}`).join('\n')}

Ensure all code from these files is included verbatim in the "Files and Code Sections" section.

`
  }
  
  return focusSection
}

function buildTier1PreprocessingPrompt(tokensSaved: number, elidedCount: number): string {
  if (tokensSaved <= 0) return ''
  
  return `

## Tier1 Micro-Compaction Applied

Before this summary request, Tier1 micro-compaction was applied:
- ${elidedCount} old tool results were elided
- Approximately ${tokensSaved} tokens were saved
- Recent tool results (last 5) were preserved

The elided content has been replaced with placeholders. Focus on summarizing the remaining visible content.

`
}

const compact = {
  type: 'local',
  name: 'compact',
  description: 'Clear conversation history but keep a summary in context. Options: --focus="topic" to prioritize specific content, --preserve="file1,file2" to preserve specific files, --no-tier1 to disable Tier1, --no-cache-aware to disable cache-aware compression',
  isEnabled: true,
  isHidden: false,
  async call(
    args: string,
    {
      options: { tools },
      abortController,
      setForkConvoWithMessagesOnTheNextRender,
    },
  ) {
    const messages = getMessagesGetter()()
    
    const options = parseCompactArgs(args)
    const { focus, preserveFiles, tier1: useTier1, cacheAware: useCacheAware } = options
    
    let processedMessages = messages
    let tier1Info = { tokensSaved: 0, elidedCount: 0 }
    let cacheInfo = { tokensSaved: 0, cacheIntegrityScore: 100 }
    
    if (useTier1) {
      const benefit = estimateCompactionBenefit(messages)
      if (benefit.toolResultCount > 5) {
        const tier1Result = tier1MicroCompaction(messages)
        processedMessages = tier1Result.messages
        tier1Info = {
          tokensSaved: tier1Result.tokensSaved,
          elidedCount: tier1Result.elidedCount,
        }
      }
    }
    
    if (useCacheAware && processedMessages.length > 10) {
      const cacheResult = cacheAwareCompaction(processedMessages, 0.2)
      if (cacheResult.cacheIntegrityScore >= 80) {
        processedMessages = cacheResult.messages
        cacheInfo = {
          tokensSaved: cacheResult.tokensSaved,
          cacheIntegrityScore: cacheResult.cacheIntegrityScore,
        }
      }
    }
    
    const focusPrompt = buildFocusPrompt(focus, preserveFiles)
    const tier1Prompt = buildTier1PreprocessingPrompt(tier1Info.tokensSaved, tier1Info.elidedCount)
    
    const fullPrompt = COMPRESSION_PROMPT + focusPrompt + tier1Prompt
    
    const summaryRequest = createUserMessage(fullPrompt)
    const compactPointer = getGlobalConfig().modelPointers?.compact

    const summaryResponse = await queryLLM(
      normalizeMessagesForAPI([...processedMessages, summaryRequest]),
      [
        'You are a helpful AI assistant tasked with creating comprehensive conversation summaries that preserve all essential context for continuing development work.',
      ],
      0,
      tools,
      abortController.signal,
      {
        safeMode: false,
        model: compactPointer ? 'compact' : 'main',
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
        `Failed to generate conversation summary - response did not contain valid text content - ${summaryResponse}`,
      )
    } else if (summary.startsWith(API_ERROR_MESSAGE_PREFIX)) {
      throw new Error(summary)
    }

    summaryResponse.message.usage = {
      input_tokens: 0,
      output_tokens: summaryResponse.message.usage.output_tokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }

    await clearTerminal()
    getMessagesSetter()([])
    
    let compactNotice = 'Context has been compressed using structured 9-section algorithm.'
    if (tier1Info.tokensSaved > 0) {
      compactNotice += ` Tier1 micro-compaction saved ~${tier1Info.tokensSaved} tokens.`
    }
    if (cacheInfo.tokensSaved > 0) {
      compactNotice += ` Cache-aware compression saved ~${cacheInfo.tokensSaved} tokens.`
    }
    if (focus) {
      compactNotice += ` Focus: "${focus}".`
    }
    compactNotice += ' All essential information has been preserved for seamless continuation.'
    
    setForkConvoWithMessagesOnTheNextRender([
      createUserMessage(compactNotice),
      summaryResponse,
    ])
    getContext.cache.clear?.()
    getCodeStyle.cache.clear?.()
    resetFileFreshnessSession()

    resetReminderSession()

    return ''
  },
  userFacingName() {
    return 'compact'
  },
} satisfies Command

export default compact
