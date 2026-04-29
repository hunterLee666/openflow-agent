import { spawn } from 'child_process'
import type {
  HookDefinition,
  HookCallback,
  HookExecutionContext,
  HookDecision,
  HookResult,
  ShellCallback,
  LlmCallback,
} from './types'
import { mergeDecisions, getTimeoutForCallback, matchTool } from './types'
import { executeHttpCallback } from './httpCallback'
import Anthropic from '@anthropic-ai/sdk'

export class HookExecutor {
  private inflightRequests = new Map<string, Promise<HookDecision>>()

  async execute(
    hook: HookDefinition,
    context: HookExecutionContext,
    parentSignal?: AbortSignal,
  ): Promise<HookResult> {
    const startTime = Date.now()
    const hookId = `${hook.event}-${hook.callback.type}-${Date.now()}`

    try {
      const decision = await this.executeCallback(
        hook.callback,
        context,
        parentSignal,
      )

      return {
        decision,
        duration: Date.now() - startTime,
        hookId,
      }
    } catch (error) {
      return {
        decision: {
          type: 'block',
          reason: error instanceof Error ? error.message : String(error),
        },
        duration: Date.now() - startTime,
        hookId,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async executeCallback(
    callback: HookCallback,
    context: HookExecutionContext,
    signal?: AbortSignal,
  ): Promise<HookDecision> {
    switch (callback.type) {
      case 'shell':
      case 'command':
        return this.executeShellCallback(callback, context, signal)
      case 'http':
        return executeHttpCallback(callback, context, signal)
      case 'llm':
      case 'prompt':
        return this.executeLlmCallback(callback, context, signal)
      default:
        return { type: 'allow' }
    }
  }

  private async executeShellCallback(
    callback: ShellCallback,
    context: HookExecutionContext,
    signal?: AbortSignal,
  ): Promise<HookDecision> {
    const timeout = getTimeoutForCallback(callback)
    const stdin = JSON.stringify({
      toolName: context.toolName,
      toolArgs: context.toolArgs,
      toolResult: context.toolResult,
      userPrompt: context.userPrompt,
      sessionId: context.sessionId,
      cwd: context.cwd,
    })

    return new Promise((resolve) => {
      const cmd = this.buildShellCommand(callback.command)
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: context.cwd || process.cwd(),
        env: { ...process.env, ...callback.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''
      let resolved = false

      const cleanup = () => {
        try {
          proc.kill()
        } catch {}
      }

      const onAbort = () => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({
            type: 'block',
            reason: 'Hook was aborted',
          })
        }
      }

      if (signal) {
        if (signal.aborted) {
          cleanup()
          return resolve({ type: 'block', reason: 'Hook was aborted' })
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({
            type: 'block',
            reason: 'Hook timed out',
          })
        }
      }, timeout)

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('error', (error) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          cleanup()
          resolve({
            type: 'block',
            reason: `Shell hook error: ${error.message}`,
          })
        }
      })

      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          cleanup()

          const decision = this.parseShellOutput(stdout, stderr, code)
          resolve(decision)
        }
      })

      try {
        proc.stdin?.write(stdin)
        proc.stdin?.end()
      } catch {}
    })
  }

  private async executeLlmCallback(
    callback: LlmCallback,
    context: HookExecutionContext,
    signal?: AbortSignal,
  ): Promise<HookDecision> {
    const timeout = getTimeoutForCallback(callback)

    const prompt = this.interpolatePrompt(callback.prompt, context)

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          type: 'block',
          reason: 'LLM hook timed out',
        })
      }, timeout)

      const onAbort = () => {
        clearTimeout(timer)
        resolve({
          type: 'block',
          reason: 'LLM hook was aborted',
        })
      }

      if (signal) {
        if (signal.aborted) {
          return resolve({ type: 'block', reason: 'LLM hook was aborted' })
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      this.invokeLlm(prompt, callback.model)
        .then((response) => {
          clearTimeout(timer)
          const decision = this.parseLlmOutput(response)
          resolve(decision)
        })
        .catch((error) => {
          clearTimeout(timer)
          resolve({
            type: 'block',
            reason: `LLM hook error: ${error.message}`,
          })
        })
    })
  }

  private buildShellCommand(command: string): string[] {
    if (process.platform === 'win32') {
      return ['cmd.exe', '/d', '/s', '/c', command]
    }
    return ['/bin/sh', '-c', command]
  }

  private parseShellOutput(
    stdout: string,
    stderr: string,
    exitCode: number | null,
  ): HookDecision {
    if (exitCode !== 0) {
      return {
        type: 'block',
        reason: stderr || stdout || `Hook exited with code ${exitCode}`,
      }
    }

    const output = stdout.trim() || stderr.trim()
    if (!output) {
      return { type: 'allow' }
    }

    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed && typeof parsed === 'object') {
          const type = parsed.type || parsed.decision || 'allow'
          if (type === 'block' || type === 'deny') {
            return {
              type: 'block',
              reason: parsed.reason || parsed.message || 'Blocked by hook',
              systemMessages: parsed.systemMessages,
            }
          }
          if (type === 'modify') {
            return {
              type: 'modify',
              toolName: parsed.toolName,
              args: parsed.args || parsed.input,
              reason: parsed.reason,
              systemMessages: parsed.systemMessages,
            }
          }
          return {
            type: 'allow',
            warnings: parsed.warnings,
            systemMessages: parsed.systemMessages,
          }
        }
      } catch {}
    }

    const lowerOutput = output.toLowerCase()
    if (lowerOutput.includes('block') || lowerOutput.includes('deny')) {
      return {
        type: 'block',
        reason: output,
      }
    }

    return { type: 'allow', systemMessages: [output] }
  }

  private parseLlmOutput(response: string): HookDecision {
    const lowerResponse = response.toLowerCase()

    if (lowerResponse.includes('block') || lowerResponse.includes('deny')) {
      const reasonMatch = response.match(/(?:block|deny)[\s:]+(.+)/i)
      return {
        type: 'block',
        reason: reasonMatch ? reasonMatch[1].trim() : 'Blocked by LLM hook',
      }
    }

    if (lowerResponse.includes('modify')) {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          return {
            type: 'modify',
            toolName: parsed.toolName,
            args: parsed.args,
            reason: parsed.reason,
          }
        } catch {}
      }
    }

    return { type: 'allow' }
  }

  private interpolatePrompt(
    template: string,
    context: HookExecutionContext,
  ): string {
    return template
      .replace(/\$TOOL_NAME/g, context.toolName || '')
      .replace(/\$TOOL_INPUT/g, JSON.stringify(context.toolArgs || {}))
      .replace(/\$TOOL_RESULT/g, JSON.stringify(context.toolResult || ''))
      .replace(/\$USER_PROMPT/g, context.userPrompt || '')
      .replace(/\$SESSION_ID/g, context.sessionId || '')
      .replace(/\$CWD/g, context.cwd || '')
  }

  private async invokeLlm(prompt: string, model?: string): Promise<string> {
    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })

      const modelName = model || 'claude-3-5-haiku-20241022'

      const response = await anthropic.messages.create({
        model: modelName,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      return textBlock ? textBlock.text : ''
    } catch (error) {
      throw new Error(
        `Failed to invoke LLM: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async executeWithCoalescing(
    key: string,
    loader: () => Promise<HookDecision>,
  ): Promise<HookDecision> {
    const existing = this.inflightRequests.get(key)
    if (existing) return existing

    const promise = loader().finally(() => {
      this.inflightRequests.delete(key)
    })
    this.inflightRequests.set(key, promise)
    return promise
  }
}

export async function executeHooks(
  hooks: HookDefinition[],
  context: HookExecutionContext,
  signal?: AbortSignal,
): Promise<HookDecision> {
  const executor = new HookExecutor()

  const sortedHooks = [...hooks]
    .filter((h) => h.enabled !== false)
    .sort((a, b) => (a.priority || 100) - (b.priority || 100))

  let result: HookDecision = { type: 'allow' }

  for (const hook of sortedHooks) {
    if (signal?.aborted) {
      return { type: 'block', reason: 'Execution aborted' }
    }

    if (hook.matcher && context.toolName) {
      if (!matchTool(hook.matcher, context.toolName)) {
        continue
      }
    }

    const hookResult = await executor.execute(hook, context, signal)
    result = mergeDecisions(result, hookResult.decision)

    if (result.type === 'block') {
      break
    }
  }

  return result
}
