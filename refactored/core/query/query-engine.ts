import type { Message, ContentBlock } from "../session/types.js";
import type { LLMClient, LLMMessage, LLMToolDefinition, StreamCallbacks, CompletionResult, LLMToolCall } from "../llm/index.js";
import type { SessionManager } from "../session/session.js";
import { compactMessages, shouldCompact, estimateTokenCount, tier1MicroCompaction, COMPACT_TOKEN_BUDGET, estimateCost, buildTier3SummaryPrompt, formatTier3Summary, cacheAwareTier1Compaction, cacheAwareCompaction, type CacheEditResult, type Tier3Summary } from "../compaction/index.js";
import { FourteenStepGovernancePipeline, type GovernanceContext, type GovernanceHooks } from "../governance/index.js";
import { HookSystem, type HookContext, type HookResult, type HookEvent } from "../hooks/index.js";
import type { EnhancedMemoryCore } from "../memory/enhanced-memory-core.js";
import type { IntentRecognitionResult, SafetyLevel } from "../memory/intent-recognizer.js";
import type { PermissionSystem } from "../permissions/index.js";
import { PermissionDecision } from "../permissions/index.js";
import type { PromptCacheMonitor } from "../prompts/cache-monitor.js";

export interface QueryInput {
  message: string;
  threadId?: string;
  model?: string;
  tools?: LLMToolDefinition[];
  systemPrompt?: string;
}

export interface QueryConfig {
  apiKey: string;
  provider?: string;
  baseUrl?: string;
  model: string;
  maxTokens: number;
  maxTurns: number;
  tokenBudget: number;
  moneyBudgetUsd?: number;
  compactionThreshold: number;
  maxCompactionFailures: number;
  permissionMode?: "readonly" | "auto" | "default";
}

export interface QueryState {
  turn: number;
  messages: Message[];
  model: string;
  compactionFailures: number;
  compactionCircuitOpen: boolean;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  threadId: string;
  retryAttempt: number;
}

