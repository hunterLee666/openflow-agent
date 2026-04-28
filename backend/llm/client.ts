import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import type { ProviderConfig } from "./types.js";
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
import { DEFAULT_RETRY_CONFIG, ProviderConfigSchema } from "./types.js";
import { getCompactionHeaders } from "../compaction/compaction-headers.js";
import { CircuitBreaker, CircuitBreakerError } from "../utils/circuit-breaker.js";
import { TranscriptStore, createErrorEvent, createAssistantMessageEvent } from "../utils/transcript.js";
import { retryWithBackoff, DEFAULT_BACKOFF_CONFIG } from "../utils/retry-with-backoff.js";
import { DegradationLadder } from "../utils/degradation-ladder.js";

export const LLMClientExtendedConfigSchema = z.object({
  providerConfig: ProviderConfigSchema,
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  timeout: z.number().optional(),
  retryConfig: z.object({
    maxRetries: z.number().optional(),
    initialDelayMs: z.number().optional(),
    maxDelayMs: z.number().optional(),
    backoffMultiplier: z.number().optional(),
  }).optional(),
  compactionHeaders: z.record(z.string(), z.string()).optional(),
  apiKey: z.string().optional(),
  enableCircuitBreaker: z.boolean().optional(),
  enableTranscript: z.boolean().optional(),
  enableDegradation: z.boolean().optional(),
  sessionId: z.string().optional(),
});

export type LLMClientExtendedConfig = z.infer<typeof LLMClientExtendedConfigSchema>;

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
  private compactionHeaders: Record<string, string> = {};
  private circuitBreaker: CircuitBreaker;
  private transcriptStore: TranscriptStore | null = null;
  private degradationLadder: DegradationLadder;
  private sessionId: string;

  constructor(config: LLMClientExtendedConfig) {
    this.provider = config.provider || config.providerConfig.name;
    this.config = config.providerConfig;
    this.model = config.model || this.config.defaultModel;
    this.maxTokens = config.maxTokens || 8192;
    this.temperature = config.temperature ?? 0.7;
    this.timeout = config.timeout || 60000;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig };
    this.compactionHeaders = config.compactionHeaders || getCompactionHeaders(this.model);
    this.sessionId = config.sessionId || `session_${Date.now()}`;

    this.circuitBreaker = new CircuitBreaker(`llm_${this.provider}`, {
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 60000,
    });

    if (config.enableTranscript !== false) {
      this.transcriptStore = new TranscriptStore(10000);
    }

    this.degradationLadder = new DegradationLadder({
      autoRecovery: true,
      recoveryCheckIntervalMs: 30000,
      onDegradation: (level) => {
        console.warn(`[Degradation] System degraded to level ${level}`);
      },
      onRecovery: (level) => {
        console.info(`[Degradation] System recovered to level ${level}`);
      },
    });

    const baseUrl = config.baseUrl || this.config.baseUrl;

    if (this.provider.toLowerCase().includes("anthropic")) {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey,
        baseURL: baseUrl,
        timeout: this.timeout,
        defaultHeaders: this.compactionHeaders,
      });
    } else {
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey,
        baseURL: baseUrl,
        timeout: this.timeout,
        defaultHeaders: { ...this.getDefaultHeaders(), ...this.compactionHeaders },
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
    messagesOrOptions: LLMMessage[] | { messages: LLMMessage[]; tools?: LLMToolDefinition[]; callbacks?: StreamCallbacks; maxTokens?: number; temperature?: number },
    toolsOrCallbacks?: LLMToolDefinition[] | StreamCallbacks,
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    let messages: LLMMessage[];
    let tools: LLMToolDefinition[] | undefined;
    let streamCallbacks: StreamCallbacks | undefined;
    let maxTokensOpt: number | undefined;
    let temperatureOpt: number | undefined;

    if (Array.isArray(messagesOrOptions)) {
      messages = messagesOrOptions;
      tools = toolsOrCallbacks as LLMToolDefinition[] | undefined;
      streamCallbacks = callbacks;
    } else {
      messages = messagesOrOptions.messages;
      tools = messagesOrOptions.tools;
      streamCallbacks = messagesOrOptions.callbacks;
      maxTokensOpt = messagesOrOptions.maxTokens;
      temperatureOpt = messagesOrOptions.temperature;
    }

    if (!this.degradationLadder.isFeatureEnabled("tool_execution")) {
      throw new Error("LLM service degraded: tool execution disabled");
    }

    try {
      const result = await this.circuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => {
            if (this.provider === "anthropic") {
              return await this.anthropicComplete(messages, tools, streamCallbacks);
            } else {
              return await this.openaiCompatibleComplete(messages, tools, streamCallbacks);
            }
          },
          {
            maxRetries: this.retryConfig.maxRetries,
            baseDelayMs: this.retryConfig.initialDelayMs,
            maxDelayMs: this.retryConfig.maxDelayMs,
            jitterFactor: 0.5,
            backoffMultiplier: this.retryConfig.backoffMultiplier,
            retryableErrors: ["rate limit", "network", "connection", "timeout"],
            onRetry: (attempt, error, delay) => {
              console.warn(`[LLM Retry] Attempt ${attempt}, delay ${delay}ms, error: ${error.message}`);
            },
          }
        );
      });

      if (!result.success) {
        throw result.error || new Error("Completion failed after retries");
      }

      const completionResult = result.value!;

      if (this.transcriptStore && completionResult.content) {
        this.transcriptStore.append(
          createAssistantMessageEvent(this.sessionId, completionResult.content, {
            model: this.model,
            provider: this.provider,
            tokens: completionResult.usage?.totalTokens,
          })
        );
      }

      return completionResult;
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        this.degradationLadder.degrade("circuit_breaker_open");
      }

      if (this.transcriptStore) {
        this.transcriptStore.append(
          createErrorEvent(this.sessionId, error instanceof Error ? error : new Error(String(error)))
        );
      }

      throw error;
    }
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
      console.log("[DEBUG LLM client] Tools being sent to API:", tools.map(t => t.name));
    } else {
      console.log("[DEBUG LLM client] No tools being sent to API!");
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

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }

  getTranscriptStore(): TranscriptStore | null {
    return this.transcriptStore;
  }

  getDegradationStatus() {
    return this.degradationLadder.getStatus();
  }

  resetDegradation() {
    this.degradationLadder.reset();
  }

  shutdown(): void {
    this.circuitBreaker.shutdown();
    this.degradationLadder.shutdown();
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
  sessionId?: string;
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
    sessionId: config.sessionId,
  });
}
