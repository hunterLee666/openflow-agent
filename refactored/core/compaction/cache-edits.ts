import { createHash } from "node:crypto";
import type { Message, ContentBlock } from "../session/types.js";

export interface CacheEdit {
  messageIndex: number;
  oldHash: string;
  newContent: string | ContentBlock[];
  reason?: string;
}

export interface CacheEditResult {
  messages: Message[];
  editsApplied: number;
  conflicts: number;
  prefixStable: boolean;
}

export interface CacheAwareConfig {
  enableCacheEdits: boolean;
  preserveSystemPrefix: boolean;
  elideThreshold: number;
  maxElidedBytes: number;
}

const DEFAULT_CONFIG: CacheAwareConfig = {
  enableCacheEdits: true,
  preserveSystemPrefix: true,
  elideThreshold: 1000,
  maxElidedBytes: 500,
};

export function hashContent(content: string | ContentBlock[]): string {
  const canonical = typeof content === "string"
    ? content
    : JSON.stringify(content, Object.keys(content[0] ?? {}).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function hashMessage(msg: Message): string {
  return hashContent(msg.content);
}

export function applyCacheEdits(
  messages: Message[],
  edits: CacheEdit[],
  config?: Partial<CacheAwareConfig>
): CacheEditResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let editsApplied = 0;
  let conflicts = 0;

  const resultMessages = [...messages];

  for (const edit of edits) {
    if (edit.messageIndex < 0 || edit.messageIndex >= messages.length) {
      conflicts++;
      continue;
    }

    const msg = resultMessages[edit.messageIndex];
    const currentHash = hashMessage(msg);

    if (currentHash !== edit.oldHash) {
      conflicts++;
      continue;
    }

    if (cfg.preserveSystemPrefix && msg.role === "system") {
      conflicts++;
      continue;
    }

    resultMessages[edit.messageIndex] = {
      ...msg,
      content: edit.newContent,
    };
    editsApplied++;
  }

  return {
    messages: resultMessages,
    editsApplied,
    conflicts,
    prefixStable: conflicts === 0,
  };
}

export function createElideEdits(
  messages: Message[],
  config?: Partial<CacheAwareConfig>
): CacheEdit[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const edits: CacheEdit[] = [];

  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "tool") {
      toolResultIndices.push(i);
    }
  }

  if (toolResultIndices.length <= 5) {
    return edits;
  }

  const toElide = toolResultIndices.slice(0, -5);

  for (const idx of toElide) {
    const msg = messages[idx];
    const contentSize = getContentSize(msg.content);

    if (contentSize > cfg.elideThreshold) {
      edits.push({
        messageIndex: idx,
        oldHash: hashMessage(msg),
        newContent: [{
          type: "text" as const,
          text: `[tool output elided; ${contentSize} bytes removed by cache-aware compaction]`,
        }],
        reason: "tier1-micro-compaction",
      });
    }
  }

  return edits;
}

export function createTruncateEdits(
  messages: Message[],
  config?: Partial<CacheAwareConfig>
): CacheEdit[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const edits: CacheEdit[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "tool") {
      const contentSize = getContentSize(msg.content);
      if (contentSize > cfg.maxElidedBytes) {
        const truncated = truncateContent(msg.content, cfg.maxElidedBytes);
        edits.push({
          messageIndex: i,
          oldHash: hashMessage(msg),
          newContent: truncated,
          reason: "content-truncation",
        });
      }
    }
  }

  return edits;
}

export function cacheAwareTier1Compaction(
  messages: Message[],
  config?: Partial<CacheAwareConfig>
): CacheEditResult {
  const edits = createElideEdits(messages, config);

  if (edits.length === 0) {
    return {
      messages,
      editsApplied: 0,
      conflicts: 0,
      prefixStable: true,
    };
  }

  return applyCacheEdits(messages, edits, config);
}

export function cacheAwareCompaction(
  messages: Message[],
  targetMaxTokens: number,
  config?: Partial<CacheAwareConfig>
): CacheEditResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  let currentMessages = [...messages];
  let totalEdits = 0;

  const elideEdits = createElideEdits(currentMessages, cfg);
  if (elideEdits.length > 0) {
    const result = applyCacheEdits(currentMessages, elideEdits, cfg);
    currentMessages = result.messages;
    totalEdits += result.editsApplied;
  }

  const estimatedTokens = estimateTokensFromMessages(currentMessages);
  if (estimatedTokens > targetMaxTokens) {
    const truncateEdits = createTruncateEdits(currentMessages, {
      ...cfg,
      maxElidedBytes: Math.max(200, cfg.maxElidedBytes / 2),
    });

    if (truncateEdits.length > 0) {
      const result = applyCacheEdits(currentMessages, truncateEdits, cfg);
      currentMessages = result.messages;
      totalEdits += result.editsApplied;
    }
  }

  return {
    messages: currentMessages,
    editsApplied: totalEdits,
    conflicts: 0,
    prefixStable: true,
  };
}

function getContentSize(content: string | ContentBlock[]): number {
  if (typeof content === "string") {
    return content.length;
  }
  return content
    .map((c) => c.text?.length ?? 0)
    .reduce((sum, len) => sum + len, 0);
}

function truncateContent(content: string | ContentBlock[], maxBytes: number): string | ContentBlock[] {
  if (typeof content === "string") {
    if (content.length <= maxBytes) return content;
    return content.slice(0, maxBytes) + "\n... [truncated]";
  }

  let remaining = maxBytes;
  const truncated: ContentBlock[] = [];

  for (const block of content) {
    if (remaining <= 0) break;

    if (block.text) {
      if (block.text.length <= remaining) {
        truncated.push(block);
        remaining -= block.text.length;
      } else {
        truncated.push({
          ...block,
          text: block.text.slice(0, remaining) + "\n... [truncated]",
        });
        remaining = 0;
      }
    } else {
      truncated.push(block);
    }
  }

  return truncated;
}

function estimateTokensFromMessages(messages: Message[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalChars += msg.content.length;
    } else {
      for (const block of msg.content) {
        totalChars += block.text?.length ?? 0;
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

export function getCacheStabilityReport(messages: Message[]): {
  stablePrefix: number;
  unstableRegions: number[];
  overallStability: number;
} {
  const hashes: string[] = [];
  for (const msg of messages) {
    hashes.push(hashMessage(msg));
  }

  let stableCount = 0;
  const unstableRegions: number[] = [];

  for (let i = 0; i < hashes.length; i++) {
    if (messages[i].role === "system" || messages[i].role === "user") {
      stableCount++;
    } else {
      unstableRegions.push(i);
    }
  }

  return {
    stablePrefix: stableCount,
    unstableRegions,
    overallStability: stableCount / hashes.length,
  };
}