export interface QueryResult {
  threadId: string;
  turn: number;
  content: string;
  toolCalls: LLMToolCall[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  stopReason: string;
}

export type StreamEvent =
  | { kind: "assistant_text_delta"; text: string }
  | { kind: "tool_input_delta"; partialJson: string }
  | { kind: "thinking_delta"; thinking: string }
  | { kind: "tool_call"; toolCall: LLMToolCall }
  | { kind: "tool_result"; toolName: string; result: string }
  | { kind: "completion"; text: string }
  | { kind: "error"; error: string };

export interface QueryToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isConcurrencySafe: boolean;
  resourceKeys?: string[];
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface QueryToolRegistry {
  list(): QueryToolDefinition[];
  get(name: string): QueryToolDefinition | undefined;
}

export interface QueryContext {
  llmClient: LLMClient;
  session: SessionManager;
  toolRegistry: QueryToolRegistry;
  config: QueryConfig;
  abortSignal: AbortSignal;
  onStreamEvent?: (event: StreamEvent) => void;
  cacheMonitor?: PromptCacheMonitor;
  hooks?: GovernanceHooks;
  governancePipeline?: FourteenStepGovernancePipeline;
  hookSystem?: HookSystem;
  memoryCore?: EnhancedMemoryCore;
  permissionSystem?: PermissionSystem;
}

export async function* query(
  input: QueryInput,
  ctx: QueryContext,
): AsyncGenerator<StreamEvent, QueryResult, undefined> {
  const threadId = input.threadId || (await ctx.session.createSession());

  let intentResult: IntentRecognitionResult | undefined;
  if (ctx.memoryCore && input.message) {
    intentResult = await ctx.memoryCore.recognizeIntent(input.message);

    if (intentResult.safetyLevel === SafetyLevel.BLOCKED) {
      yield { kind: "error", error: intentResult.clarificationQuestion || "此操作被安全策略阻止。" };
      return {
        threadId,
        turn: 0,
        content: "",
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        stopReason: "blocked",
      };
    }
  }

  const initialState: QueryState = {
    turn: 0,
    messages: await ctx.session.loadSession(threadId),
    model: input.model || ctx.config.model,
    compactionFailures: 0,
    compactionCircuitOpen: false,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    threadId,
    retryAttempt: 0,
  };

  if (input.message) {
    initialState.messages.push({
      role: "user",
      content: input.message,
    });
  }

  try {
    const result = yield* queryLoop(initialState, ctx, input.tools, input.systemPrompt, intentResult);
    await ctx.session.saveSession(threadId, initialState.messages);
    return result;
  } catch (error) {
    await ctx.session.saveSession(threadId, initialState.messages);
    throw error;
  }
}

async function* queryLoop(
  state: QueryState,
  ctx: QueryContext,
  tools?: LLMToolDefinition[],
  systemPrompt?: string,
  intentResult?: IntentRecognitionResult,
): AsyncGenerator<StreamEvent, QueryResult, undefined> {
  while (true) {
    if (ctx.abortSignal.aborted) {
      return finalizeResult(state, "cancelled", "user_abort");
    }

    state.turn += 1;

    if (state.turn > ctx.config.maxTurns) {
      return finalizeResult(state, "max_turns_exceeded", `Reached max turns: ${ctx.config.maxTurns}`);
    }

    state.messages = await prepareMessagesWithCompaction(state, ctx, systemPrompt);
    if (state.compactionCircuitOpen) {
      return finalizeResult(state, "compaction_circuit_breaker", "Compaction failed too many times");
    }

    const budget = checkBudgets(state, ctx);
    if (!budget.ok) {
      return finalizeResult(state, "budget_exceeded", budget.reason);
    }

    if (ctx.hookSystem) {
      const hookCtx: HookContext = {
        sessionId: state.threadId,
        timestamp: Date.now(),
        metadata: {
          turn: state.turn,
          prompt: extractLastUserText(state.messages),
        },
      };
      const results = await ctx.hookSystem.dispatch("UserPromptSubmit" as HookEvent, hookCtx);
      const blocked = results.find((r) => r.action === "block");
      if (blocked) {
        return finalizeResult(state, "cancelled", blocked.message || "Blocked by hook");
      }
    }

    let assistantMsg: Message | undefined;
    try {
      assistantMsg = await collectAssistantMessage(state, ctx, tools);
    } catch (e) {
      if (ctx.hookSystem) {
        const hookCtx: HookContext = {
          sessionId: state.threadId,
          timestamp: Date.now(),
          metadata: { error: e },
        };
        await ctx.hookSystem.dispatch("Error" as HookEvent, hookCtx);
      }
      const recovered = await handleStreamError(e as Error, ctx, state);
      if (!recovered) {
        return finalizeResult(state, "fatal_error", (e as Error).message);
      }
      continue;
    }

    if (!assistantMsg) {
      continue;
    }

    state.retryAttempt = 0;
    state.messages.push(assistantMsg);

    if (ctx.hookSystem) {
      const hookCtx: HookContext = {
        sessionId: state.threadId,
        timestamp: Date.now(),
        metadata: { responseLength: extractVisibleText(assistantMsg).length },
      };
      await ctx.hookSystem.dispatch("AssistantResponseComplete" as HookEvent, hookCtx);
    }

    const toolUses = extractToolUses(assistantMsg);
    state.usage = estimateUsage(state.messages);

    if (toolUses.length === 0) {
      const finalText = extractVisibleText(assistantMsg);
      if (ctx.memoryCore) {
        await ctx.memoryCore.recordAssistantResponse(finalText);
      }
      return finalizeResult(state, "completed", undefined, finalText);
    }

    yield { kind: "completion", text: `Executing ${toolUses.length} tool(s)...` };

    const toolResults = await executeTools(toolUses, state, ctx);
    state.messages.push(...toolResults.map((r) => ({ role: "tool" as const, content: [r] })));

    const tier1Result = cacheAwareTier1Compaction(state.messages);
    if (tier1Result.editsApplied > 0) {
      state.messages = tier1Result.messages;
    }
  }
}

function extractLastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const c = messages[i].content;
      return typeof c === "string" ? c : "";
    }
  }
  return "";
}

async function prepareMessagesWithCompaction(
  state: QueryState,
  ctx: QueryContext,
  systemPrompt?: string,
): Promise<Message[]> {
  let messages = [...state.messages];

  const totalTokens = estimateTokenCount(messages);
  const threshold = ctx.config.compactionThreshold;
  const contextWindow = ctx.config.maxTokens || threshold;

  if (ctx.cacheMonitor) {
    const report = ctx.cacheMonitor.getHealthReport(totalTokens, contextWindow);
    if (report.contextWarning) {
      console.warn(report.contextWarning);
    }
  }

  if (totalTokens > threshold * 0.87) {
    try {
      const cacheResult = cacheAwareCompaction(messages, threshold);
      if (cacheResult.editsApplied > 0) {
        messages = cacheResult.messages;
        state.compactionFailures = 0;
      } else {
        messages = await runCompaction(messages, ctx);
        state.compactionFailures = 0;
      }
    } catch (e) {
      state.compactionFailures += 1;
      if (state.compactionFailures >= ctx.config.maxCompactionFailures) {
        state.compactionCircuitOpen = true;
        throw new Error("Compaction circuit breaker open");
      }
      messages = fallbackTrim(messages);
    }
  } else if (totalTokens > threshold * 0.60) {
    if (ctx.cacheMonitor) {
      const report = ctx.cacheMonitor.getHealthReport(totalTokens, contextWindow);
      if (report.contextUsageRatio && report.contextUsageRatio >= 0.60) {
        console.warn(`⚠️ 上下文使用率已达 ${(report.contextUsageRatio * 100).toFixed(1)}%，建议执行 /compact 或拆分任务`);
      }
    }
  }

  return injectSystemIfNeeded(messages, systemPrompt);
}

