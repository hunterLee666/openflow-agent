import { StreamingEvent } from './base'
import { AssistantMessage } from '@query'
import { setRequestStatus } from '@utils/session/requestStatus'
import { getTTFBMonitor, generateRequestId } from '@services/telemetry/ttfbMonitor'
import { getCacheDashboard } from '@services/cache/cacheDashboard'
import { throttleStream, applyBackpressure, type BackpressureConfig } from '@services/stream/backpressure'

export interface StreamProcessingOptions {
  provider?: string
  model?: string
  inputTokens?: number
  trackTTFB?: boolean
  trackCache?: boolean
  throttleMs?: number
  backpressureConfig?: BackpressureConfig
}

export async function processResponsesStream(
  stream: AsyncGenerator<StreamingEvent>,
  startTime: number,
  fallbackResponseId: string,
  options: StreamProcessingOptions = {},
): Promise<{ assistantMessage: AssistantMessage; rawResponse: any }> {
  const contentBlocks: any[] = []
  const usage: any = {
    prompt_tokens: 0,
    completion_tokens: 0,
  }

  let responseId = fallbackResponseId
  const pendingToolCalls: any[] = []
  let hasMarkedStreaming = false
  let firstTokenRecorded = false

  const requestId = generateRequestId()
  const ttfbMonitor = options.trackTTFB ? getTTFBMonitor() : null
  const cacheDashboard = options.trackCache ? getCacheDashboard() : null

  if (ttfbMonitor && options.provider && options.model) {
    ttfbMonitor.startRequest(
      requestId,
      options.provider,
      options.model,
      options.inputTokens ?? 0,
    )
  }

  let processedStream: AsyncGenerator<StreamingEvent> = stream
  
  if (options.backpressureConfig) {
    processedStream = applyBackpressure(stream, options.backpressureConfig)
  } else if (options.throttleMs) {
    processedStream = throttleStream(stream, options.throttleMs)
  }

  for await (const event of processedStream) {
    if (event.type === 'message_start') {
      responseId = event.responseId || responseId
      continue
    }

    if (event.type === 'text_delta') {
      if (!hasMarkedStreaming) {
        setRequestStatus({ kind: 'streaming' })
        hasMarkedStreaming = true
      }
      
      if (!firstTokenRecorded && ttfbMonitor) {
        ttfbMonitor.recordFirstToken(requestId, false)
        firstTokenRecorded = true
      }
      
      const last = contentBlocks[contentBlocks.length - 1]
      if (!last || last.type !== 'text') {
        contentBlocks.push({ type: 'text', text: event.delta, citations: [] })
      } else {
        last.text += event.delta
      }
      continue
    }

    if (event.type === 'tool_request') {
      setRequestStatus({ kind: 'tool', detail: event.tool?.name })
      pendingToolCalls.push(event.tool)
      continue
    }

    if (event.type === 'usage') {
      usage.prompt_tokens = event.usage.input
      usage.completion_tokens = event.usage.output
      usage.promptTokens = event.usage.input
      usage.completionTokens = event.usage.output
      usage.totalTokens =
        event.usage.total ?? event.usage.input + event.usage.output
      if (event.usage.reasoning !== undefined) {
        usage.reasoningTokens = event.usage.reasoning
      }
      
      if (cacheDashboard && options.provider && options.model) {
        cacheDashboard.recordMetric({
          timestamp: Date.now(),
          requestId,
          provider: options.provider,
          model: options.model,
          inputTokens: event.usage.input ?? 0,
          cacheCreationTokens: event.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: event.usage.cache_read_input_tokens ?? 0,
          cacheHit: (event.usage.cache_read_input_tokens ?? 0) > 0,
        })
      }
      continue
    }
  }

  for (const toolCall of pendingToolCalls) {
    let toolArgs = {}
    try {
      toolArgs = toolCall.input ? JSON.parse(toolCall.input) : {}
    } catch {}

    contentBlocks.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: toolArgs,
    })
  }

  const assistantMessage: AssistantMessage = {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: contentBlocks,
      usage: {
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        totalTokens:
          usage.totalTokens ??
          (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        reasoningTokens: usage.reasoningTokens,
      },
    },
    costUSD: 0,
    durationMs: Date.now() - startTime,
    uuid: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as any,
    responseId,
  }

  return {
    assistantMessage,
    rawResponse: {
      id: responseId,
      content: contentBlocks,
      usage,
    },
  }
}
