import type {
  HookEventName,
  HookDefinition,
  HookExecutionContext,
  HookDecision,
} from './types'
import { executeHooks } from './executor'

export interface HookRegistryOptions {
  maxHooksPerEvent?: number
  defaultTimeout?: number
}

export class HookRegistry {
  private hooks: Map<HookEventName, HookDefinition[]> = new Map()
  private options: HookRegistryOptions

  constructor(options?: HookRegistryOptions) {
    this.options = {
      maxHooksPerEvent: 50,
      defaultTimeout: 30000,
      ...options,
    }
  }

  register(hook: HookDefinition): void {
    const event = hook.event
    const existing = this.hooks.get(event) || []

    if (existing.length >= (this.options.maxHooksPerEvent || 50)) {
      console.warn(`[HookRegistry] Max hooks reached for event: ${event}`)
      return
    }

    existing.push(hook)
    this.hooks.set(event, existing)
  }

  unregister(event: HookEventName, matcher?: (hook: HookDefinition) => boolean): number {
    if (!matcher) {
      const count = this.hooks.get(event)?.length || 0
      this.hooks.delete(event)
      return count
    }

    const existing = this.hooks.get(event)
    if (!existing) return 0

    const filtered = existing.filter((h) => !matcher(h))
    this.hooks.set(event, filtered)
    return existing.length - filtered.length
  }

  getHooks(event: HookEventName): HookDefinition[] {
    return this.hooks.get(event) || []
  }

  getAllHooks(): Map<HookEventName, HookDefinition[]> {
    return new Map(this.hooks)
  }

  async executeEvent(
    event: HookEventName,
    context: HookExecutionContext,
    signal?: AbortSignal,
  ): Promise<HookDecision> {
    const hooks = this.getHooks(event)
    if (hooks.length === 0) {
      return { type: 'allow' }
    }
    return executeHooks(hooks, context, signal)
  }

  clear(): void {
    this.hooks.clear()
  }

  loadFromConfig(config: { hooks?: Record<string, unknown> }): void {
    if (!config.hooks) return

    for (const [event, hookDefs] of Object.entries(config.hooks)) {
      if (!this.isValidEventName(event)) continue

      const hooks = Array.isArray(hookDefs) ? hookDefs : [hookDefs]
      for (const def of hooks) {
        try {
          const hook = this.parseHookDefinition(event as HookEventName, def)
          if (hook) {
            this.register(hook)
          }
        } catch (error) {
          console.error(`[HookRegistry] Failed to parse hook: ${error}`)
        }
      }
    }
  }

  private isValidEventName(name: string): name is HookEventName {
    const validEvents: HookEventName[] = [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PermissionRequest',
      'PostToolUse',
      'Stop',
      'SubagentStop',
      'SessionEnd',
    ]
    return validEvents.includes(name as HookEventName)
  }

  private parseHookDefinition(
    event: HookEventName,
    def: unknown,
  ): HookDefinition | null {
    if (!def || typeof def !== 'object') return null

    const obj = def as Record<string, unknown>

    const callback = this.parseCallback(obj)
    if (!callback) return null

    const matcher = this.parseMatcher(obj.matcher)

    return {
      event,
      callback,
      matcher,
      priority: typeof obj.priority === 'number' ? obj.priority : undefined,
      enabled: obj.enabled !== false,
      description:
        typeof obj.description === 'string' ? obj.description : undefined,
    }
  }

  private parseCallback(obj: Record<string, unknown>): HookDefinition['callback'] | null {
    if (obj.callback && typeof obj.callback === 'object') {
      const cb = obj.callback as Record<string, unknown>

      if (cb.type === 'shell' || cb.type === 'command') {
        return {
          type: cb.type,
          command: String(cb.command || ''),
          timeout: typeof cb.timeout === 'number' ? cb.timeout : undefined,
          env: cb.env as Record<string, string> | undefined,
        }
      }

      if (cb.type === 'http') {
        return {
          type: 'http',
          url: String(cb.url || ''),
          method: cb.method as 'GET' | 'POST' | undefined,
          headers: cb.headers as Record<string, string> | undefined,
          timeout: typeof cb.timeout === 'number' ? cb.timeout : undefined,
        }
      }

      if (cb.type === 'llm' || cb.type === 'prompt') {
        return {
          type: cb.type,
          prompt: String(cb.prompt || ''),
          timeout: typeof cb.timeout === 'number' ? cb.timeout : undefined,
          model: typeof cb.model === 'string' ? cb.model : undefined,
        }
      }
    }

    if (typeof obj.command === 'string') {
      return {
        type: 'shell',
        command: obj.command,
        timeout: typeof obj.timeout === 'number' ? obj.timeout : undefined,
      }
    }

    if (typeof obj.prompt === 'string') {
      return {
        type: 'prompt',
        prompt: obj.prompt,
        timeout: typeof obj.timeout === 'number' ? obj.timeout : undefined,
      }
    }

    return null
  }

  private parseMatcher(matcher: unknown): HookDefinition['matcher'] {
    if (!matcher) return undefined

    if (typeof matcher === 'string') {
      if (matcher === '*' || matcher === 'all') {
        return { type: 'prefix', value: '' }
      }
      if (matcher.includes('*') || matcher.includes('?') || matcher.includes('[')) {
        return { type: 'glob', value: matcher }
      }
      return { type: 'exact', value: matcher }
    }

    if (matcher && typeof matcher === 'object') {
      const m = matcher as Record<string, unknown>
      const type = m.type as 'exact' | 'prefix' | 'regex' | 'glob'
      const value = String(m.value || m.pattern || '')
      return { type, value }
    }

    return undefined
  }
}

let registryInstance: HookRegistry | null = null

export function getHookRegistry(options?: HookRegistryOptions): HookRegistry {
  if (!registryInstance) {
    registryInstance = new HookRegistry(options)
  }
  return registryInstance
}

export function resetHookRegistry(): void {
  registryInstance?.clear()
  registryInstance = null
}
