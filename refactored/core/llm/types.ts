export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface LLMToolDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

export interface CompletionResult {
  content: string;
  toolCalls?: LLMToolCall[];
  usage?: TokenUsage;
  model?: string;
  stopReason?: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onText?: (text: string) => void;
  onToolCall?: (toolCall: LLMToolCall) => void;
  onChunk?: (chunk: unknown) => void;
  onComplete?: (usage?: TokenUsage) => void;
  onError?: (error: Error) => void;
}

export type ErrorCategory =
  | "api_error"
  | "network_error"
  | "auth_error"
  | "rate_limit_error"
  | "validation_error"
  | "unknown_error";

export interface LLMError {
  category: ErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  details?: Record<string, unknown>;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export interface LLMClientConfig {
  apiKey: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
  compactionHeaders?: Record<string, string>;
}

export interface CompactionProfile {
  id: string;
  name: string;
  description: string;
  headers: Record<string, string>;
  supportedModels: string[];
  enabled: boolean;
}

export const COMPACTION_PROFILES: Record<string, CompactionProfile> = {
  "anthropic-compress": {
    id: "anthropic-compress",
    name: "Anthropic Compression",
    description: "Anthropic 官方压缩头，支持 Opus 4.6 / Sonnet 4.6",
    headers: {
      "anthropic-beta": "prompt-caching-2024-07-31",
      "x-compression": "anthropic-compress",
    },
    supportedModels: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4-5", "claude-sonnet-4-5"],
    enabled: true,
  },
  "openai-compress": {
    id: "openai-compress",
    name: "OpenAI Compression",
    description: "OpenAI 上下文压缩支持",
    headers: {
      "x-openai-compress": "true",
    },
    supportedModels: ["gpt-4o", "gpt-4-turbo"],
    enabled: false,
  },
};

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  supportedModels: string[];
  supportsStreaming: boolean;
  requiresThinkingFlag: boolean;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  maxTokens?: number;
  contextWindow?: number;
  priority?: number;
  weight?: number;
  maxRetries?: number;
  timeout?: number;
}

export interface TaskComplexity {
  type: "simple" | "medium" | "complex" | "expert";
  estimatedTokens: number;
  requiresReasoning: boolean;
  requiresCreativity: boolean;
  requiresCodeGeneration: boolean;
}

export interface ModelRouteCandidate {
  provider: string;
  model: string;
  reason: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
  score: number;
}

export interface ModelRouteResult {
  candidates: ModelRouteCandidate[];
  selectedProvider: string;
  selectedModel: string;
  reason: string;
  isFallback: boolean;
  fallbackReason?: string;
}

export interface ProviderHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: number;
  errorCount: number;
  successCount: number;
  latency: number;
  lastError?: string;
}

export interface FailoverEvent {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}
