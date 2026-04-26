import { z } from "zod";

export const LLMMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

export type LLMMessage = z.infer<typeof LLMMessageSchema>;

export const LLMToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()),
});

export type LLMToolDefinition = z.infer<typeof LLMToolDefinitionSchema>;

export const LLMToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

export type LLMToolCall = z.infer<typeof LLMToolCallSchema>;

export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  cachedTokens: z.number().optional(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const CompletionResultSchema = z.object({
  content: z.string(),
  toolCalls: z.array(LLMToolCallSchema).optional(),
  usage: TokenUsageSchema.optional(),
  model: z.string().optional(),
  stopReason: z.string().optional(),
});

export type CompletionResult = z.infer<typeof CompletionResultSchema>;

export const StreamCallbacksSchema = z.object({
  onToken: z.function().args(z.string()).returns(z.void()).optional(),
  onText: z.function().args(z.string()).returns(z.void()).optional(),
  onToolCall: z.function().args(LLMToolCallSchema).returns(z.void()).optional(),
  onChunk: z.function().args(z.unknown()).returns(z.void()).optional(),
  onComplete: z.function().args(TokenUsageSchema.optional()).returns(z.void()).optional(),
  onError: z.function().args(z.instanceof(Error)).returns(z.void()).optional(),
});

export type StreamCallbacks = z.infer<typeof StreamCallbacksSchema>;

export const ErrorCategorySchema = z.enum([
  "api_error",
  "network_error",
  "auth_error",
  "rate_limit_error",
  "validation_error",
  "unknown_error",
]);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const LLMErrorSchema = z.object({
  category: ErrorCategorySchema,
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  statusCode: z.number().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type LLMError = z.infer<typeof LLMErrorSchema>;

export const RetryConfigSchema = z.object({
  maxRetries: z.number(),
  initialDelayMs: z.number(),
  maxDelayMs: z.number(),
  backoffMultiplier: z.number(),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export const LLMClientConfigSchema = z.object({
  apiKey: z.string(),
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  timeout: z.number().optional(),
  retryConfig: RetryConfigSchema.partial().optional(),
  compactionHeaders: z.record(z.string(), z.string()).optional(),
});

export type LLMClientConfig = z.infer<typeof LLMClientConfigSchema>;

export const CompactionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  headers: z.record(z.string(), z.string()),
  supportedModels: z.array(z.string()),
  enabled: z.boolean(),
});

export type CompactionProfile = z.infer<typeof CompactionProfileSchema>;

export const COMPACTION_PROFILES: Record<string, CompactionProfile> = {
  "anthropic-compress": {
    id: "anthropic-compress",
    name: "Anthropic Compression",
    description: "Anthropic 官方压缩头",
    headers: {
      "anthropic-beta": "prompt-caching-2024-07-31",
      "x-compression": "anthropic-compress",
    },
    supportedModels: [],
    enabled: true,
  },
  "openai-compress": {
    id: "openai-compress",
    name: "OpenAI Compression",
    description: "OpenAI 上下文压缩支持",
    headers: {
      "x-openai-compress": "true",
    },
    supportedModels: [],
    enabled: false,
  },
};

export const ProviderConfigSchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  defaultModel: z.string(),
  supportedModels: z.array(z.string()),
  supportsStreaming: z.boolean(),
  requiresThinkingFlag: z.boolean(),
  costPer1kInput: z.number().optional(),
  costPer1kOutput: z.number().optional(),
  maxTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  priority: z.number().optional(),
  weight: z.number().optional(),
  maxRetries: z.number().optional(),
  timeout: z.number().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const TaskComplexitySchema = z.object({
  type: z.enum(["simple", "medium", "complex", "expert"]),
  estimatedTokens: z.number(),
  requiresReasoning: z.boolean(),
  requiresCreativity: z.boolean(),
  requiresCodeGeneration: z.boolean(),
});

export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

export const ModelRouteCandidateSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reason: z.string(),
  estimatedCost: z.number(),
  estimatedLatencyMs: z.number(),
  score: z.number(),
});

export type ModelRouteCandidate = z.infer<typeof ModelRouteCandidateSchema>;

export const ModelRouteResultSchema = z.object({
  candidates: z.array(ModelRouteCandidateSchema),
  selectedProvider: z.string(),
  selectedModel: z.string(),
  reason: z.string(),
  isFallback: z.boolean(),
  fallbackReason: z.string().optional(),
});

export type ModelRouteResult = z.infer<typeof ModelRouteResultSchema>;

export const ProviderHealthSchema = z.object({
  name: z.string(),
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  lastCheck: z.number(),
  errorCount: z.number(),
  successCount: z.number(),
  latency: z.number(),
  lastError: z.string().optional(),
});

export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const FailoverEventSchema = z.object({
  from: z.string(),
  to: z.string(),
  reason: z.string(),
  timestamp: z.number(),
});

export type FailoverEvent = z.infer<typeof FailoverEventSchema>;
