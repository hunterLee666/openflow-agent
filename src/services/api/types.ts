export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  system?: string;
  tools?: AnthropicTool[];
  stream?: boolean;
  temperature?: number;
  thinking?: {
    type: 'enabled';
    budget_tokens?: number;
  };
}

export interface AnthropicStreamEvent {
  type: 'message_start' | 'message_delta' | 'content_block_start' | 'content_block_delta' | 'message_stop';
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    text?: string;
    type?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export type ErrorCategory = 'api_error' | 'network_error' | 'auth_error' | 'rate_limit_error' | 'validation_error' | 'unknown_error';

export interface ApiErrorInfo {
  category: ErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  details?: Record<string, unknown>;
}

export interface RateLimitInfo {
  requestsRemaining: number;
  resetAt: Date;
  limit: number;
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

export interface ApiClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
  maxTokens?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

export interface StreamHandler {
  onToken?: (token: string) => void;
  onChunk?: (event: AnthropicStreamEvent) => void;
  onComplete?: (usage?: TokenUsage) => void;
  onError?: (error: ApiErrorInfo) => void;
}