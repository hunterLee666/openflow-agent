import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ApiProvider, ProviderConfig } from "./providers.js";
import { getProviderConfig, resolveProvider } from "./providers.js";

export interface UnifiedClientConfig {
  apiKey: string;
  provider: ApiProvider;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  timeout?: number;
}

export interface MessageParam {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ToolParam {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; input: Record<string, unknown> }) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface CompletionResult {
  content: string;
  toolCalls?: { id: string; name: string; input: Record<string, unknown> }[];
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export class UnifiedApiClient {
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private config: ProviderConfig;
  private provider: ApiProvider;
  private model: string;
  private maxTokens: number;
  private timeout: number;

  constructor(config: UnifiedClientConfig) {
    this.provider = config.provider;
    this.config = getProviderConfig(config.provider);
    this.model = config.model || this.config.defaultModel;
    this.maxTokens = config.maxTokens || 8192;
    this.timeout = config.timeout || 60000;

    const baseUrl = config.baseUrl || this.config.baseUrl;

    if (this.provider === "anthropic") {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey,
        baseURL: baseUrl,
        timeout: this.timeout,
      });
    } else {
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey,
        baseURL: baseUrl,
        timeout: this.timeout * 1000,
        defaultHeaders: this.getDefaultHeaders(),
      });
    }
  }

  private getDefaultHeaders(): Record<string, string> {
    if (this.provider === "dashscope") {
      return {};
    }
    if (this.provider === "openrouter") {
      return {
        "HTTP-Referer": "https://github.com/hunterLee666/openflow-cli",
        "X-Title": "OpenFlow-CLI",
      };
    }
    return {};
  }

  async complete(
    messages: MessageParam[],
    tools?: ToolParam[],
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    if (this.provider === "anthropic") {
      return this.anthropicComplete(messages, tools, callbacks);
    } else {
      return this.openaiCompatibleComplete(messages, tools, callbacks);
    }
  }

  private async anthropicComplete(
    messages: MessageParam[],
    tools?: ToolParam[],
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    if (!this.anthropicClient) {
      throw new Error("Anthropic client not initialized");
    }

    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const stream = await this.anthropicClient.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
      })),
      stream: true,
    });

    let fullContent = "";
    let toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
    let currentToolUse: Partial<{ id: string; name: string; input: Record<string, unknown> }> | null = null;
    let currentToolInput = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          fullContent += delta.text;
          callbacks?.onText?.(delta.text);
        } else if (delta.type === "input_json_delta") {
          currentToolInput += delta.partial_json;
        }
      } else if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolUse = {
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
          const tc = {
            id: currentToolUse.id!,
            name: currentToolUse.name!,
            input: currentToolUse.input ?? {},
          };
          toolCalls.push(tc);
          callbacks?.onToolCall?.(tc);
          currentToolUse = null;
        }
      }
    }

    callbacks?.onComplete?.();

    return {
      content: fullContent,
      toolCalls,
    };
  }

  private async openaiCompatibleComplete(
    messages: MessageParam[],
    tools?: ToolParam[],
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const requestOptions: Record<string, unknown> = {
      model: this.model,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name,
      })),
      temperature: 0.7,
      max_tokens: this.maxTokens,
    };

    if (systemMessage) {
      requestOptions.messages = [
        { role: "system", content: systemMessage.content },
        ...requestOptions.messages as Array<Record<string, unknown>>,
      ];
    }

    if (tools && tools.length > 0) {
      requestOptions.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    if (this.config.requiresThinkingFlag) {
      requestOptions.extra_body = {
        enable_thinking: false,
      };
    }

    const stream = await (this.openaiClient.chat.completions.create as Function)({
      ...requestOptions,
      stream: true,
    }) as AsyncIterable<{
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    }>;

    let fullContent = "";
    const toolCallBuffers: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        callbacks?.onText?.(delta.content);
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (tc.function?.name) {
            toolCallBuffers.set(idx, {
              id: tc.id || "",
              name: tc.function.name,
              arguments: tc.function.arguments || "",
            });
          } else if (tc.function?.arguments && toolCallBuffers.has(idx)) {
            const existing = toolCallBuffers.get(idx)!;
            existing.arguments += tc.function.arguments;
            if (tc.id) existing.id = tc.id;
          }
        }
      }
    }

    const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
    for (const [, tc] of toolCallBuffers) {
      try {
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments || "{}"),
        });
        callbacks?.onToolCall?.({
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments || "{}"),
        });
      } catch {
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          input: {},
        });
        callbacks?.onToolCall?.({ id: tc.id, name: tc.name, input: {} });
      }
    }

    callbacks?.onComplete?.();

    return {
      content: fullContent,
      toolCalls,
    };
  }

  getProvider(): ApiProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

export function createUnifiedClient(config: {
  apiKey: string;
  provider?: ApiProvider;
  baseUrl?: string;
  model?: string;
}): UnifiedApiClient {
  const resolvedProvider = resolveProvider(config.apiKey, config.provider);
  return new UnifiedApiClient({
    apiKey: config.apiKey,
    provider: resolvedProvider,
    baseUrl: config.baseUrl,
    model: config.model,
  });
}
