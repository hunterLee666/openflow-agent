import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ProviderConfig } from "./model-router.js";
import type {
  LLMMessage,
  LLMToolDefinition,
  LLMToolCall,
  TokenUsage,
  CompletionResult,
  StreamCallbacks,
  RetryConfig,
  LLMClientConfig,
  LLMError,
} from "./types.js";
import { DEFAULT_RETRY_CONFIG } from "./types.js";

export class LLMClient {
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private config: ProviderConfig;
  private provider: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private timeout: number;
  private retryConfig: RetryConfig;

  constructor(config: LLMClientConfig & { providerConfig: ProviderConfig }) {
    this.provider = config.provider || config.providerConfig.name;
    this.config = config.providerConfig;
    this.model = config.model || this.config.defaultModel;
    this.maxTokens = config.maxTokens || 8192;
    this.temperature = config.temperature ?? 0.7;
    this.timeout = config.timeout || 60000;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig };

    const baseUrl = config.baseUrl || this.config.baseUrl;

    if (this.provider.toLowerCase().includes("anthropic")) {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey,
        baseURL: baseUrl,
        timeout: this.timeout,
      });
    } else {
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey,
        baseURL: baseUrl,
        timeout: this.timeout,
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
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(
            this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelayMs
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        if (this.provider === "anthropic") {
          return await this.anthropicComplete(messages, tools, callbacks);
        } else {
          return await this.openaiCompatibleComplete(messages, tools, callbacks);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const llmError = this.classifyError(lastError);
        if (!llmError.retryable || attempt === this.retryConfig.maxRetries) {
          callbacks?.onError?.(lastError);
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Unknown error during completion");
  }

  private async anthropicComplete(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
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
    const toolCalls: LLMToolCall[] = [];
    let currentToolUse: Partial<LLMToolCall> | null = null;
    let currentToolInput = "";
    let usage: TokenUsage | undefined;

    for await (const event of stream) {
      callbacks?.onChunk?.(event);

      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta?.type === "text_delta") {
          fullContent += delta.text;
          callbacks?.onToken?.(delta.text);
          callbacks?.onText?.(delta.text);
        } else if (delta?.type === "input_json_delta") {
          currentToolInput += delta.partial_json;
        }
      } else if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use") {
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
          const tc: LLMToolCall = {
            id: currentToolUse.id!,
            name: currentToolUse.name!,
            input: currentToolUse.input ?? {},
          };
          toolCalls.push(tc);
          callbacks?.onToolCall?.(tc);
          currentToolUse = null;
        }
      } else if (event.type === "message_delta") {
        if (event.usage) {
          const usageData = event.usage as unknown as {
            input_tokens?: number;
            output_tokens: number;
          };
          const inputTokens = usageData.input_tokens ?? 0;
          usage = {
            inputTokens,
            outputTokens: usageData.output_tokens,
            totalTokens: inputTokens + usageData.output_tokens,
          };
        }
      }
    }

    callbacks?.onComplete?.(usage);

    return {
      content: fullContent,
      toolCalls,
      usage,
      model: this.model,
      stopReason: "end_turn",
    };
  }

  private async openaiCompatibleComplete(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const requestOptions: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name,
        tool_call_id: m.tool_call_id,
      })),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

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
      (requestOptions as Record<string, unknown>).extra_body = {
        enable_thinking: false,
      };
    }

    const stream = (await this.openaiClient.chat.completions.create({
      ...requestOptions,
      stream: true,
    } as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming)) as AsyncIterable<{
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }>;

    let fullContent = "";
    const toolCallBuffers: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let usage: TokenUsage | undefined;
    let stopReason: string | undefined;

    for await (const chunk of stream) {
      callbacks?.onChunk?.(chunk);

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        callbacks?.onToken?.(delta.content);
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

      if (choice?.finish_reason) {
        stopReason = choice.finish_reason;
      }

      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }
    }

    const toolCalls: LLMToolCall[] = [];
    for (const [, tc] of toolCallBuffers) {
      try {
        const parsedInput = JSON.parse(tc.arguments || "{}");
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          input: parsedInput,
        });
        callbacks?.onToolCall?.({
          id: tc.id,
          name: tc.name,
          input: parsedInput,
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

    callbacks?.onComplete?.(usage);

    return {
      content: fullContent,
      toolCalls,
      usage,
      model: this.model,
      stopReason,
    };
  }

  private classifyError(error: Error): LLMError {
    const message = error.message.toLowerCase();

    if (message.includes("authentication") || message.includes("api key") || message.includes("unauthorized")) {
      return {
        category: "auth_error",
        code: "AUTH_FAILED",
        message: error.message,
        retryable: false,
      };
    }

    if (message.includes("rate limit") || message.includes("too many requests") || message.includes("429")) {
      return {
        category: "rate_limit_error",
        code: "RATE_LIMITED",
        message: error.message,
        retryable: true,
      };
    }

    if (message.includes("network") || message.includes("fetch") || message.includes("connection")) {
      return {
        category: "network_error",
        code: "NETWORK_ERROR",
        message: error.message,
        retryable: true,
      };
    }

    if (message.includes("validation") || message.includes("invalid")) {
      return {
        category: "validation_error",
        code: "VALIDATION_ERROR",
        message: error.message,
        retryable: false,
      };
    }

    return {
      category: "api_error",
      code: "API_ERROR",
      message: error.message,
      retryable: true,
    };
  }

  getProvider(): string {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }

  updateModel(model: string): void {
    this.model = model;
  }
}

export function createLLMClient(config: {
  apiKey: string;
  providerConfig: ProviderConfig;
  provider?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}): LLMClient {
  return new LLMClient({
    apiKey: config.apiKey,
    providerConfig: config.providerConfig,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    timeout: config.timeout,
  });
}
