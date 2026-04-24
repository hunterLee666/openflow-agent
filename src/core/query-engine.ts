import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import type {
  Message,
  ContentBlock,
  QueryInput,
  QueryContext,
  QueryState,
  StreamEvent,
  QueryResult,
  ToolUseBlock,
  ToolResultBlock,
  UsageCounters,
  ContextMetrics,
} from "../types/index.js";
import { DefaultSystemPromptBuilder } from "../prompts/system-prompt.js";
import type { HookPayload } from "../hooks/types.js";
import { createUnifiedClient, type MessageParam, type ToolParam } from "../services/api/unified-client.js";
import { invokeTool, formatToolError } from "../tools/invoke.js";
import { FourteenStepGovernancePipeline, type GovernanceContext, type GovernanceHooks } from "../tools/governance.js";
import { maskCommandOutput, maskSensitiveString } from "../tools/masking.js";
import type { PermissionContext, PermissionDecision } from "../permissions/types.js";

function isDestructiveTool(tool: string, input: Record<string, unknown>): boolean {
  if (tool === "bash") {
    const cmd = String(input.command || "");
    return /rm\s+-rf/.test(cmd) || /dd\s+if=/.test(cmd) || /mkfs/.test(cmd);
  }
  if (tool === "edit" || tool === "write") {
    return false;
  }
  return false;
}

function isGitCommand(input: Record<string, unknown>): boolean {
  const cmd = String(input.command || "");
  return /git\s+(push|pull|force|reset|rebase)/.test(cmd);
}

function isNetworkCommand(input: Record<string, unknown>): boolean {
  const cmd = String(input.command || "");
  return /curl\s+|wget\s+|nc\s+|nmap\s+/.test(cmd);
}

export async function* query(
  input: QueryInput,
  ctx: QueryContext,
): AsyncGenerator<StreamEvent, QueryResult, undefined> {
  const mode = ctx.config.permissionMode;
  const threadId = input.threadId || (await ctx.session.createThread());

  if (ctx.hooks) {
    await ctx.hooks.dispatch("SessionStart", {
      sessionId: threadId,
    });
  }

  const initialState: QueryState = {
    turn: 0,
    messages: await ctx.session.loadMessages(threadId),
    model: input.model || ctx.config.model,
    compactionFailures: 0,
    compactionCircuitOpen: false,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    threadId,
    contextMetrics: { injectionTokens: 0, claudeMdTokens: 0, messagesTokens: 0 },
    retryAttempt: 0,
  };

  if (input.message) {
    initialState.messages.push({
      role: "user",
      content: input.message,
    });
  }

  try {
    const result = yield* queryLoop(initialState, ctx, mode);
    await ctx.session.saveMessages(threadId, initialState.messages);
    return result;
  } finally {
    await ctx.telemetry.flush();
  }
}