async function injectSystemIfNeeded(messages: Message[], systemPrompt?: string): Promise<Message[]> {
  const system = systemPrompt || "You are a helpful assistant.";
  if (messages[0]?.role === "system") {
    return [{ role: "system", content: system }, ...messages.slice(1)];
  }
  return [{ role: "system", content: system }, ...messages];
}

async function runCompaction(messages: Message[], ctx: QueryContext): Promise<Message[]> {
  const compactResult = compactMessages(messages, {
    maxTokens: ctx.config.compactionThreshold,
    preserveRecentMessages: 10,
  });

  if (compactResult.executed) {
    return compactResult.messages;
  }

  return runTier3Compaction(messages, ctx);
}

async function runTier3Compaction(messages: Message[], ctx: QueryContext): Promise<Message[]> {
  const tier3Prompt = buildTier3SummaryPrompt(messages);

  try {
    const systemMsg = messages.find((m) => m.role === "system");
    const recentMessages = messages.filter((m) => m.role !== "system").slice(-20);

    const completionResult = await ctx.llmClient.complete([
      ...recentMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: typeof m.content === "string" ? m.content : m.content.find((c) => c.type === "text")?.text || "",
      })),
      { role: "user" as const, content: tier3Prompt },
    ]);

    const responseText = completionResult.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const summary = JSON.parse(jsonMatch[0]) as Tier3Summary;
      const formatted = formatTier3Summary(summary);

      const newMessages: Message[] = systemMsg ? [systemMsg] : [];
      newMessages.push({
        role: "assistant",
        content: `## Tier3 Summary\n\n${formatted}`,
      });

      const lastUserMsg = messages.filter((m) => m.role === "user").pop();
      if (lastUserMsg) newMessages.push(lastUserMsg);

      return newMessages;
    }
  } catch (e) {
    console.error("Tier3 compaction failed:", e);
  }

  return fallbackTrim(messages);
}

function fallbackTrim(messages: Message[]): Message[] {
  const systemMsg = messages.find((m) => m.role === "system");
  const recent = messages.filter((m) => m.role !== "system").slice(-10);
  return systemMsg ? [systemMsg, ...recent] : recent;
}

async function collectAssistantMessage(
  state: QueryState,
  ctx: QueryContext,
  tools?: LLMToolDefinition[],
): Promise<Message | undefined> {
  const messages: LLMMessage[] = state.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role as "user" | "assistant" | "tool", content: m.content };
      }
      const text = m.content.find((c) => c.type === "text")?.text || "";
      return { role: m.role as "user" | "assistant" | "tool", content: text };
    });

  let fullContent = "";
  const toolCalls: LLMToolCall[] = [];

  const callbacks: StreamCallbacks = {
    onText: (text: string) => {
      fullContent += text;
      ctx.onStreamEvent?.({ kind: "assistant_text_delta", text });
    },
    onToolCall: (tc: LLMToolCall) => {
      toolCalls.push(tc);
      ctx.onStreamEvent?.({ kind: "tool_call", toolCall: tc });
    },
  };

  const result = await ctx.llmClient.complete(messages, tools, callbacks);

  const content: ContentBlock[] = [];
  if (fullContent) {
    content.push({ type: "text", text: fullContent });
  }
  for (const tc of toolCalls) {
    content.push({
      type: "tool_use",
      id: tc.id,
      name: tc.name,
      input: tc.input,
    });
  }

  return { role: "assistant", content };
}

function extractToolUses(msg: Message): LLMToolCall[] {
  if (typeof msg.content === "string") return [];
  return msg.content
    .filter((c): c is ContentBlock & { type: "tool_use" } => c.type === "tool_use")
    .map((c) => ({
      id: c.id || "",
      name: c.name || "",
      input: c.input || {},
    }));
}

function extractVisibleText(msg: Message): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((c): c is ContentBlock & { type: "text" } => c.type === "text")
    .map((c) => c.text || "")
    .join("");
}

