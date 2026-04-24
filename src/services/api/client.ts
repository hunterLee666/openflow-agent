import type {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  ApiClientConfig,
  RateLimitInfo,
  RetryConfig,
  StreamHandler,
  TokenUsage,
  OpenAIMessage,
  OpenAIResponse,
  OpenAIStreamChunk,
} from './types';
import { DEFAULT_RETRY_CONFIG, DASHSCOPE_BASE_URL, OPENAI_BASE_URL, ANTHROPIC_BASE_URL } from './types';
import { ApiError, RateLimitError, AuthenticationError, NetworkError, ValidationError, categorizeError } from './errors';

export class AnthropicApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly provider: 'anthropic' | 'openai' | 'dashscope';
  private readonly timeout: number;
  private readonly retryConfig: RetryConfig;
  private readonly maxTokens: number;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(config: ApiClientConfig) {
    this.apiKey = config.apiKey;
    this.provider = config.provider || 'anthropic';
    this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
    this.timeout = config.timeout || 60000;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig };
    this.maxTokens = config.maxTokens || 8192;
  }

  private getDefaultBaseUrl(): string {
    switch (this.provider) {
      case 'dashscope':
        return DASHSCOPE_BASE_URL;
      case 'openai':
        return OPENAI_BASE_URL;
      case 'anthropic':
      default:
        return ANTHROPIC_BASE_URL;
    }
  }

  async createMessage(
    request: Omit<AnthropicRequest, 'max_tokens' | 'stream'>,
    handler?: StreamHandler
  ): Promise<AnthropicResponse> {
    const fullRequest: AnthropicRequest = {
      ...request,
      max_tokens: this.maxTokens,
      stream: handler !== undefined,
    };

    if (handler) {
      return this.streamMessage(fullRequest, handler);
    }

    return this.executeWithRetry(() => this.executeRequest(fullRequest));
  }

  async createOpenAICompatibleMessage(
    messages: OpenAIMessage[],
    model: string,
    options?: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    },
    handler?: StreamHandler
  ): Promise<OpenAIResponse> {
    const requestBody: Record<string, unknown> = {
      model,
      messages: options?.system
        ? [{ role: 'system' as const, content: options.system }, ...messages]
        : messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens || this.maxTokens,
    };

    if (handler) {
      return this.streamOpenAIMessage(requestBody, handler);
    }

    return this.executeOpenAIRequest(requestBody);
  }

  private async executeOpenAIRequest(requestBody: Record<string, unknown>): Promise<OpenAIResponse> {
    if (this.provider === 'dashscope') {
      requestBody.enable_thinking = false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getOpenAIHeaders(),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return this.handleOpenAIResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiError) throw error;
      if (error instanceof Error) {
        if (error.name === 'AbortError') throw new NetworkError('Request timed out');
        throw new NetworkError(error.message);
      }
      throw categorizeError(error);
    }
  }

  private async streamOpenAIMessage(
    requestBody: Record<string, unknown>,
    handler: StreamHandler
  ): Promise<OpenAIResponse> {
    if (this.provider === 'dashscope') {
      requestBody.enable_thinking = false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getOpenAIHeaders(),
        body: JSON.stringify({ ...requestBody, stream: true }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.handleOpenAIResponseError(response);
      }

      if (!response.body) {
        throw new NetworkError('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      const toolCallBuffers: Map<number, { id: string; name: string; arguments: string }> = new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const chunk: OpenAIStreamChunk = JSON.parse(data);
            const delta = chunk.choices[0]?.delta;
            const toolCalls = delta?.tool_calls;

            if (delta?.content) {
              fullContent += delta.content;
              handler.onToken?.(delta.content);
              handler.onText?.(delta.content);
            }

            if (toolCalls && Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                const idx = tc.index ?? 0;
                if (tc.function?.name) {
                  toolCallBuffers.set(idx, {
                    id: tc.id || '',
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                  });
                } else if (tc.function?.arguments && toolCallBuffers.has(idx)) {
                  const existing = toolCallBuffers.get(idx)!;
                  existing.arguments += tc.function.arguments;

                  if (tc.id) {
                    existing.id = tc.id;
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }

      for (const [, tc] of toolCallBuffers) {
        try {
          const input = JSON.parse(tc.arguments || '{}');
          handler.onToolCall?.({ id: tc.id, name: tc.name, input });
        } catch {
          handler.onToolCall?.({ id: tc.id, name: tc.name, input: {} });
        }
      }

      handler.onComplete?.(usage);
      return {
        id: `openai-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: (requestBody.model as string) || 'unknown',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: fullContent },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: usage.inputTokens,
          completion_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiError) {
        handler.onError?.(error);
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const networkError = new NetworkError('Request timed out');
          handler.onError?.(networkError);
          throw networkError;
        }
        const networkError = new NetworkError(error.message);
        handler.onError?.(networkError);
        throw networkError;
      }
      const apiError = categorizeError(error);
      handler.onError?.(apiError);
      throw apiError;
    }
  }

  private getOpenAIHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  private async handleOpenAIResponse(response: Response): Promise<OpenAIResponse> {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const resetAt = new Date(Date.now() + (parseInt(retryAfter || '1000', 10) * 1000));
      const limit = parseInt(response.headers.get('x-ratelimit-limit') || '100', 10);
      const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0', 10);
      this.rateLimitInfo = { limit, requestsRemaining: remaining, resetAt };
      throw new RateLimitError('Rate limit exceeded', this.rateLimitInfo);
    }

    if (response.status === 401) {
      throw new AuthenticationError('Invalid API key or authentication failed');
    }

    if (response.status === 400) {
      const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ValidationError((errorBody.error as { message?: string })?.message || 'Invalid request', errorBody);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ApiError(
        'api_error',
        `HTTP_${response.status}`,
        (errorBody.error as { message?: string })?.message || `API error: ${response.status}`,
        response.status >= 500,
        response.status
      );
    }

    return response.json() as Promise<OpenAIResponse>;
  }

  private async handleOpenAIResponseError(response: Response): Promise<ApiError> {
    try {
      const errorBody = await response.json() as Record<string, unknown>;
      return new ApiError(
        'api_error',
        `HTTP_${response.status}`,
        (errorBody.error as { message?: string })?.message || `API error: ${response.status}`,
        response.status >= 500,
        response.status
      );
    } catch {
      return new ApiError(
        'api_error',
        `HTTP_${response.status}`,
        `API error: ${response.status}`,
        response.status >= 500,
        response.status
      );
    }
  }

  private async executeRequest(request: AnthropicRequest): Promise<AnthropicResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const resetAt = new Date(Date.now() + (parseInt(retryAfter || '1000', 10) * 1000));
        const limit = parseInt(response.headers.get('x-ratelimit-limit') || '100', 10);
        const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0', 10);

        this.rateLimitInfo = { limit, requestsRemaining: remaining, resetAt };
        throw new RateLimitError('Rate limit exceeded', this.rateLimitInfo);
      }

      if (response.status === 401) {
        throw new AuthenticationError('Invalid API key or authentication failed');
      }

      if (response.status === 400) {
        const errorBody = await response.json().catch(() => ({})) as Record<string, Record<string, unknown>>;
        throw new ValidationError((errorBody.error?.message as string) || 'Invalid request', errorBody);
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as Record<string, Record<string, unknown>>;
        throw new ApiError(
          'api_error',
          `HTTP_${response.status}`,
          (errorBody.error?.message as string) || `API error: ${response.status}`,
          response.status >= 500,
          response.status
        );
      }

      if (request.stream) {
        throw new Error('Use streamMessage for streaming requests');
      }

      return response.json() as Promise<AnthropicResponse>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError('Request timed out');
        }
        throw new NetworkError(error.message);
      }

      throw categorizeError(error);
    }
  }

  private async streamMessage(
    request: AnthropicRequest,
    handler: StreamHandler
  ): Promise<AnthropicResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ ...request, stream: true }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const resetAt = new Date(Date.now() + (parseInt(retryAfter || '1000', 10) * 1000));
        const limit = parseInt(response.headers.get('x-ratelimit-limit') || '100', 10);
        const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '0', 10);

        this.rateLimitInfo = { limit, requestsRemaining: remaining, resetAt };
        throw new RateLimitError('Rate limit exceeded', this.rateLimitInfo);
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
        throw categorizeError(errorBody.error || new Error('Stream request failed'), response.status);
      }

      if (!response.body) {
        throw new NetworkError('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let usage: TokenUsage | undefined;

      const contentBlocks: AnthropicContentBlock[] = [];
      let finalResponse: AnthropicResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const event: AnthropicStreamEvent = JSON.parse(data);
            handler.onChunk?.(event);

            if (event.type === 'content_block_delta' && event.delta?.text) {
              handler.onToken?.(event.delta.text);
              contentBlocks[event.index!] = {
                ...contentBlocks[event.index!],
                text: (contentBlocks[event.index!]?.text || '') + event.delta.text,
              };
            }

            if (event.type === 'message_start') {
              finalResponse = {
                id: '',
                type: 'message',
                role: 'assistant',
                content: [],
                model: request.model,
                stop_reason: '',
                stop_sequence: null,
                usage: event.usage || { input_tokens: 0, output_tokens: 0 },
              };
            }

            if (event.type === 'message_delta' && event.usage) {
              usage = {
                inputTokens: finalResponse?.usage.input_tokens || 0,
                outputTokens: event.usage.output_tokens || 0,
                totalTokens: (finalResponse?.usage.input_tokens || 0) + (event.usage.output_tokens || 0),
              };
              if (finalResponse) {
                finalResponse.stop_reason = 'end_turn';
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE event:', parseError);
          }
        }
      }

      if (finalResponse) {
        finalResponse.content = contentBlocks;
        handler.onComplete?.(usage);
        return finalResponse;
      }

      throw new NetworkError('Stream completed without receiving message');
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        handler.onError?.(error);
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const networkError = new NetworkError('Request timed out');
          handler.onError?.(networkError);
          throw networkError;
        }
        const networkError = new NetworkError(error.message);
        handler.onError?.(networkError);
        throw networkError;
      }

      const apiError = categorizeError(error);
      handler.onError?.(apiError);
      throw apiError;
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: ApiError | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof ApiError ? error : categorizeError(error);

        if (!lastError.retryable || attempt === this.retryConfig.maxRetries) {
          throw lastError;
        }

        await this.sleep(delay);
        delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }
}

export function createApiClient(config: ApiClientConfig): AnthropicApiClient {
  return new AnthropicApiClient(config);
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