async function* queryLoop(
  state: QueryState,
  ctx: QueryContext,
  mode: string,
): AsyncGenerator<StreamEvent, QueryResult, undefined> {
  const provider = ctx.config.provider || "anthropic";
  const anthropicClient = provider === "anthropic" ? new Anthropic({
    apiKey: ctx.config.apiKey,
    baseURL: ctx.config.baseUrl,
  }) : null;
  const unifiedClient = createUnifiedClient({
    apiKey: ctx.config.apiKey,
    provider: provider as any,
    baseUrl: ctx.config.baseUrl,
    model: state.model,
  });

  // Record session start in memory
  ctx.memory?.working.setTask("query_loop");
  ctx.memory?.episodic.record({
    id: `evt_${Date.now()}`,
    sessionId: state.threadId,
    timestamp: Date.now(),
    type: "user_message",
    content: "Session started",
  });

  while (true) {
    if (ctx.abortSignal.aborted) {
      return finalizeResult(state, "cancelled", "user_abort");
    }

    state.turn += 1;

    if (state.turn > ctx.config.maxTurns) {
      return finalizeResult(state, "max_turns_exceeded", `Reached max turns: ${ctx.config.maxTurns}`);
    }

    state.messages = await prepareMessagesWithCompaction(state, ctx);
    if (state.compactionCircuitOpen) {
      return finalizeResult(state, "compaction_circuit_breaker", "Compaction failed too many times");
    }

    const budget = checkBudgets(state, ctx);
    if (!budget.ok) {
      return finalizeResult(state, "budget_exceeded", budget.reason);
    }

    // Dispatch pre-turn hook
    if (ctx.hooks) {
      const decision = await ctx.hooks.dispatch("UserPromptSubmit", {
        sessionId: state.threadId,
        prompt: extractLastUserText(state.messages),
      });
      if (decision.type === "block") {
        return finalizeResult(state, "cancelled", `Blocked by hook: ${decision.reason}`);
      }
    }

    let assistantMsg: Message | undefined;
    try {
      if (provider === "anthropic" && anthropicClient) {
        const stream = await anthropicClient.messages.create({
          model: state.model,
          max_tokens: ctx.config.maxTokens,
          messages: state.messages.filter((m) => m.role !== "system") as Anthropic.Messages.MessageParam[],
          system: extractSystemPrompt(state.messages),
          tools: ctx.toolRegistry.list().map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
          })),
          stream: true,
        });

        for await (const event of collectAssistantMessage(stream)) {
          if ("content" in event && "role" in event) {
            assistantMsg = event as Message;
          } else {
            yield event;
          }
        }
      } else {
        assistantMsg = await collectUnifiedMessage(state, ctx, unifiedClient);
      }
    } catch (e) {
      const retryState = { attempt: state.retryAttempt, errorType: null };
      const recovered = await handleStreamError(e as Error, ctx, retryState);
      if (!recovered) {
        return finalizeResult(state, "fatal_error", (e as Error).message);
      }
      state.retryAttempt = retryState.attempt;
      continue;
    }

    if (!assistantMsg) {
      continue;
    }

    state.retryAttempt = 0;

    state.messages.push(assistantMsg);

    const toolUses = extractToolUses(assistantMsg);

    const usage = estimateUsage(state.messages);
    state.usage = usage;

    if (toolUses.length === 0) {
      const finalText = extractVisibleText(assistantMsg);
      // Record completion in memory
      ctx.memory?.episodic.record({
        id: `evt_${Date.now()}`,
        sessionId: state.threadId,
        timestamp: Date.now(),
        type: "completion",
        content: finalText,
      });
      return finalizeResult(state, "completed", undefined, finalText);
    }

    yield { kind: "completion", text: `Executing ${toolUses.length} tool(s)...` };

    const toolResults = await executeTools(toolUses, state, ctx, mode);
    state.messages.push(...toolResults.map((r) => ({ role: "tool" as const, content: [r] })));

    const tier1 = tier1MicroCompaction(state.messages);
    if (tier1.elidedCount > 0) {
      state.messages = tier1.compacted;
      ctx.telemetry.log("tier1_compaction", { elidedCount: tier1.elidedCount });
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
): Promise<Message[]> {
  let messages = [...state.messages];

  const totalTokens = estimateTokens(messages);
  const threshold = ctx.config.compactionThreshold;

  if (totalTokens > threshold * 0.87) {
    try {
      messages = await runCompaction(messages, ctx);
      state.compactionFailures = 0;
    } catch (e) {
      state.compactionFailures += 1;
      if (state.compactionFailures >= ctx.config.maxCompactionFailures) {
        state.compactionCircuitOpen = true;
        throw new Error("Compaction circuit breaker open");
      }
      messages = fallbackTrim(messages);
    }
  }

  return await injectSystemIfNeeded(messages, ctx);
}

async function injectSystemIfNeeded(messages: Message[], ctx: QueryContext): Promise<Message[]> {
  const system = await buildSystemPrompt(ctx);
  if (messages[0]?.role === "system") {
    return [{ role: "system", content: system }, ...messages.slice(1)];
  }
  return [{ role: "system", content: system }, ...messages];
}

async function buildSystemPrompt(ctx: QueryContext): Promise<string> {
  const builder = new DefaultSystemPromptBuilder();
  const prompt = await builder.build({
    config: ctx.config,
    tools: ctx.toolRegistry.list(),
    memory: ctx.memory!,
    cwd: process.cwd(),
    turn: 0,
    sessionId: undefined,
  }, ctx.promptCache);
  return prompt;
}

