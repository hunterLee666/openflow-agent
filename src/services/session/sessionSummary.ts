import { queryLLM } from '@services/llmLazy'
import { normalizeMessagesForAPI } from '@utils/messages'
import { SESSION_TITLE_PROMPT, AWAY_RECAP_PROMPT } from '@constants/summaryPrompts'
import type { Message } from '@query'

export async function generateSessionTitle(messages: Message[]): Promise<string> {
  if (messages.length === 0) {
    return 'New conversation'
  }

  try {
    const response = await queryLLM(
      normalizeMessagesForAPI(messages),
      [SESSION_TITLE_PROMPT],
      0,
      [],
      undefined,
      {
        safeMode: true,
        model: 'haiku',
        prependCLISysprompt: false,
      },
    )

    const content = response.message.content
    const title = typeof content === 'string'
      ? content
      : content.length > 0 && content[0]?.type === 'text'
        ? content[0].text
        : 'Conversation'

    return title.trim().slice(0, 100)
  } catch {
    return 'Conversation'
  }
}

export async function generateAwayRecap(messages: Message[]): Promise<string> {
  if (messages.length === 0) {
    return 'No activity in this session.'
  }

  try {
    const response = await queryLLM(
      normalizeMessagesForAPI(messages),
      [AWAY_RECAP_PROMPT],
      0,
      [],
      undefined,
      {
        safeMode: true,
        model: 'haiku',
        prependCLISysprompt: false,
      },
    )

    const content = response.message.content
    const recap = typeof content === 'string'
      ? content
      : content.length > 0 && content[0]?.type === 'text'
        ? content[0].text
        : 'Session activity summary unavailable.'

    return recap.trim()
  } catch {
    return 'Session activity summary unavailable.'
  }
}

export interface SessionSummary {
  title: string
  recap: string
  messageCount: number
  lastActivity: Date
}

export async function generateSessionSummary(messages: Message[]): Promise<SessionSummary> {
  const [title, recap] = await Promise.all([
    generateSessionTitle(messages),
    generateAwayRecap(messages),
  ])

  const lastActivity = new Date()

  return {
    title,
    recap,
    messageCount: messages.length,
    lastActivity,
  }
}