type PlannedGroup =
  | { mode: "parallel"; items: LLMToolCall[] }
  | { mode: "serial"; items: LLMToolCall[] };

function planToolExecution(
  uses: LLMToolCall[],
  registry: QueryToolRegistry,
  maxParallel?: number,
): PlannedGroup[] {
  const groups: PlannedGroup[] = [];
  let buffer: LLMToolCall[] = [];
  const max = maxParallel ?? 4;

  const flushParallel = () => {
    if (buffer.length === 0) return;
    if (buffer.length > max) {
      for (let i = 0; i < buffer.length; i += max) {
        groups.push({ mode: "parallel", items: buffer.slice(i, i + max) });
      }
    } else {
      groups.push({ mode: "parallel", items: buffer });
    }
    buffer = [];
  };

  for (const u of uses) {
    const def = registry.get(u.name);
    const safe = def?.isConcurrencySafe ?? false;
    const hasResourceConflict = safe && buffer.some((existing) => {
      const existingDef = registry.get(existing.name);
      const uDef = registry.get(u.name);
      if (!existingDef?.resourceKeys || !uDef?.resourceKeys) return false;
      const existingKeys = extractResourceKeys(existing.input, existingDef.resourceKeys);
      const uKeys = extractResourceKeys(u.input, uDef.resourceKeys);
      return existingKeys.some((k) => uKeys.includes(k));
    });

    if (safe && !hasResourceConflict) {
      buffer.push(u);
    } else {
      flushParallel();
      groups.push({ mode: "serial", items: [u] });
    }
  }
  flushParallel();
  return groups;
}

function extractResourceKeys(input: Record<string, unknown>, keys: string[]): string[] {
  return keys
    .map((k) => {
      const val = input[k];
      return typeof val === "string" ? val : "";
    })
    .filter(Boolean);
}

async function executePlan(
  plan: PlannedGroup[],
  ctx: QueryContext,
  state: QueryState,
): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];

  for (const g of plan) {
    if (g.mode === "parallel") {
      const chunk = await Promise.all(
        g.items.map((u) => runSingleTool(u, ctx, state)),
      );
      out.push(...chunk);
    } else {
      for (const u of g.items) {
        out.push(await runSingleTool(u, ctx, state));
      }
    }
  }

  return out;
}

async function runSingleTool(
  tu: LLMToolCall,
  ctx: QueryContext,
  state: QueryState,
): Promise<ContentBlock> {
  const tool = ctx.toolRegistry.get(tu.name);
  if (!tool) {
    return {
      type: "tool_result",
      tool_use_id: tu.id,
      content: [{ type: "text", text: `Tool "${tu.name}" not found` }],
    };
  }

  try {
    let output: unknown;
    
    if (ctx.permissionSystem) {
      const permissionResult = await ctx.permissionSystem.checkPermission({
        toolName: tu.name,
        input: tu.input,
      });

      if (permissionResult.decision === PermissionDecision.Deny) {
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: [{ type: "text", text: `权限拒绝: ${permissionResult.reason || "未知原因"} [步骤 ${permissionResult.step}]` }],
        };
      }

      if (permissionResult.decision === PermissionDecision.Ask) {
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: [{ type: "text", text: `需要用户确认: ${permissionResult.reason || "未知原因"} [步骤 ${permissionResult.step}]` }],
        };
      }
    }
    
    if (ctx.governancePipeline) {
      const governanceCtx: GovernanceContext = {
        cwd: process.cwd(),
        tool: tu.name,
        input: tu.input,
        isReadOnly: ctx.config.permissionMode === "readonly",
        isDestructive: isDestructiveTool(tu.name, tu.input),
        isNetworkAccess: isNetworkTool(tu.name, tu.input),
        isGitCommand: isGitCommand(tu.input),
        config: {
          maskSensitiveOutputs: true,
          riskThreshold: "medium",
        },
      };

      const governanceResult = await ctx.governancePipeline.execute(
        tu.name,
        tu.input,
        tool.handler,
        governanceCtx
      );

      if (governanceResult.status === "error") {
        const errorMsg = governanceResult.error?.message || "Tool execution denied by governance";
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: [{ type: "text", text: `Governance Error: ${errorMsg}` }],
        };
      }

      output = governanceResult.data;
    } else {
      output = await tool.handler(tu.input);
    }

    const outputText = typeof output === "string" ? output : JSON.stringify(output);
    ctx.onStreamEvent?.({ kind: "tool_result", toolName: tu.name, result: outputText });
    return {
      type: "tool_result",
      tool_use_id: tu.id,
      content: [{ type: "text", text: outputText }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      type: "tool_result",
      tool_use_id: tu.id,
      content: [{ type: "text", text: `Error: ${errorMsg}` }],
    };
  }
}