function extractSystemPrompt(messages: Message[]): string | undefined {
  const first = messages[0];
  if (first?.role === "system") {
    return typeof first.content === "string" ? first.content : undefined;
  }
  return undefined;
}

async function runCompaction(messages: Message[], ctx: QueryContext): Promise<Message[]> {
  const client = new Anthropic({
    apiKey: ctx.config.apiKey,
    baseURL: ctx.config.baseUrl,
  });

  const summaryPrompt: Message = {
    role: "user",
    content: "Please summarize the preceding conversation concisely, preserving key decisions and context.",
  };

  const response = await client.messages.create({
    model: ctx.config.model,
    max_tokens: 1024,
    messages: [
      ...messages.filter((m) => m.role !== "system").slice(-20),
      summaryPrompt,
    ] as Anthropic.Messages.MessageParam[],
  });

  const summary = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  const systemMsg = messages.find((m) => m.role === "system");
  const newMessages: Message[] = systemMsg ? [systemMsg] : [];
  newMessages.push({
    role: "assistant",
    content: `Previous conversation summary: ${summary}`,
  });

  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  if (lastUserMsg) newMessages.push(lastUserMsg);

  return newMessages;
}

interface Tier3Summary {
  intent: string;
  concepts: string[];
  files: { path: string; note: string }[];
  errors: { title: string; repro: string }[];
  messageHighlights: string[];
  tasks: { id: string; done: boolean; text: string }[];
  currentFocus: string;
  environment: string;
  strippedCoT: { keptConclusions: string[] };
}

function buildTier3SummaryPrompt(messages: Message[]): string {
  const conversationText = messages
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n---\n");

  return `Analyze this conversation and produce a structured Tier3 summary with exactly these 9 sections:

## 1. INTENT
What is the user's ultimate deliverable?

## 2. CONCEPTS
What terms/constraints must be unified? (list as bullet points)

## 3. FILES
Which paths are the "main battlefield"? (format: path: note)

## 4. ERRORS
What failures is the user currently stuck on? Include reproduction steps. (format: title: repro)

## 5. MESSAGES
What user quotes cannot be rewritten? (preserve exact wording)

## 6. TASKS
TODO list with completion criteria. (format: [ ] or [x])

## 7. CURRENT FOCUS
What is the next minimal action?

## 8. ENVIRONMENT
Version, branch, running commands? (format: key: value)

## 9. STRIPPED CoT
What conclusions were kept after chain-of-thought removal? (bullet points)

Conversation to analyze:
${conversationText}

Output ONLY valid JSON matching this schema:
{
  "intent": "string",
  "concepts": ["string"],
  "files": [{"path": "string", "note": "string"}],
  "errors": [{"title": "string", "repro": "string"}],
  "messageHighlights": ["string"],
  "tasks": [{"id": "string", "done": false, "text": "string"}],
  "currentFocus": "string",
  "environment": "string",
  "strippedCoT": {"keptConclusions": ["string"]}
}`;
}

function formatTier3Summary(summary: Tier3Summary): string {
  const lines: string[] = ["## Tier3 Context Summary"];

  lines.push("\n### 1. INTENT");
  lines.push(summary.intent);

  lines.push("\n### 2. CONCEPTS");
  for (const concept of summary.concepts) {
    lines.push(`- ${concept}`);
  }

  lines.push("\n### 3. FILES");
  for (const file of summary.files) {
    lines.push(`- ${file.path}: ${file.note}`);
  }

  lines.push("\n### 4. ERRORS");
  for (const error of summary.errors) {
    lines.push(`- ${error.title}: ${error.repro}`);
  }

  lines.push("\n### 5. MESSAGES");
  for (const msg of summary.messageHighlights) {
    lines.push(`- "${msg}"`);
  }

  lines.push("\n### 6. TASKS");
  for (const task of summary.tasks) {
    const check = task.done ? "[x]" : "[ ]";
    lines.push(`- ${check} ${task.text}`);
  }

  lines.push("\n### 7. CURRENT FOCUS");
  lines.push(summary.currentFocus);

  lines.push("\n### 8. ENVIRONMENT");
  lines.push(summary.environment);

  lines.push("\n### 9. STRIPPED CoT");
  for (const conclusion of summary.strippedCoT.keptConclusions) {
    lines.push(`- ${conclusion}`);
  }

  return lines.join("\n");
}

