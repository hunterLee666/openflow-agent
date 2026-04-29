import type { HttpCallback, HookExecutionContext, HookDecision } from './types'

export interface HttpHookResponse {
  decision?: {
    type: 'allow' | 'block' | 'modify'
    reason?: string
    toolName?: string
    args?: Record<string, unknown>
    warnings?: string[]
  }
  systemMessages?: string[]
  error?: string
}

export async function executeHttpCallback(
  callback: HttpCallback,
  context: HookExecutionContext,
  signal?: AbortSignal,
): Promise<HookDecision> {
  const controller = new AbortController()
  const timeout = callback.timeout ? callback.timeout * 1000 : 10000

  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const mergedSignal = mergeSignals(signal, controller.signal)

  try {
    const response = await fetch(callback.url, {
      method: callback.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...callback.headers,
      },
      body: JSON.stringify({
        event: context.toolName ? 'PreToolUse' : 'Unknown',
        toolName: context.toolName,
        toolArgs: context.toolArgs,
        toolResult: context.toolResult,
        userPrompt: context.userPrompt,
        sessionId: context.sessionId,
        cwd: context.cwd,
        timestamp: context.timestamp,
      }),
      signal: mergedSignal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        type: 'block',
        reason: `HTTP hook failed with status ${response.status}`,
      }
    }

    const data: HttpHookResponse = await response.json()

    if (data.error) {
      return {
        type: 'block',
        reason: data.error,
        systemMessages: data.systemMessages,
      }
    }

    if (!data.decision) {
      return { type: 'allow', systemMessages: data.systemMessages }
    }

    switch (data.decision.type) {
      case 'block':
        return {
          type: 'block',
          reason: data.decision.reason || 'Blocked by HTTP hook',
          systemMessages: data.systemMessages,
        }
      case 'modify':
        return {
          type: 'modify',
          toolName: data.decision.toolName,
          args: data.decision.args,
          reason: data.decision.reason,
          systemMessages: data.systemMessages,
        }
      case 'allow':
      default:
        return {
          type: 'allow',
          warnings: data.decision.warnings,
          systemMessages: data.systemMessages,
        }
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (controller.signal.aborted) {
      return {
        type: 'block',
        reason: 'HTTP hook timed out',
      }
    }

    return {
      type: 'block',
      reason: `HTTP hook error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function mergeSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const validSignals = signals.filter((s): s is AbortSignal => !!s)
  if (validSignals.length === 0) {
    return new AbortController().signal
  }
  if (validSignals.length === 1) {
    return validSignals[0]!
  }

  const controller = new AbortController()
  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
}

export function validateHttpCallback(callback: HttpCallback): string | null {
  if (!callback.url) {
    return 'HTTP callback must have a URL'
  }

  try {
    const url = new URL(callback.url)
    if (!url.protocol.startsWith('http')) {
      return 'HTTP callback URL must use http or https protocol'
    }
  } catch {
    return 'HTTP callback URL is invalid'
  }

  if (callback.timeout !== undefined && callback.timeout < 0) {
    return 'HTTP callback timeout must be non-negative'
  }

  return null
}

export function sanitizeHttpCallback(callback: HttpCallback): HttpCallback {
  const sanitized: HttpCallback = {
    type: 'http',
    url: callback.url,
    method: callback.method || 'POST',
    timeout: callback.timeout || 10,
  }

  if (callback.headers) {
    sanitized.headers = {}
    for (const [key, value] of Object.entries(callback.headers)) {
      if (typeof value === 'string') {
        sanitized.headers[key] = value.replace(/authorization/i, 'X-Auth')
      }
    }
  }

  return sanitized
}