async function executeTools(
  toolUses: LLMToolCall[],
  state: QueryState,
  ctx: QueryContext,
): Promise<ContentBlock[]> {
  const plan = planToolExecution(toolUses, ctx.toolRegistry);
  return executePlan(plan, ctx, state);
}

function isDestructiveTool(tool: string, input: Record<string, unknown>): boolean {
  if (tool === "bash") {
    const cmd = String(input.command || "");
    return /rm\s+-rf/.test(cmd) || /dd\s+if=/.test(cmd) || /mkfs/.test(cmd);
  }
  return false;
}

function isNetworkTool(tool: string, input: Record<string, unknown>): boolean {
  if (tool === "bash") {
    const cmd = String(input.command || "");
    return /curl\s+|wget\s+|nc\s+|nmap\s+/.test(cmd);
  }
  return false;
}

function isGitCommand(input: Record<string, unknown>): boolean {
  const cmd = String(input.command || "");
  return /git\s+(push|pull|force|reset|rebase)/.test(cmd);
}

function checkBudgets(
  state: QueryState,
  ctx: QueryContext,
): { ok: boolean; reason?: string } {
  const tokens = estimateTokenCount(state.messages);
  if (tokens > ctx.config.tokenBudget) {
    return { ok: false, reason: "token_window_exceeded" };
  }

  const moneyBudget = ctx.config.moneyBudgetUsd;
  if (moneyBudget !== undefined && moneyBudget > 0) {
    const estimatedCost = estimateCost(state.usage, ctx.config.model);
    if (estimatedCost > moneyBudget) {
      return { ok: false, reason: "money_budget_exceeded" };
    }
  }

  return { ok: true };
}

interface RetryState {
  attempt: number;
  errorType: string | null;
}

interface RetryOptions {
  baseMs?: number;
  capMs?: number;
  jitterMs?: number;
}

function calculateBackoff(state: RetryState, opts: RetryOptions): number {
  const base = opts.baseMs ?? 200;
  const cap = opts.capMs ?? 30000;
  const jitter = opts.jitterMs ?? Math.random() * 250;

  const exponentialDelay = base * Math.pow(2, state.attempt);
  return Math.min(cap, exponentialDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleStreamError(
  error: Error,
  ctx: QueryContext,
  state: QueryState,
): Promise<boolean> {
  const message = error.message.toLowerCase();

  if (message.includes("rate limit") || message.includes("429")) {
    const retryAfter = error.message.match(/retry-after[:\s]*(\d+)/i)?.[1];
    if (retryAfter) {
      await sleep(parseInt(retryAfter, 10) * 1000);
    } else {
      await sleep(calculateBackoff({ attempt: state.retryAttempt, errorType: "429" }, { baseMs: 2000 }));
    }
    state.retryAttempt++;
    if (state.retryAttempt > 5) return false;
    return true;
  }

  if (message.includes("500") || message.includes("503")) {
    await sleep(calculateBackoff({ attempt: state.retryAttempt, errorType: "5xx" }, { baseMs: 1000 }));
    state.retryAttempt++;
    if (state.retryAttempt > 5) return false;
    return true;
  }

  if (message.includes("etimedout") || message.includes("econnreset") || message.includes("network") || message.includes("fetch") || message.includes("connection")) {
    await sleep(calculateBackoff({ attempt: state.retryAttempt, errorType: "network" }, { baseMs: 500 }));
    state.retryAttempt++;
    if (state.retryAttempt > 5) return false;
    return true;
  }

  if (message.includes("401") || message.includes("403") || message.includes("authentication") || message.includes("api key") || message.includes("unauthorized")) {
    return false;
  }

  if (message.includes("400") || message.includes("validation") || message.includes("invalid")) {
    return false;
  }

  state.retryAttempt++;
  if (state.retryAttempt > 3) return false;
  await sleep(calculateBackoff({ attempt: state.retryAttempt, errorType: "unknown" }, { baseMs: 500 }));
  return true;
}

function estimateUsage(messages: Message[]): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const tokens = estimateTokenCount(messages);
  return {
    inputTokens: Math.floor(tokens * 0.7),
    outputTokens: Math.floor(tokens * 0.3),
    totalTokens: tokens,
  };
}

function finalizeResult(
  state: QueryState,
  stopReason: string,
  error?: string,
  content?: string,
): QueryResult {
  return {
    threadId: state.threadId,
    turn: state.turn,
    content: content || error || "",
    toolCalls: [],
    usage: state.usage,
    stopReason,
  };
}
