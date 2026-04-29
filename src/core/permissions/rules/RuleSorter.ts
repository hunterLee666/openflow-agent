import {
  PermissionRule,
  RuleBehavior,
  RuleSortConfig,
  DEFAULT_SORT_CONFIG,
  BEHAVIOR_PRIORITY,
  SOURCE_PRIORITY,
} from './types'

export class RuleSorter {
  private config: RuleSortConfig

  constructor(config: Partial<RuleSortConfig> = {}) {
    this.config = { ...DEFAULT_SORT_CONFIG, ...config }
  }

  sort(rules: PermissionRule[]): PermissionRule[] {
    const sorted = [...rules]

    sorted.sort((a, b) => {
      if (this.config.enforceDenyFirst) {
        const behaviorDiff =
          BEHAVIOR_PRIORITY[a.behavior] - BEHAVIOR_PRIORITY[b.behavior]
        if (behaviorDiff !== 0) {
          return behaviorDiff
        }
      }

      if (this.config.respectSourcePriority) {
        const sourceDiff =
          SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
        if (sourceDiff !== 0) {
          return sourceDiff
        }
      }

      if (this.config.respectRulePriority) {
        const priorityDiff = b.priority - a.priority
        if (priorityDiff !== 0) {
          return priorityDiff
        }
      }

      return a.createdAt.localeCompare(b.createdAt)
    })

    return sorted
  }

  sortByBehavior(rules: PermissionRule[]): Map<RuleBehavior, PermissionRule[]> {
    const grouped = new Map<RuleBehavior, PermissionRule[]>()

    for (const behavior of ['deny', 'ask', 'allow'] as RuleBehavior[]) {
      grouped.set(behavior, [])
    }

    for (const rule of rules) {
      const behaviorRules = grouped.get(rule.behavior)
      if (behaviorRules) {
        behaviorRules.push(rule)
      }
    }

    for (const [, behaviorRules] of grouped) {
      const sorted = this.sortBySourceAndPriority(behaviorRules)
      grouped.set(
        behaviorRules.length > 0 ? behaviorRules[0].behavior : 'deny',
        sorted,
      )
    }

    return grouped
  }

  private sortBySourceAndPriority(rules: PermissionRule[]): PermissionRule[] {
    return [...rules].sort((a, b) => {
      const sourceDiff = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
      if (sourceDiff !== 0) {
        return sourceDiff
      }

      return b.priority - a.priority
    })
  }

  enforceDenyFirstOrder(rules: PermissionRule[]): PermissionRule[] {
    const denyRules: PermissionRule[] = []
    const askRules: PermissionRule[] = []
    const allowRules: PermissionRule[] = []

    for (const rule of rules) {
      if (rule.behavior === 'deny') {
        denyRules.push(rule)
      } else if (rule.behavior === 'ask') {
        askRules.push(rule)
      } else {
        allowRules.push(rule)
      }
    }

    const sortedDeny = this.sortBySourceAndPriority(denyRules)
    const sortedAsk = this.sortBySourceAndPriority(askRules)
    const sortedAllow = this.sortBySourceAndPriority(allowRules)

    return [...sortedDeny, ...sortedAsk, ...sortedAllow]
  }

  validateOrder(rules: PermissionRule[]): {
    valid: boolean
    violations: string[]
  } {
    const violations: string[] = []

    if (this.config.enforceDenyFirst) {
      let foundAskOrAllow = false
      for (const rule of rules) {
        if (rule.behavior === 'allow' || rule.behavior === 'ask') {
          foundAskOrAllow = true
        } else if (rule.behavior === 'deny' && foundAskOrAllow) {
          violations.push(
            `Deny rule '${rule.id}' appears after ask/allow rules, violating deny-first principle`,
          )
        }
      }
    }

    if (this.config.enforceAskBeforeAllow) {
      let foundAllow = false
      for (const rule of rules) {
        if (rule.behavior === 'allow') {
          foundAllow = true
        } else if (rule.behavior === 'ask' && foundAllow) {
          violations.push(
            `Ask rule '${rule.id}' appears after allow rules, violating ask-before-allow principle`,
          )
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    }
  }

  updateConfig(updates: Partial<RuleSortConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  getConfig(): RuleSortConfig {
    return { ...this.config }
  }
}