async function runTier3Compaction(messages: Message[], ctx: QueryContext): Promise<Message[]> {
  const client = new Anthropic({
    apiKey: ctx.config.apiKey,
    baseURL: ctx.config.baseUrl,
  });

  const tier3Prompt = buildTier3SummaryPrompt(messages);

  try {
    const response = await client.messages.create({
      model: ctx.config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: tier3Prompt }],
    });

    const responseText = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const summary = JSON.parse(jsonMatch[0]) as Tier3Summary;
      const formatted = formatTier3Summary(summary);

      const systemMsg = messages.find((m) => m.role === "system");
      const newMessages: Message[] = systemMsg ? [systemMsg] : [];
      newMessages.push({
        role: "assistant",
        content: `## Tier3 Summary\n\n${formatted}`,
      });

      return newMessages;
    }
  } catch (e) {
    console.error("Tier3 compaction failed:", e);
  }

  return runCompaction(messages, ctx);
}

function fallbackTrim(messages: Message[]): Message[] {
  const systemMsg = messages.find((m) => m.role === "system");
  const recent = messages.filter((m) => m.role !== "system").slice(-10);
  return systemMsg ? [systemMsg, ...recent] : recent;
}

function tier1MicroCompaction(messages: Message[]): { compacted: Message[]; elidedCount: number } {
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

function checkBudgets(
  state: QueryState,
  ctx: QueryContext,
): { ok: boolean; reason?: string } {
  const tokens = estimateTokens(state.messages);
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

  if (state.turn > ctx.config.maxTurns) {
    return { ok: false, reason: "max_turns_exceeded" };
  }

  return { ok: true };
}

function estimateCost(usage: UsageCounters, model: string): number {
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
    "qwen3-4b": 0.05,
    "qwen3-8b": 0.07,
    "qwen3-14b": 0.12,
    "qwq-32b": 0.2,
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
    "qwen3-4b": 0.2,
    "qwen3-8b": 0.28,
    "qwen3-14b": 0.48,
    "qwq-32b": 0.8,
    "deepseek-chat": 0.28,
    "deepseek-coder": 0.28,
    "zhipu-glm-4": 0.4,
    "minimax": 0.4,
    "moonshot-v1-8k": 0.24,
  };

  return costs[model.toLowerCase()] || 2;
}

async function* collectAssistantMessage(
  stream: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>,
): AsyncGenerator<StreamEvent, Message, undefined> {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolUses: ToolUseBlock[] = [];
  let currentToolUse: Partial<ToolUseBlock> | null = null;
  let currentToolInput = "";

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "text_delta") {
        textParts.push(delta.text);
        yield { kind: "assistant_text_delta", text: delta.text };
      } else if (delta.type === "input_json_delta") {
        currentToolInput += delta.partial_json;
        yield { kind: "tool_input_delta", partialJson: delta.partial_json };
      } else if (delta.type === "thinking_delta") {
        thinkingParts.push(delta.thinking);
        yield { kind: "thinking_delta", thinking: delta.thinking };
      }
    } else if (event.type === "content_block_start") {
      if (event.content_block.type === "tool_use") {
        currentToolUse = {
          type: "tool_use",
          id: event.content_block.id,
          name: event.content_block.name,
          input: {},
        };
        currentToolInput = "";
      }
    } else if (event.type === "content_block_stop") {
      if (currentToolUse) {
        try {
          currentToolUse.input = JSON.parse(currentToolInput || "{}");
        } catch {
          currentToolUse.input = {
            _parse_error: true,
            raw: currentToolInput,
          };
        }
        toolUses.push(currentToolUse as ToolUseBlock);
        currentToolUse = null;
      }
    }
  }

  const content: ContentBlock[] = [];
  if (thinkingParts.length > 0) {
    content.push({ type: "thinking", thinking: thinkingParts.join("") });
  }
  if (textParts.length > 0) {
    content.push({ type: "text", text: textParts.join("") });
  }
  for (const tu of toolUses) {
    content.push(tu);
  }

  return { role: "assistant", content };
}

