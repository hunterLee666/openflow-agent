import type { Message, ContentBlock } from "../session/types.js";

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

export const COMPACT_TOKEN_BUDGET = 50000;

export function groupMessagesByApiRound(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  let current: Message[] = [];
  let lastAssistantId: string | undefined;

  for (const msg of messages) {
    if (
      msg.role === "assistant" &&
      (msg as unknown as { id?: string }).id !== lastAssistantId &&
      current.length > 0
    ) {
      groups.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
    if (msg.role === "assistant") {
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
    if (message.role === "user") {
      const content = message.content;
      if (typeof content === "string") {
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
  if (block.type === "tool_result" && block.content) {
    const toolContent = block.content;
    if (Array.isArray(toolContent)) {
      return toolContent.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          (item as { type?: string }).type === "image"
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
      if (typeof content === "string") {
        return content;
      }
      return content.map((c) => c.text ?? "").join("\n");
    })
    .join("\n");

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
    role: "system",
    content: "[Previous conversation has been summarized for context]",
  };
}

export function tier1MicroCompaction(messages: Message[]): { compacted: Message[]; elidedCount: number } {
  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "tool") {
      toolResultIndices.push(i);
    }
  }

  if (toolResultIndices.length <= 5) {
    return { compacted: messages, elidedCount: 0 };
  }

  const toElide = toolResultIndices.slice(0, -5);
  let elidedCount = 0;

  const compacted = messages.map((msg, idx) => {
    if (msg.role === "tool" && toElide.includes(idx)) {
      elidedCount++;
      return {
        ...msg,
        content: [{
          type: "text" as const,
          text: "[tool output elided by Tier1 micro-compaction]",
        }],
      };
    }
    return msg;
  });

  return { compacted, elidedCount };
}

export function estimateCost(usage: { inputTokens: number; outputTokens: number }, model: string): number {
  const inputCostPerMTok = getInputCostPerMToken(model);
  const outputCostPerMTok = getOutputCostPerMToken(model);

  const inputCost = (usage.inputTokens / 1000000) * inputCostPerMTok;
  const outputCost = (usage.outputTokens / 1000000) * outputCostPerMTok;

  return inputCost + outputCost;
}

function getInputCostPerMToken(model: string): number {
  const costs: Record<string, number> = {
    "claude-opus-4-5": 15,
    "claude-sonnet-4-5": 3,
    "claude-haiku-4-5": 0.25,
    "gpt-4o": 5,
    "gpt-4o-mini": 0.15,
    "gpt-4-turbo": 10,
    "gpt-3.5-turbo": 0.5,
    "qwen3-32b": 0.2,
    "qwen3-14b": 0.12,
    "deepseek-chat": 0.14,
    "deepseek-coder": 0.14,
    "zhipu-glm-4": 0.1,
    "minimax": 0.1,
    "moonshot-v1-8k": 0.06,
  };

  return costs[model.toLowerCase()] || 1;
}

function getOutputCostPerMToken(model: string): number {
  const costs: Record<string, number> = {
    "claude-opus-4-5": 75,
    "claude-sonnet-4-5": 15,
    "claude-haiku-4-5": 1.25,
    "gpt-4o": 15,
    "gpt-4o-mini": 0.6,
    "gpt-4-turbo": 30,
    "gpt-3.5-turbo": 1.5,
    "qwen3-32b": 0.8,
    "qwen3-14b": 0.48,
    "deepseek-chat": 0.28,
    "deepseek-coder": 0.28,
    "zhipu-glm-4": 0.4,
    "minimax": 0.4,
    "moonshot-v1-8k": 0.24,
  };

  return costs[model.toLowerCase()] || 2;
}
