import Anthropic from "@anthropic-ai/sdk";
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
} from "../types/index.js";
import { DefaultSystemPromptBuilder } from "../prompts/system-prompt.js";
import type { HookPayload } from "../hooks/types.js";

export async function* query(
  input: QueryInput,
  ctx: QueryContext,
): AsyncGenerator<StreamEvent, QueryResult, undefined> {
  const mode = ctx.config.permissionMode;
  const threadId = input.threadId || (await ctx.session.createThread());

  const initialState: QueryState = {
    turn: 0,
    messages: await ctx.session.loadMessages(threadId),
    model: input.model || ctx.config.model,
    compactionFailures: 0,
    compactionCircuitOpen: false,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    threadId,
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
  const client = new Anthropic({
    apiKey: ctx.config.apiKey,
    baseURL: ctx.config.baseUrl,
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

    let assistantMsg: Message;
    try {
      const stream = await client.messages.create({
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

      assistantMsg = await collectAssistantMessage(stream);
    } catch (e) {
      const recovered = await handleStreamError(e as Error, ctx);
      if (!recovered) {
        return finalizeResult(state, "fatal_error", (e as Error).message);
      }
      continue;
    }

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
  });
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

function fallbackTrim(messages: Message[]): Message[] {
  const systemMsg = messages.find((m) => m.role === "system");
  const recent = messages.filter((m) => m.role !== "system").slice(-10);
  return systemMsg ? [systemMsg, ...recent] : recent;
}

function checkBudgets(
  state: QueryState,
  ctx: QueryContext,
): { ok: boolean; reason?: string } {
  const tokens = estimateTokens(state.messages);
  if (tokens > ctx.config.tokenBudget) {
    return { ok: false, reason: "token_window_exceeded" };
  }
  return { ok: true };
}

async function collectAssistantMessage(
  stream: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>,
): Promise<Message> {
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
      } else if (delta.type === "input_json_delta") {
        currentToolInput += delta.partial_json;
      } else if (delta.type === "thinking_delta") {
        thinkingParts.push(delta.thinking);
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
          currentToolUse.input = {};
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

  const flushParallel = () => {
    if (buffer.length) {
      groups.push({ mode: "parallel", items: buffer });
      buffer = [];
    }
  };

  for (const u of uses) {
    const def = ctx.toolRegistry.get(u.name);
    const safe = def?.isConcurrencySafe ?? false;
    if (safe) {
      buffer.push(u);
    } else {
      flushParallel();
      groups.push({ mode: "serial", items: [u] });
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

  // Dispatch PreToolUse hook
  if (ctx.hooks) {
    const hookDecision = await ctx.hooks.dispatch("PreToolUse", {
      sessionId: state.threadId,
      tool: use.name,
      input: use.input,
    });
    if (hookDecision.type === "block") {
      return {
        type: "tool_result",
        tool_use_id: use.id,
        content: `Blocked by hook: ${hookDecision.reason}`,
        is_error: true,
      };
    }
    if (hookDecision.type === "modify" && hookDecision.args) {
      use = { ...use, input: { ...use.input, ...hookDecision.args } };
    }
  }

  try {
    const result = await def.handler(use.input, {
      cwd: process.cwd(),
      signal: ctx.abortSignal,
      config: ctx.config,
    });

    // Record in working memory
    ctx.memory?.working.addToolResult(use.name, typeof result === "string" ? result : JSON.stringify(result));
    ctx.memory?.episodic.record({
      id: `evt_${Date.now()}`,
      sessionId: state.threadId,
      timestamp: Date.now(),
      type: "tool_use",
      content: `${use.name}: ${JSON.stringify(use.input)}`,
    });

    // Dispatch PostToolUse hook
    if (ctx.hooks) {
      await ctx.hooks.dispatch("PostToolUse", {
        sessionId: state.threadId,
        tool: use.name,
        input: use.input,
        output: result,
      });
    }

    return {
      type: "tool_result",
      tool_use_id: use.id,
      content: typeof result === "string" ? result : JSON.stringify(result),
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

async function handleStreamError(error: Error, ctx: QueryContext): Promise<boolean> {
  ctx.telemetry.log("stream_error", { error: error.message });

  if (error.message?.includes("429")) {
    await sleep(2000);
    return true;
  }
  if (error.message?.includes("500") || error.message?.includes("503")) {
    await sleep(1000);
    return true;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