async function collectUnifiedMessage(
  state: QueryState,
  ctx: QueryContext,
  client: ReturnType<typeof createUnifiedClient>,
): Promise<Message> {
  const messages: MessageParam[] = state.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role as "user" | "assistant", content: m.content };
      }
      const text = m.content.find((c) => c.type === "text")?.text || "";
      return { role: m.role as "user" | "assistant", content: text };
    });

  const systemPrompt = extractSystemPrompt(state.messages);
  const tools: ToolParam[] = ctx.toolRegistry.list().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as Record<string, unknown>,
  }));

  let fullContent = "";
  let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

  await client.complete(
    messages,
    tools,
    {
      onText: (text: string) => {
        fullContent += text;
      },
      onToolCall: (toolCall: { id: string; name: string; input: Record<string, unknown> }) => {
        toolCalls.push(toolCall);
      },
    },
  );

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

function extractToolUses(msg: Message): ToolUseBlock[] {
  if (typeof msg.content === "string") return [];
  return msg.content.filter((c): c is ToolUseBlock => c.type === "tool_use");
}

function extractVisibleText(msg: Message): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("");
}

async function executeTools(
  uses: ToolUseBlock[],
  state: QueryState,
  ctx: QueryContext,
  mode: string,
): Promise<ToolResultBlock[]> {
  const results: ToolResultBlock[] = [];

  const groups = planToolExecution(uses, ctx);

  for (const group of groups) {
    if (group.mode === "parallel") {
      const chunk = await Promise.all(
        group.items.map((u) => runSingleTool(u, state, ctx, mode)),
      );
      results.push(...chunk);
    } else {
      for (const u of group.items) {
        results.push(await runSingleTool(u, state, ctx, mode));
      }
    }
  }

  return results;
}

function planToolExecution(
  uses: ToolUseBlock[],
  ctx: QueryContext,
): Array<{ mode: "parallel" | "serial"; items: ToolUseBlock[] }> {
  const groups: Array<{ mode: "parallel" | "serial"; items: ToolUseBlock[] }> = [];
  let buffer: ToolUseBlock[] = [];
  const lastWritePaths: Set<string> = new Set();

  const flushParallel = () => {
    if (buffer.length) {
      groups.push({ mode: "parallel", items: buffer });
      buffer = [];
    }
  };

  const isPathOverlap = (path1: string, path2: string): boolean => {
    const normalized1 = path.resolve(path1);
    const normalized2 = path.resolve(path2);
    return normalized1 === normalized2 || normalized2.startsWith(normalized1 + path.sep);
  };

  const getToolPaths = (u: ToolUseBlock): string[] => {
    const input = u.input as Record<string, unknown>;
    if (u.name === "read" || u.name === "read_file") {
      return [input.path as string].filter(Boolean);
    }
    if (u.name === "write" || u.name === "write_file" || u.name === "edit") {
      return [input.path as string].filter(Boolean);
    }
    if (u.name === "bash") {
      const cmd = input.command as string;
      const matches = cmd.match(/(?:^|\s)(?:cat|head|tail|grep|awk|sed|sort|uniq|wc)\s+([^\s;|&]+)/g);
      if (matches) {
        return matches.map(m => m.trim().split(/\s+/)[1]).filter(Boolean);
      }
    }
    return [];
  };

  const isReadOnlyTool = (name: string): boolean => {
    const def = ctx.toolRegistry.get(name);
    return def?.isReadOnly ?? false;
  };

  for (const u of uses) {
    const def = ctx.toolRegistry.get(u.name);
    const safe = def?.isConcurrencySafe ?? false;
    const toolPaths = getToolPaths(u);

    let hasPathConflict = false;
    if (toolPaths.length > 0 && !isReadOnlyTool(u.name)) {
      for (const tp of toolPaths) {
        for (const writePath of lastWritePaths) {
          if (isPathOverlap(tp, writePath)) {
            hasPathConflict = true;
            break;
          }
        }
        if (hasPathConflict) break;
      }
    }

    if (safe && !hasPathConflict) {
      buffer.push(u);
    } else {
      flushParallel();
      groups.push({ mode: "serial", items: [u] });
    }

    if (!isReadOnlyTool(u.name)) {
      for (const tp of toolPaths) {
        lastWritePaths.add(path.resolve(tp));
      }
    }
  }

  flushParallel();
  return groups;
}

