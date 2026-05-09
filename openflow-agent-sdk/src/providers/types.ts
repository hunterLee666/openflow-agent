/**
 * LLM Provider Abstraction Types
 *
 * Defines a provider interface that normalizes API differences between
 * Anthropic Messages API and OpenAI Chat Completions API.
 *
 * Internally the SDK uses Anthropic-like message format as the canonical
 * representation. Providers convert to/from their native API format.
 */

// --------------------------------------------------------------------------
// API Type
// --------------------------------------------------------------------------

export type ApiType = 'anthropic-messages' | 'openai-completions'

// --------------------------------------------------------------------------
// Context Management Support
// --------------------------------------------------------------------------

/**
 * Context compression configuration
 * Different providers support different mechanisms:
 * - Anthropic: uses 'compact-2026-01-12' header (server-side auto)
 * - OpenAI: uses context_management parameter (server-side) or /responses/compact endpoint
 * - Others: typically rely on SDK-side compression (like our compactConversation)
 */
export interface ContextCompressionConfig {
  /** Enable automatic compression when context exceeds threshold */
  enabled?: boolean
  /** Threshold (0.0-1.0) - when to trigger compression */
  compactThreshold?: number
  /** Provider-specific compression mode */
  mode?: 'auto' | 'manual' | 'server-side'
}

// --------------------------------------------------------------------------
// Normalized Request
// --------------------------------------------------------------------------

export interface CreateMessageParams {
  model: string
  maxTokens: number
  system: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
  messages: NormalizedMessageParam[]
  tools?: NormalizedTool[]
  thinking?: { type: string; budget_tokens?: number }
}

/**
 * Normalized message format (Anthropic-like).
 * This is the internal representation used throughout the SDK.
 */
export interface NormalizedMessageParam {
  role: 'user' | 'assistant'
  content: string | NormalizedContentBlock[]
}

export type NormalizedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'image'; source: any }
  | { type: 'thinking'; thinking: string }

export interface NormalizedTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

// --------------------------------------------------------------------------
// Normalized Response
// --------------------------------------------------------------------------

export interface CreateMessageResponse {
  content: NormalizedResponseBlock[]
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export type NormalizedResponseBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }

// --------------------------------------------------------------------------
// Provider Interface
// --------------------------------------------------------------------------

export interface LLMProvider {
  /** The API type this provider implements. */
  readonly apiType: ApiType

  /** Send a message and get a response. */
  createMessage(params: CreateMessageParams): Promise<CreateMessageResponse>

  /**
   * Stream a message response.
   * Yields content blocks as they arrive.
   */
  streamMessage?(
    params: CreateMessageParams,
  ): AsyncGenerator<StreamChunk, CreateMessageResponse, unknown>
}

/**
 * Streamed chunk from the API.
 */
export interface StreamChunk {
  type: 'text' | 'tool_use' | 'content_block_stop' | 'message_delta'
  text?: string
  id?: string
  name?: string
  input?: any
  delta?: string
}
