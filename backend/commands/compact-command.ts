import type { CommandRegistry } from "./command-registry.js";
import type { Message } from "../session/types.js";
import { estimateTokenCount, cacheAwareCompaction, cacheAwareTier1Compaction, getCacheStabilityReport, buildTier3SummaryPrompt, formatTier3Summary, type Tier3Summary } from "../compaction/index.js";

export interface CompactCommandOptions {
  focus?: string;
  force?: boolean;
  tier?: "1" | "2" | "3";
  showStats?: boolean;
}

export function createCompactCommand(
  sessionManager: {
    loadSession: (threadId: string) => Promise<Message[]>;
    saveSession: (threadId: string, messages: Message[]) => Promise<void>;
  },
  currentThreadId?: string
) {
  const handler = async (args: string): Promise<string> => {
    const parsed = parseCompactArgs(args);

    if (parsed.showStats) {
      return showCompactionStats(sessionManager, currentThreadId);
    }

    return executeCompact(sessionManager, currentThreadId, parsed);
  };

  return {
    name: "compact",
    description: "手动压缩上下文，可选焦点提示（如 /compact --focus \"重构用户认证模块\"）",
    handler,
    aliases: ["compress", "summarize"],
  };
}

function parseCompactArgs(args: string): CompactCommandOptions {
  const parts = args.trim().split(/\s+/);
  const options: CompactCommandOptions = {};

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "--focus" || part === "-f") {
      options.focus = parts.slice(i + 1).join(" ");
      break;
    } else if (part === "--force" || part === "-F") {
      options.force = true;
    } else if (part === "--tier" || part === "-t") {
      const tier = parts[i + 1];
      if (tier === "1" || tier === "2" || tier === "3") {
        options.tier = tier;
      }
      i++;
    } else if (part === "--stats" || part === "-s") {
      options.showStats = true;
    }
  }

  return options;
}

async function showCompactionStats(
  sessionManager: { loadSession: (threadId: string) => Promise<Message[]> },
  threadId?: string
): Promise<string> {
  if (!threadId) {
    return "当前无活跃会话";
  }

  const messages = await sessionManager.loadSession(threadId);
  const totalTokens = estimateTokenCount(messages);
  const stability = getCacheStabilityReport(messages);

  const toolCount = messages.filter((m) => m.role === "tool").length;
  const userCount = messages.filter((m) => m.role === "user").length;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;

  return `📊 会话统计:
- 消息总数: ${messages.length} (用户: ${userCount}, 助手: ${assistantCount}, 工具: ${toolCount})
- 预估 Token: ${totalTokens.toLocaleString()}
- 缓存稳定性: ${(stability.overallStability * 100).toFixed(1)}%
- 稳定前缀: ${stability.stablePrefix} 条消息
- 不稳定区域: ${stability.unstableRegions.length} 处

💡 建议:
${totalTokens > 120000 ? "- ⚠️ 已超过 60% 阈值，建议执行 /compact" : "- ✅ Token 使用正常"}
${stability.overallStability < 0.5 ? "- ⚠️ 缓存稳定性较低，建议减少工具输出" : "- ✅ 缓存前缀稳定"}
${toolCount > 20 ? "- ⚠️ 工具结果过多，建议清理旧输出" : "- ✅ 工具结果数量合理"}`;
}

async function executeCompact(
  sessionManager: {
    loadSession: (threadId: string) => Promise<Message[]>;
    saveSession: (threadId: string, messages: Message[]) => Promise<void>;
  },
  threadId?: string,
  options?: CompactCommandOptions
): Promise<string> {
  if (!threadId) {
    return "当前无活跃会话，无法执行压缩";
  }

  const messages = await sessionManager.loadSession(threadId);
  const totalTokens = estimateTokenCount(messages);

  if (totalTokens < 10000 && !options?.force) {
    return `当前会话仅 ${totalTokens.toLocaleString()} token，无需压缩。使用 /compact --force 强制执行。`;
  }

  let result: string;

  switch (options?.tier) {
    case "1":
      result = executeTier1Compact(messages, threadId, sessionManager, options);
      break;
    case "3":
      result = executeTier3Compact(messages, threadId, sessionManager, options);
      break;
    default:
      result = executeDefaultCompact(messages, threadId, sessionManager, options);
      break;
  }

  return result;
}