async function runSingleTool(
  use: ToolUseBlock,
  state: QueryState,
  ctx: QueryContext,
  mode: string,
): Promise<ToolResultBlock> {
  const def = ctx.toolRegistry.get(use.name);
  if (!def) {
    return {
      type: "tool_result",
      tool_use_id: use.id,
      content: `Tool "${use.name}" not found`,
      is_error: true,
    };
  }

  if (mode === "readonly" && !def.isReadOnly) {
    return {
      type: "tool_result",
      tool_use_id: use.id,
      content: `Tool "${use.name}" is not allowed in readonly mode`,
      is_error: true,
    };
  }

  const govContext: GovernanceContext = {
    cwd: process.cwd(),
    tool: use.name,
    input: use.input,
    isReadOnly: def.isReadOnly,
    isDestructive: isDestructiveTool(use.name, use.input),
    isNetworkAccess: isNetworkCommand(use.input),
    isGitCommand: isGitCommand(use.input),
    workspaceValidator: ctx.workspaceValidator,
    config: {
      maskSensitiveOutputs: ctx.config.maskSensitiveOutputs,
    },
  };

  const governanceHooks: GovernanceHooks = {
    preToolUse: async (gCtx) => {
      if (!ctx.hooks) return { action: "allow" };

      const hookDecision = await ctx.hooks.dispatch("PreToolUse", {
        sessionId: state.threadId,
        tool: gCtx.tool,
        input: gCtx.input,
      });

      if (hookDecision.type === "block") {
        return { action: "deny", reason: hookDecision.reason };
      }
      if (hookDecision.type === "modify") {
        return {
          action: "modify",
          input: hookDecision.args ? { ...gCtx.input, ...hookDecision.args } : gCtx.input,
        };
      }
      return { action: "allow" };
    },
    postToolUse: async (gCtx, output) => {
      if (!ctx.hooks) return { action: "allow" };

      await ctx.hooks.dispatch("PostToolUse", {
        sessionId: state.threadId,
        tool: gCtx.tool,
        input: gCtx.input,
        output,
      });

      return { action: "allow" };
    },
    onTelemetry: (data) => {
      ctx.telemetry.log("governance", data);
    },
  };

  const governance = new FourteenStepGovernancePipeline(governanceHooks, "medium");

  try {
    const govResult = await governance.execute(
      def,
      use.input,
      {
        cwd: process.cwd(),
        signal: ctx.abortSignal,
        config: ctx.config,
      },
      govContext
    );

    if (govResult.status !== "ok") {
      return {
        type: "tool_result",
        tool_use_id: use.id,
        content: `Governance error: ${govResult.error?.message || "Unknown error"}`,
        is_error: true,
      };
    }

    const result = govResult.data;

    ctx.memory?.working.addToolResult(use.name, typeof result === "string" ? result : JSON.stringify(result));
    ctx.memory?.episodic.record({
      id: `evt_${Date.now()}`,
      sessionId: state.threadId,
      timestamp: Date.now(),
      type: "tool_use",
      content: `${use.name}: ${JSON.stringify(use.input)}`,
    });

    let outputContent: string;
    if (typeof result === "string") {
      outputContent = ctx.config.maskSensitiveOutputs ? maskSensitiveString(result) : result;
    } else {
      const masked = ctx.config.maskSensitiveOutputs ? maskCommandOutput(result) : result;
      outputContent = JSON.stringify(masked);
    }

    if (govResult.telemetry) {
      ctx.telemetry.log("tool_call", {
        tool: use.name,
        traceId: govResult.telemetry.traceId,
        spanId: govResult.telemetry.spanId,
        durationMs: govResult.telemetry.durationMs,
        riskScore: govResult.telemetry.riskScore,
      });
    }

    return {
      type: "tool_result",
      tool_use_id: use.id,
      content: outputContent,
    };
  } catch (e) {
    ctx.memory?.episodic.record({
      id: `evt_${Date.now()}`,
      sessionId: state.threadId,
      timestamp: Date.now(),
      type: "error",
      content: `Tool ${use.name} failed: ${(e as Error).message}`,
    });
    return {
      type: "tool_result",
      tool_use_id: use.id,
      content: (e as Error).message,
      is_error: true,
    };
  }
}

