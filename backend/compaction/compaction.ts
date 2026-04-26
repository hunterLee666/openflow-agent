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

export function estimateCost(
  usage: { inputTokens: number; outputTokens: number },
  model: string,
  pricingCache?: Record<string, { inputCostPerMTok: number; outputCostPerMTok: number }>
): number {
  const inputCostPerMTok = pricingCache?.[model.toLowerCase()]?.inputCostPerMTok || getInputCostPerMToken(model);
  const outputCostPerMTok = pricingCache?.[model.toLowerCase()]?.outputCostPerMTok || getOutputCostPerMToken(model);

  const inputCost = (usage.inputTokens / 1000000) * inputCostPerMTok;
  const outputCost = (usage.outputTokens / 1000000) * outputCostPerMTok;

  return inputCost + outputCost;
}

function getInputCostPerMToken(model: string): number {
  return 1;
}

function getOutputCostPerMToken(model: string): number {
  return 2;
}
