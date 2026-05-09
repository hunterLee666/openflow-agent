/**
 * Hook System
 *
 * Lifecycle hooks for intercepting agent behavior.
 * Supports pre/post tool use, session lifecycle, and custom events.
 *
 * Hook events:
 * - PreToolUse: before tool execution
 * - PostToolUse: after tool execution
 * - PostToolUseFailure: after tool failure
 * - SessionStart: session initialization
 * - SessionEnd: session cleanup
 * - Stop: when turn completes
 * - SubagentStart: subagent spawned
 * - SubagentStop: subagent completed
 * - UserPromptSubmit: user sends message
 * - PermissionRequest: permission check triggered
 * - TaskCreated: task created
 * - TaskCompleted: task finished
 * - ConfigChange: settings changed
 * - CwdChanged: working directory changed
 * - FileChanged: file modified
 * - Notification: system notification
 */

import { spawn, type ChildProcess } from 'child_process'

/**
 * All supported hook events.
 */
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'UserPromptSubmit',
  'PermissionRequest',
  'PermissionDenied',
  'TaskCreated',
  'TaskCompleted',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'Notification',
  'PreCompact',
  'PostCompact',
  'TeammateIdle',
] as const

export type HookEvent = typeof HOOK_EVENTS[number]

/**
 * Hook definition.
 */
export interface HookDefinition {
  /** Shell command or function to execute */
  command?: string
  /** HTTP callback URL */
  httpUrl?: string
  /** Function handler */
  handler?: (input: HookInput) => Promise<HookOutput | void>
  /** Tool name matcher (regex pattern) */
  matcher?: string
  /** Timeout in milliseconds */
  timeout?: number
  /** Priority (lower = higher priority) */
  priority?: number
}

/**
 * Hook input passed to handlers.
 */
export interface HookInput {
  event: HookEvent
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  toolUseId?: string
  sessionId?: string
  cwd?: string
  error?: string
  [key: string]: unknown
}

/**
 * Hook output returned by handlers.
 */
export interface HookOutput {
  /** Message to append to conversation */
  message?: string
  /** Permission update */
  permissionUpdate?: {
    tool: string
    behavior: 'allow' | 'deny'
  }
  /** Whether to block the action */
  block?: boolean
  /** Modify the tool call: change name and/or input */
  modify?: {
    toolName?: string
    toolInput?: Record<string, unknown>
  }
  /** Notification */
  notification?: {
    title: string
    body: string
    level?: 'info' | 'warning' | 'error'
  }
}

/**
 * Hook configuration (from settings).
 */
export type HookConfig = Record<string, HookDefinition[]>

/**
 * Hook registry for managing and executing hooks.
 */
export class HookRegistry {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map()

  /**
   * Register hooks from configuration.
   */
  registerFromConfig(config: HookConfig): void {
    for (const [event, definitions] of Object.entries(config)) {
      const hookEvent = event as HookEvent
      if (!HOOK_EVENTS.includes(hookEvent)) continue

      const existing = this.hooks.get(hookEvent) || []
      this.hooks.set(hookEvent, [...existing, ...definitions])
    }
  }

  /**
   * Register a single hook.
   */
  register(event: HookEvent, definition: HookDefinition): void {
    const existing = this.hooks.get(event) || []
    existing.push(definition)
    this.hooks.set(event, existing)
  }

  /**
   * Execute hooks for an event.
   */
  async execute(
    event: HookEvent,
    input: HookInput,
  ): Promise<HookOutput[]> {
    const definitions = this.hooks.get(event) || []
    // Sort by priority (lower number = higher priority)
    const sorted = [...definitions].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    const results: HookOutput[] = []

    for (const def of sorted) {
      // Check matcher for tool-specific hooks
      if (def.matcher && input.toolName) {
        const regex = new RegExp(def.matcher)
        if (!regex.test(input.toolName)) continue
      }

      try {
        let output: HookOutput | void = undefined
        // Determine timeout: PreToolUse defaults to 10s, others 30s if not specified
        const timeoutMs = def.timeout ?? (event === 'PreToolUse' ? 10000 : 30000)

        if (def.handler) {
          // Function handler
          output = await Promise.race([
            def.handler(input),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Hook timeout')), timeoutMs),
            ),
          ])
        } else if (def.command) {
          // Shell command handler
          output = await executeShellHook(def.command, input, timeoutMs)
        } else if (def.httpUrl) {
          // HTTP callback handler
          output = await executeHttpHook(def.httpUrl, input, timeoutMs)
        }

        if (output) {
          results.push(output)
        }
      } catch (err: any) {
        // Log but don't fail on hook errors
        console.error(`[Hook] ${event} hook failed: ${err.message}`)
      }
    }

    return results
  }

  /**
   * Check if any hooks are registered for an event.
   */
  hasHooks(event: HookEvent): boolean {
    return (this.hooks.get(event)?.length || 0) > 0
  }

  /**
   * Clear all hooks.
   */
  clear(): void {
    this.hooks.clear()
  }
}

/**
 * Execute a shell command as a hook.
 */
async function executeShellHook(
  command: string,
  input: HookInput,
  timeout: number,
): Promise<HookOutput | void> {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', command], {
      timeout,
      env: {
        ...process.env,
        HOOK_EVENT: input.event,
        HOOK_TOOL_NAME: input.toolName || '',
        HOOK_SESSION_ID: input.sessionId || '',
        HOOK_CWD: input.cwd || '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Send input as JSON on stdin
    proc.stdin?.write(JSON.stringify(input))
    proc.stdin?.end()

    const chunks: Buffer[] = []
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d))

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(undefined)
        return
      }

      const stdout = Buffer.concat(chunks).toString('utf-8').trim()
      if (!stdout) {
        resolve(undefined)
        return
      }

      try {
        const output = JSON.parse(stdout) as HookOutput
        resolve(output)
      } catch {
        // Non-JSON output treated as message
        resolve({ message: stdout })
      }
    })

    proc.on('error', () => resolve(undefined))
   })
 }

 /**
  * Execute an HTTP callback as a hook.
  */
 async function executeHttpHook(
   url: string,
   input: HookInput,
   timeout: number,
 ): Promise<HookOutput | void> {
   const controller = new AbortController()
   const timeoutId = setTimeout(() => controller.abort(), timeout)
   try {
     const response = await fetch(url, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(input),
       signal: controller.signal,
     })
     if (!response.ok) return undefined
     return await response.json() as HookOutput
   } catch {
     return undefined
   } finally {
     clearTimeout(timeoutId)
   }
 }

 /**
 * Create a default hook registry.
 */
export function createHookRegistry(config?: HookConfig): HookRegistry {
  const registry = new HookRegistry()
  if (config) {
    registry.registerFromConfig(config)
  }
  return registry
}