function executeTier1Compact(
  messages: Message[],
  threadId: string,
  sessionManager: { saveSession: (threadId: string, messages: Message[]) => Promise<void> },
  options?: CompactCommandOptions
): string {
  const result = cacheAwareTier1Compaction(messages);

  if (result.editsApplied > 0) {
    sessionManager.saveSession(threadId, result.messages);
    return `✅ Tier1 压缩完成:
- 清理 ${result.editsApplied} 个旧工具结果
- 缓存前缀${result.prefixStable ? "保持稳定" : "可能被修改"}
- 冲突数: ${result.conflicts}`;
  }

  return "ℹ️ 无需 Tier1 压缩（工具结果 ≤ 5 个）";
}

function executeDefaultCompact(
  messages: Message[],
  threadId: string,
  sessionManager: { saveSession: (threadId: string, messages: Message[]) => Promise<void> },
  options?: CompactCommandOptions
): string {
  const targetTokens = Math.floor(estimateTokenCount(messages) * 0.6);
  const result = cacheAwareCompaction(messages, targetTokens);

  if (result.editsApplied > 0) {
    sessionManager.saveSession(threadId, result.messages);

    const newTokens = estimateTokenCount(result.messages);
    const saved = estimateTokenCount(messages) - newTokens;

    let focusNote = "";
    if (options?.focus) {
      focusNote = `\n- 焦点: "${options.focus}"`;
    }

    return `✅ 上下文压缩完成${focusNote}:
- 应用 ${result.editsApplied} 个 cache_edits
- 节省 ${saved.toLocaleString()} token (${((saved / estimateTokenCount(messages)) * 100).toFixed(1)}%)
- 当前 ${newTokens.toLocaleString()} token
- 缓存前缀${result.prefixStable ? "保持稳定" : "可能被修改"}`;
  }

  return "ℹ️ 无需压缩（已在目标范围内）";
}

function executeTier3Compact(
  messages: Message[],
  threadId: string,
  sessionManager: { saveSession: (threadId: string, messages: Message[]) => Promise<void> },
  options?: CompactCommandOptions
): string {
  const prompt = buildTier3SummaryPrompt(messages);

  let focusNote = "";
  if (options?.focus) {
    focusNote = `\n\n### 用户焦点提示\n${options.focus}`;
  }

  const systemMsg = messages.find((m) => m.role === "system");
  const recentMessages = messages.filter((m) => m.role !== "system").slice(-20);

  const summaryContent = `## Tier3 完全压缩摘要${focusNote}

> 注意：此为本地生成的结构化摘要，完整上下文已保存。
> 建议在新会话中携带此摘要继续工作。

### 会话信息
- 原始消息数: ${messages.length}
- 原始 Token 数: ${estimateTokenCount(messages).toLocaleString()}
- 压缩时间: ${new Date().toISOString()}

### 焦点提示
${options?.focus || "无"}

---

请使用以下提示词调用 LLM 生成完整九节摘要:

${prompt}`;

  const newMessages: Message[] = systemMsg ? [systemMsg] : [];
  newMessages.push({
    role: "assistant",
    content: summaryContent,
  });

  sessionManager.saveSession(threadId, newMessages);

  return `✅ Tier3 完全压缩已执行:
- 原始 ${messages.length} 条消息 → ${newMessages.length} 条
- 已生成九节摘要提示词
- 请在新会话中携带此摘要继续工作`;
}

export function registerCompactCommands(registry: CommandRegistry): void {
  const compactCmd = createCompactCommand(
    {
      loadSession: async () => [],
      saveSession: async () => {},
    }
  );

  registry.register(compactCmd);
}
