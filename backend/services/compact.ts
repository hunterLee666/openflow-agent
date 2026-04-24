import type { Message, ContentBlock } from '../types/index.js';

export interface CompactOptions {
  maxTokens?: number;
  force?: boolean;
  preserveRecentMessages?: number;
}

export interface CompactResult {
  messages: Message[];
  executed: boolean;
  tokensFreed: number;
  boundaryMessage?: Message;
  summary?: string;
}

export const COMPACT_MAX_OUTPUT_TOKENS = 8000;
export const COMPACT_TOKEN_BUDGET = 50000;
export const COMPACT_MAX_TOKENS_PER_FILE = 5000;

export function groupMessagesByApiRound(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  let current: Message[] = [];
  let lastAssistantId: string | undefined;

  for (const msg of messages) {
    if (
      msg.role === 'assistant' &&
      (msg as unknown as { id?: string }).id !== lastAssistantId &&
      current.length > 0
    ) {
      groups.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
    if (msg.role === 'assistant') {
      lastAssistantId = (msg as unknown as { id?: string }).id;
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

export function stripImagesFromMessages(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (message.role === 'user') {
      const content = message.content;
      if (typeof content === 'string') {
        return message;
      }
      const filteredContent = content.filter(
        (block) => !isImageBlock(block)
      );
      return {
        ...message,
        content: filteredContent.length > 0 ? filteredContent : content,
      };
    }
    return message;
  });
}

function isImageBlock(block: ContentBlock): boolean {
  if (block.type === 'tool_result' && block.content) {
    const toolContent = block.content;
    if (Array.isArray(toolContent)) {
      return toolContent.some(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'type' in item &&
          (item as { type?: string }).type === 'image'
      );
    }
  }
  return false;
}

export function shouldCompact(
  messages: Message[],
  options: CompactOptions = {}
): boolean {
  if (options.force) {
    return true;
  }

  const tokenCount = estimateTokenCount(messages);
  const maxTokens = options.maxTokens ?? COMPACT_TOKEN_BUDGET;

  return tokenCount > maxTokens;
}

export function estimateTokenCount(messages: Message[]): number {
  const text = messages
    .map((m) => {
      const content = m.content;
      if (typeof content === 'string') {
        return content;
      }
      return content.map((c) => c.text ?? '').join('\n');
    })
    .join('\n');

  return Math.ceil(text.length / 4);
}

export function compactMessages(
  messages: Message[],
  options: CompactOptions = {}
): CompactResult {
  const maxTokens = options.maxTokens ?? COMPACT_TOKEN_BUDGET;
  const preserveRecent = options.preserveRecentMessages ?? 10;

  if (!shouldCompact(messages, { maxTokens, ...options })) {
    return {
      messages,
      executed: false,
      tokensFreed: 0,
    };
  }

  const originalCount = estimateTokenCount(messages);
  const recentMessages = messages.slice(-preserveRecent);
  const olderMessages = messages.slice(0, -preserveRecent);

  const grouped = groupMessagesByApiRound(olderMessages);

  const preservedGroups: Message[][] = [];
  let currentTokens = estimateTokenCount(recentMessages);

  for (const group of grouped.reverse()) {
    const groupTokens = estimateTokenCount(group);
    if (currentTokens + groupTokens <= maxTokens * 0.8) {
      preservedGroups.unshift(group);
      currentTokens += groupTokens;
    } else {
      break;
    }
  }

  const boundaryMessage = preservedGroups.length > 0
    ? preservedGroups[preservedGroups.length - 1][0]
    : recentMessages[0];

  const compactedMessages: Message[] = [
    createCompactBoundaryMessage(),
    ...preservedGroups.flat(),
    ...recentMessages,
  ];

  const newCount = estimateTokenCount(compactedMessages);
  const tokensFreed = originalCount - newCount;

  return {
    messages: compactedMessages,
    executed: true,
    tokensFreed,
    boundaryMessage,
  };
}

export function createCompactBoundaryMessage(): Message {
  return {
    role: 'system',
    content: '[Previous conversation has been summarized for context]',
  };
}

export function getCompactPrompt(mode: 'base' | 'partial' = 'base'): string {
  if (mode === 'partial') {
    return `Your task is to create a summary of the RECENT portion of the conversation. Focus on:
1. Recent user requests and intents
2. Key technical decisions and code patterns
3. Files modified and important code snippets
4. Errors encountered and fixes
5. Pending tasks

Provide a concise but thorough summary.`;
  }

  return `Your task is to create a detailed summary of the conversation so far.

1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections (with full snippets)
4. Errors and fixes
5. Problem Solving
6. All user messages
7. Pending Tasks
8. Current Work
9. Optional Next Step

Be thorough and include exact quotes where applicable.`;
}
