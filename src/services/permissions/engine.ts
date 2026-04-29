import type { PermissionDecision, HookExecutionContext } from '../hooks/types'
import { mergePermissionDecisions } from '../hooks/types'
import type { HookDefinition } from '../hooks/types'
import { executeHooks } from '../hooks/executor'

export type PermissionType =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'bash_execute'
  | 'network_request'
  | 'mcp_tool'
  | 'plugin_command'
  | 'model_invocation'
  | 'tool_use'

export interface PermissionRequest {
  type: PermissionType
  resource: string
  action?: string
  context?: Record<string, unknown>
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  input?: Record<string, unknown>
  tool?: unknown
}

export interface PermissionPolicy {
  id: string
  name: string
  description?: string
  type: PermissionType
  pattern: string | RegExp
  action: 'allow' | 'deny' | 'ask'
  conditions?: PermissionCondition[]
  priority?: number
  enabled?: boolean
}

export interface PermissionCondition {
  field: string
  operator: 'equals' | 'contains' | 'matches' | 'in' | 'not_in'
  value: unknown
}

export interface PermissionCheckResult {
  allowed: boolean
  decision: PermissionDecision
  matchedPolicies: string[]
  reason?: string
  requiresUserConfirmation: boolean
}

export class PermissionEngine {
  private policies: Map<PermissionType, PermissionPolicy[]> = new Map()
  private decisionCache: Map<string, PermissionCheckResult> = new Map()
  private maxCacheSize = 1000

  addPolicy(policy: PermissionPolicy): void {
    const type = policy.type
    const existing = this.policies.get(type) || []
    existing.push(policy)
    existing.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    this.policies.set(type, existing)
    this.invalidateCache()
  }

  removePolicy(policyId: string): boolean {
    for (const [type, policies] of this.policies) {
      const index = policies.findIndex((p) => p.id === policyId)
      if (index !== -1) {
        policies.splice(index, 1)
        this.policies.set(type, policies)
        this.invalidateCache()
        return true
      }
    }
    return false
  }

  async check(
    request: PermissionRequest,
    hooks?: HookDefinition[],
    signal?: AbortSignal,
  ): Promise<PermissionCheckResult> {
    const cacheKey = this.getCacheKey(request)
    const cached = this.decisionCache.get(cacheKey)
    if (cached) return cached

    const matchedPolicies: string[] = []
    let policyDecision: PermissionDecision = { type: 'ask' }

    const policies = this.policies.get(request.type) || []
    for (const policy of policies) {
      if (policy.enabled === false) continue

      if (this.matchesPattern(request.resource, policy.pattern)) {
        matchedPolicies.push(policy.id)

        if (policy.conditions) {
          const conditionsMet = this.evaluateConditions(
            request.context || {},
            policy.conditions,
          )
          if (!conditionsMet) continue
        }

        policyDecision = {
          type: policy.action,
          reason: `Matched policy: ${policy.name}`,
        }
        break
      }
    }

    if (hooks && hooks.length > 0) {
      const context: HookExecutionContext = {
        permissionType: request.type,
        permissionResource: request.resource,
        timestamp: Date.now(),
      }

      const hookDecision = await executeHooks(hooks, context, signal)
      policyDecision = mergePermissionDecisions(policyDecision, this.hookToPermissionDecision(hookDecision))
    }

    const result: PermissionCheckResult = {
      allowed: policyDecision.type === 'allow',
      decision: policyDecision,
      matchedPolicies,
      reason: 'reason' in policyDecision ? policyDecision.reason : undefined,
      requiresUserConfirmation: policyDecision.type === 'ask',
    }

    this.cacheResult(cacheKey, result)
    return result
  }

  private matchesPattern(resource: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(resource)
    }

    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      )
      return regex.test(resource)
    }

    return resource === pattern
  }

  private evaluateConditions(
    context: Record<string, unknown>,
    conditions: PermissionCondition[],
  ): boolean {
    for (const condition of conditions) {
      const value = this.getNestedValue(context, condition.field)

      let result: boolean
      switch (condition.operator) {
        case 'equals':
          result = value === condition.value
          break
        case 'contains':
          result = String(value).includes(String(condition.value))
          break
        case 'matches':
          result = new RegExp(String(condition.value)).test(String(value))
          break
        case 'in':
          result = Array.isArray(condition.value) && condition.value.includes(value)
          break
        case 'not_in':
          result = !Array.isArray(condition.value) || !condition.value.includes(value)
          break
        default:
          result = false
      }

      if (!result) return false
    }
    return true
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }
    return current
  }

  private hookToPermissionDecision(hookDecision: { type: string; reason?: string }): PermissionDecision {
    switch (hookDecision.type) {
      case 'block':
        return { type: 'deny', reason: hookDecision.reason }
      case 'allow':
        return { type: 'allow', reason: hookDecision.reason }
      default:
        return { type: 'ask' }
    }
  }

  private getCacheKey(request: PermissionRequest): string {
    return `${request.type}:${request.resource}:${request.action}`
  }

  private cacheResult(key: string, result: PermissionCheckResult): void {
    if (this.decisionCache.size >= this.maxCacheSize) {
      const firstKey = this.decisionCache.keys().next().value
      if (firstKey) {
        this.decisionCache.delete(firstKey)
      }
    }
    this.decisionCache.set(key, result)
  }

  private invalidateCache(): void {
    this.decisionCache.clear()
  }

  clearPolicies(): void {
    this.policies.clear()
    this.invalidateCache()
  }

  getPolicies(type?: PermissionType): PermissionPolicy[] {
    if (type) {
      return this.policies.get(type) || []
    }
    const all: PermissionPolicy[] = []
    for (const policies of this.policies.values()) {
      all.push(...policies)
    }
    return all
  }
}

const DEFAULT_POLICIES: PermissionPolicy[] = [
  {
    id: 'deny-rm-rf',
    name: 'Deny recursive delete',
    type: 'bash_execute',
    pattern: /rm\s+(-[rf]+\s+|.*\s+-[rf]+)/,
    action: 'deny',
    priority: 100,
  },
  {
    id: 'deny-sudo',
    name: 'Ask for sudo commands',
    type: 'bash_execute',
    pattern: /^sudo/,
    action: 'ask',
    priority: 90,
  },
  {
    id: 'protect-env-files',
    name: 'Protect environment files',
    type: 'file_read',
    pattern: '.env',
    action: 'ask',
    priority: 80,
  },
  {
    id: 'protect-credentials',
    name: 'Protect credential files',
    type: 'file_read',
    pattern: /credentials|secrets|keys?\.pem/i,
    action: 'ask',
    priority: 80,
  },
  {
    id: 'deny-system-files',
    name: 'Deny system file modification',
    type: 'file_write',
    pattern: /^\/(etc|usr|bin|sbin|boot)/,
    action: 'deny',
    priority: 100,
  },
]

let engineInstance: PermissionEngine | null = null

export function getPermissionEngine(): PermissionEngine {
  if (!engineInstance) {
    engineInstance = new PermissionEngine()
    for (const policy of DEFAULT_POLICIES) {
      engineInstance.addPolicy(policy)
    }
  }
  return engineInstance
}

export function resetPermissionEngine(): void {
  engineInstance?.clearPolicies()
  engineInstance = null
}

export async function checkPermission(
  request: PermissionRequest,
  hooks?: HookDefinition[],
): Promise<PermissionCheckResult> {
  const engine = getPermissionEngine()
  return engine.check(request, hooks)
}
