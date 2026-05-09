/**
 * Anthropic Messages API Provider
 *
 * Wraps the @anthropic-ai/sdk client. Since our internal format is
 * Anthropic-like, this is mostly a thin pass-through.
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  CreateMessageParams,
  CreateMessageResponse,
  StreamChunk,
} from './types.js'

export class AnthropicProvider implements LLMProvider {
  readonly apiType = 'anthropic-messages' as const
  private client: Anthropic

  constructor(opts: { apiKey?: string; baseURL?: string }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    })
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools
        ? (params.tools as Anthropic.Tool[])
        : undefined,
    }

    // Handle system as string or array of blocks (for prompt caching)
    if (typeof params.system === 'string') {
      requestParams.system = params.system
    } else {
      // Array format: convert to Anthropic's Beta API format
      // @ts-ignore - Beta feature: system as array of text blocks with cache_control
      requestParams.system = params.system
    }

    // Add extended thinking if configured
    if (params.thinking?.type === 'enabled' && params.thinking.budget_tokens) {
      (requestParams as any).thinking = {
        type: 'enabled',
        budget_tokens: params.thinking.budget_tokens,
      }
    }

    const response = await this.client.messages.create(requestParams)

    return {
      content: response.content as CreateMessageResponse['content'],
      stopReason: response.stop_reason || 'end_turn',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens:
          (response.usage as any).cache_creation_input_tokens,
        cache_read_input_tokens:
          (response.usage as any).cache_read_input_tokens,
      },
    }
  }

  async *streamMessage(
    params: CreateMessageParams,
  ): AsyncGenerator<StreamChunk, CreateMessageResponse, unknown> {
    const requestParams: Anthropic.MessageCreateParamsStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools
        ? (params.tools as Anthropic.Tool[])
        : undefined,
      stream: true,
    }

    // Handle system as string or array of blocks
    if (typeof params.system === 'string') {
      requestParams.system = params.system
    } else {
      // @ts-ignore - Beta feature
      requestParams.system = params.system
    }

    // Add extended thinking if configured
    if (params.thinking?.type === 'enabled' && params.thinking.budget_tokens) {
      (requestParams as any).thinking = {
        type: 'enabled',
        budget_tokens: params.thinking.budget_tokens,
      }
    }

    const stream = await this.client.messages.create(requestParams)

    let fullText = ''
    let toolInput: Record<string, unknown> = {}
    let currentToolId = ''
    let currentToolName = ''
    let finalUsage: CreateMessageResponse['usage'] = {
      input_tokens: 0,
      output_tokens: 0,
    }

    for await (const event of stream) {
      const evt = event as any
      if (evt.type === 'content_block_start') {
        const block = evt.content_block as any
        if (block.type === 'tool_use') {
          currentToolId = block.id || ''
          currentToolName = block.name || ''
          toolInput = {}
        }
      } else if (evt.type === 'content_block_delta') {
        const delta = evt.delta as any
        if ('text' in delta) {
          fullText += delta.text
          yield { type: 'text', text: delta.text }
        } else if ('partial_json' in delta) {
          try {
            toolInput = { ...toolInput, ...JSON.parse(delta.partial_json) }
          } catch {
            toolInput = delta.partial_json as unknown as Record<string, unknown>
          }
        }
      } else if (evt.type === 'content_block_stop') {
        if (currentToolName) {
          yield {
            type: 'tool_use',
            id: currentToolId,
            name: currentToolName,
            input: toolInput,
          }
        }
      } else if (evt.type === 'message_delta') {
        if (evt.usage) {
          finalUsage = {
            input_tokens: evt.usage.input_tokens || 0,
            output_tokens: evt.usage.output_tokens || 0,
          }
        }
      } else if (evt.type === 'message_stop') {
        yield { type: 'content_block_stop' }
      }
    }

    // Build response from accumulated content
    const content = fullText
      ? ([{ type: 'text' as const, text: fullText }] as CreateMessageResponse['content'])
      : []

    return {
      content,
      stopReason: 'end_turn',
      usage: finalUsage,
    }
  }
}
