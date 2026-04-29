export type RuleBehavior = 'deny' | 'ask' | 'allow'

export type RuleSource =
  | 'organization'
  | 'team'
  | 'repository'
  | 'user'
  | 'session'
  | 'cliArg'
  | 'policySettings'

export type RuleTarget = 'tool' | 'path' | 'command'

export interface PermissionRule {
  id: string
  behavior: RuleBehavior
  source: RuleSource
  target: RuleTarget
  pattern: string
  priority: number
  description?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface RuleLayer {
  source: RuleSource
  rules: PermissionRule[]
  priority: number
}

export interface RuleMatchResult {
  matched: boolean
  rule?: PermissionRule
  behavior?: RuleBehavior
  reason: string
}

export interface RuleSortConfig {
  enforceDenyFirst: boolean
  enforceAskBeforeAllow: boolean
  respectSourcePriority: boolean
  respectRulePriority: boolean
}

export const DEFAULT_SORT_CONFIG: RuleSortConfig = {
  enforceDenyFirst: true,
  enforceAskBeforeAllow: true,
  respectSourcePriority: true,
  respectRulePriority: true,
}

export const SOURCE_PRIORITY: Record<RuleSource, number> = {
  organization: 100,
  team: 80,
  repository: 60,
  user: 40,
  session: 30,
  cliArg: 20,
  policySettings: 10,
}

export const BEHAVIOR_PRIORITY: Record<RuleBehavior, number> = {
  deny: 0,
  ask: 1,
  allow: 2,
}
