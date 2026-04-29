export type HookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionEnd'

export type HookDecision =
  | { type: 'allow'; warnings?: string[]; systemMessages?: string[] }
  | { type: 'block'; reason: string; systemMessages?: string[] }
  | {
      type: 'modify'
      toolName?: string
      args?: Record<string, unknown>
      reason?: string
      systemMessages?: string[]
    }

export type PermissionDecision =
  | { type: 'allow'; reason?: string }
  | { type: 'deny'; reason: string }
  | { type: 'ask'; reason?: string }
  | { type: 'passthrough' }

export type StopDecision =
  | { type: 'approve' }
  | { type: 'block'; reason: string }

export interface ToolMatcher {
  type: 'exact' | 'prefix' | 'regex' | 'glob'
  value: string
}

export function matchTool(matcher: ToolMatcher, toolName: string): boolean {
  switch (matcher.type) {
    case 'exact':
      return toolName === matcher.value
    case 'prefix':
      return toolName.startsWith(matcher.value)
    case 'regex':
      try {
        return new RegExp(matcher.value).test(toolName)
      } catch {
        return false
      }
    case 'glob':
      try {
        const { minimatch } = require('minimatch')
        return minimatch(toolName, matcher.value, { nocase: false })
      } catch {
        return false
      }
  }
}

export function mergeDecisions(
  acc: HookDecision,
  next: HookDecision,
): HookDecision {
  if (acc.type === 'block') return acc
  if (next.type === 'block') return next

  if (next.type === 'modify') {
    if (acc.type === 'allow') {
      return {
        type: 'modify',
        toolName: next.toolName,
        args: next.args,
        reason: next.reason,
        systemMessages: [...(acc.systemMessages || []), ...(next.systemMessages || [])],
      }
    }
    if (acc.type === 'modify') {
      return {
        type: 'modify',
        toolName: next.toolName ?? acc.toolName,
        args: { ...acc.args, ...next.args },
        reason: next.reason ?? acc.reason,
        systemMessages: [...(acc.systemMessages || []), ...(next.systemMessages || [])],
      }
    }
  }

  if (next.type === 'allow' && acc.type === 'allow') {
    return {
      type: 'allow',
      warnings: [...(acc.warnings || []), ...(next.warnings || [])],
      systemMessages: [...(acc.systemMessages || []), ...(next.systemMessages || [])],
    }
  }

  return acc
}

export function mergePermissionDecisions(
  acc: PermissionDecision,
  next: PermissionDecision,
): PermissionDecision {
  if (acc.type === 'deny') return acc
  if (next.type === 'deny') return next
  if (next.type === 'allow') return next
  if (next.type === 'ask') return next
  return acc
}

export interface ShellCallback {
  type: 'shell' | 'command'
  command: string
  timeout?: number
  env?: Record<string, string>
}

export interface HttpCallback {
  type: 'http'
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  timeout?: number
  retries?: number
}

export interface LlmCallback {
  type: 'llm' | 'prompt'
  prompt: string
  timeout?: number
  model?: string
}

export type HookCallback = ShellCallback | HttpCallback | LlmCallback

export interface HookDefinition {
  event: HookEventName
  matcher?: ToolMatcher
  callback: HookCallback
  priority?: number
  enabled?: boolean
  description?: string
}

export interface HookExecutionContext {
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  userPrompt?: string
  permissionType?: string
  permissionResource?: string
  sessionId?: string
  cwd?: string
  timestamp: number
}

export interface HookResult {
  decision: HookDecision
  duration: number
  hookId: string
  error?: string
}

export const MCP_TOOL_PATTERN = /^mcp__[^_]+__[^_]+$/

export function parseMcpToolName(
  toolName: string,
): { serverName: string; toolName: string } | null {
  if (!MCP_TOOL_PATTERN.test(toolName)) return null
  const parts = toolName.split('__')
  return {
    serverName: parts[1]!,
    toolName: parts.slice(2).join('__'),
  }
}

export function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`
}

export const DEFAULT_HOOK_TIMEOUT_MS = 30000
export const HTTP_HOOK_TIMEOUT_MS = 10000
export const LLM_HOOK_TIMEOUT_MS = 60000

export function getTimeoutForCallback(callback: HookCallback): number {
  if (callback.timeout) return callback.timeout * 1000
  switch (callback.type) {
    case 'http':
      return HTTP_HOOK_TIMEOUT_MS
    case 'llm':
    case 'prompt':
      return LLM_HOOK_TIMEOUT_MS
    default:
      return DEFAULT_HOOK_TIMEOUT_MS
  }
}