interface RetryOptions {
  maxAttempts?: number;
  baseMs?: number;
  capMs?: number;
  jitterMs?: number;
}

interface RetryState {
  attempt: number;
  errorType: string | null;
}

function calculateBackoff(state: RetryState, opts: RetryOptions): number {
  const base = opts.baseMs ?? 200;
  const cap = opts.capMs ?? 30000;
  const jitter = opts.jitterMs ?? Math.random() * 250;

  const exponentialDelay = base * Math.pow(2, state.attempt);
  return Math.min(cap, exponentialDelay + jitter);
}

async function handleStreamError(
  error: Error,
  ctx: QueryContext,
  state: RetryState
): Promise<boolean> {
  ctx.telemetry.log("stream_error", {
    error: error.message,
    attempt: state.attempt,
  });

  if (error.message?.includes("429")) {
    const retryAfter = error.message.match(/retry-after[:\s]*(\d+)/i)?.[1];
    if (retryAfter) {
      await sleep(parseInt(retryAfter, 10) * 1000);
    } else {
      await sleep(calculateBackoff(state, { baseMs: 2000 }));
    }
    state.attempt++;
    return true;
  }

  if (error.message?.includes("500") || error.message?.includes("503")) {
    await sleep(calculateBackoff(state, { baseMs: 1000 }));
    state.attempt++;
    return true;
  }

  if (error.message?.includes("ETIMEDOUT") || error.message?.includes("ECONNRESET")) {
    await sleep(calculateBackoff(state, { baseMs: 500 }));
    state.attempt++;
    return true;
  }

  if (error.message?.includes("401") || error.message?.includes("403")) {
    ctx.telemetry.log("auth_error", { error: error.message });
    return false;
  }

  if (error.message?.includes("400")) {
    ctx.telemetry.log("bad_request_error", { error: error.message });
    return false;
  }

  return false;
}

function finalizeResult(
  state: QueryState,
  status: QueryResult["status"],
  reason?: string,
  finalText?: string,
): QueryResult {
  return {
    status,
    reason,
    finalText,
    usage: state.usage,
  };
}

function estimateTokens(messages: Message[]): number {
  let count = 0;
  for (const msg of messages) {
    const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    count += Math.ceil(text.length / 4);
  }
  return count;
}

function estimateUsage(messages: Message[]): UsageCounters {
  const total = estimateTokens(messages);
  return {
    inputTokens: Math.floor(total * 0.7),
    outputTokens: Math.floor(total * 0.3),
    totalTokens: total,
  };
}

function estimateContextBreakdown(systemPrompt: string, messages: Message[]): ContextMetrics {
  const claudeMdPattern = /<!-- claude_md -->|---\n# .+?\n---/gs;
  const injectionPattern = /<!-- memory_injections -->([\s\S]*?)<!-- \/memory_injections -->/;

  const claudeMdTokens = (systemPrompt.match(claudeMdPattern) || []).reduce(
    (sum, match) => sum + estimateTokens([{ role: "user", content: match }]),
    0
  );

  const injectionMatch = systemPrompt.match(injectionPattern);
  const injectionTokens = injectionMatch
    ? estimateTokens([{ role: "user", content: injectionMatch[1] }])
    : 0;

  const messagesTokens = estimateTokens(messages);

  return {
    injectionTokens,
    claudeMdTokens,
    messagesTokens,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
