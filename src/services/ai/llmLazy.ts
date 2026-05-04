import { randomUUID } from 'crypto'
import type { AssistantMessage, UserMessage } from '@query'
import type { Tool } from '@tool'
import { getCLISyspromptPrefix } from '@constants/prompts'
import { getGlobalConfig } from '@utils/config'
import { zodToJsonSchema } from 'zod-to-json-schema'

// 使用新 SDK 的 Provider 层
import { createProvider } from '@codeany/open-agent-sdk/dist/providers/index.js'

// 判断模型是否为 OpenAI 兼容
function isOpenAIModel(modelId: string): boolean {
  return ['gpt-', 'o1', 'o3', 'o4', 'deepseek', 'qwen', 'yi-', 'glm', 'mistral', 'gemma'].some(tok =>
    modelId.toLowerCase().includes(tok)
  )
}

// 将 OpenFlow Tool 转换为 SDK provider 可用的工具格式
function normalizeTools(tools: Tool[]): any[] {
  return tools.map(t => {
    let inputSchema: any
    if (t.inputSchema) {
      try {
        inputSchema = zodToJsonSchema(t.inputSchema as any)
      } catch {
        inputSchema = { type: 'object', properties: {} }
      }
    } else {
      inputSchema = { type: 'object', properties: {} }
    }
    return {
      name: t.name,
      description: typeof t.description === 'function' ? '' : t.description,
      input_schema: inputSchema,
    }
  })
}

export async function queryLLM(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options: {
    safeMode: boolean
    model: string
    prependCLISysprompt: boolean
    temperature?: number
    toolUseContext?: any
  },
): Promise<AssistantMessage> {
  const modelId = typeof options.model === 'string'
    ? options.model
    : (options.model as any)?.modelId
  if (!modelId) {
    throw new Error('No model specified. Set model via config or environment variable.');
  }

  // 构建系统提示
  let systemText = systemPrompt.join('\n')
  if (options.prependCLISysprompt) {
    const prefix = getCLISyspromptPrefix()
    if (prefix) {
      systemText = `${prefix}\n${systemText}`
    }
  }

  // 选择 provider 类型
  const apiType = isOpenAIModel(modelId) ? 'openai-completions' : 'anthropic-messages'

  // 初始化 provider
  const provider = await createProvider(apiType, {
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL || process.env.OPENAI_BASE_URL,
  })

  // 构造请求参数
  const params: any = {
    model: modelId,
    maxTokens: Math.max(maxThinkingTokens, 4096),
    system: systemText,
    messages, // OpenFlow 归一化后的消息数组，符合 NormalizedMessageParam
  }

  if (tools && tools.length > 0) {
    params.tools = normalizeTools(tools)
  }

  // 思考扩展（如果支持）
  if (maxThinkingTokens > 0) {
    params.thinking = { type: 'enabled', budget_tokens: maxThinkingTokens }
  }

  // 注意：provider.createMessage 目前不支持直接传入 AbortSignal；可以通过 AbortController 包装 Promise 实现取消，这里暂时不实现

  try {
    const start = Date.now()
    // Race the provider call against abort signal to enable cancellation
    const response = await Promise.race([
      provider.createMessage(params),
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Query aborted')), { once: true })
      }),
    ])
    const durationMs = Date.now() - start

    // 计算费用
    let costUSD = 0
    try {
      // estimateCost 可能未在运行时导出，尝试动态引入
      const { estimateCost: ec } = await import('@codeany/open-agent-sdk/dist/utils/tokens.js')
      if (ec && response.usage) {
        costUSD = ec(modelId, response.usage)
      }
    } catch {
      // 静默失败
    }

    // 构造 AssistantMessage
    // response.content 是 NormalizedResponseBlock[]，需要转换为 Anthropic 兼容的结构
    return {
      type: 'assistant',
      costUSD,
      durationMs,
      uuid: randomUUID(),
      message: {
        id: randomUUID(),
        type: 'message',
        role: 'assistant',
        content: response.content,
        model: modelId,
        stop_reason: response.stopReason,
        stop_sequence: null,
        usage: response.usage || { input_tokens: 0, output_tokens: 0 },
      },
      isApiErrorMessage: false,
      responseId: undefined,
    }
  } catch (error: any) {
    if (signal.aborted || error.name === 'AbortError' || (error.message && error.message.includes('abort'))) {
      throw new Error('Query aborted')
    }
    return {
      type: 'assistant',
      costUSD: 0,
      durationMs: 0,
      uuid: randomUUID(),
      message: {
        id: randomUUID(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: `Error: ${error.message || error}` }],
        model: modelId,
        stop_reason: 'error',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      isApiErrorMessage: true,
      responseId: undefined,
    }
  }
}

export async function queryQuick(args: {
  systemPrompt?: string[]
  userPrompt: string
  assistantPrompt?: string
  enablePromptCaching?: boolean
  signal?: AbortSignal
}): Promise<AssistantMessage> {
  // 单轮快速查询（不涉及工具），使用 Agent.prompt 或 provider 皆可；这里用 provider 保持一致性
  const modelId = process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || getGlobalConfig()?.model
  if (!modelId) {
    throw new Error('No model configured. Set OPENAI_MODEL/ANTHROPIC_MODEL or use config set model.')
  }
  const apiType = isOpenAIModel(modelId) ? 'openai-completions' : 'anthropic-messages'
  const provider = await createProvider(apiType, {
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL || process.env.OPENAI_BASE_URL,
  })

  let systemText = args.systemPrompt?.join('\n') || ''
  const prefix = getCLISyspromptPrefix()
  if (prefix) {
    systemText = `${prefix}\n${systemText}`
  }

  try {
    const response = await provider.createMessage({
      model: modelId,
      maxTokens: 4096,
      system: systemText,
      messages: [{ role: 'user', content: args.userPrompt }],
    })

    return {
      type: 'assistant',
      costUSD: 0,
      durationMs: 0,
      uuid: randomUUID(),
      message: {
        id: randomUUID(),
        type: 'message',
        role: 'assistant',
        content: response.content,
        model: modelId,
        stop_reason: response.stopReason,
        stop_sequence: null,
        usage: response.usage || { input_tokens: 0, output_tokens: 0 },
      },
      isApiErrorMessage: false,
      responseId: undefined,
    }
  } catch (error: any) {
    if (args.signal?.aborted || error.name === 'AbortError') {
      throw new Error('Query aborted')
    }
    return {
      type: 'assistant',
      costUSD: 0,
      durationMs: 0,
      uuid: randomUUID(),
      message: {
        id: randomUUID(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        model: modelId,
        stop_reason: 'error',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      isApiErrorMessage: true,
      responseId: undefined,
    }
  }
}

export async function verifyApiKey(
  apiKey: string,
  baseURL?: string,
): Promise<boolean> {
  try {
    const provider = await createProvider('anthropic-messages', { apiKey, baseURL })
    const resp = await provider.createMessage({
      model: 'claude-haiku-3-5-20250514',
      maxTokens: 10,
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'test' }],
    })
    return !!resp.content
  } catch {
    return false
  }
}

export async function fetchAnthropicModels(
  _apiKey: string,
  _baseURL?: string,
): Promise<any[]> {
  return [
    { id: 'claude-sonnet-4-6-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-haiku-3-5-20250514', name: 'Claude Haiku 3.5' },
  ]
}
