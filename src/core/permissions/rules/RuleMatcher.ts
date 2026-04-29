import { PermissionRule, RuleMatchResult, RuleBehavior } from './types'

export class RuleMatcher {
  matchFirst(
    rules: PermissionRule[],
    testValue: string,
    target?: 'tool' | 'path' | 'command',
  ): RuleMatchResult {
    for (const rule of rules) {
      if (target && rule.target !== target) {
        continue
      }

      if (this.matchesPattern(testValue, rule.pattern)) {
        return {
          matched: true,
          rule,
          behavior: rule.behavior,
          reason: `Matched rule '${rule.id}' with pattern '${rule.pattern}'`,
        }
      }
    }

    return {
      matched: false,
      reason: 'No matching rule found',
    }
  }

  matchAll(
    rules: PermissionRule[],
    testValue: string,
    target?: 'tool' | 'path' | 'command',
  ): RuleMatchResult[] {
    const results: RuleMatchResult[] = []

    for (const rule of rules) {
      if (target && rule.target !== target) {
        continue
      }

      if (this.matchesPattern(testValue, rule.pattern)) {
        results.push({
          matched: true,
          rule,
          behavior: rule.behavior,
          reason: `Matched rule '${rule.id}' with pattern '${rule.pattern}'`,
        })
      }
    }

    return results
  }

  matchByBehavior(
    rules: PermissionRule[],
    testValue: string,
    behavior: RuleBehavior,
    target?: 'tool' | 'path' | 'command',
  ): RuleMatchResult {
    const filteredRules = rules.filter((r) => r.behavior === behavior)
    return this.matchFirst(filteredRules, testValue, target)
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') {
      return true
    }

    if (pattern === value) {
      return true
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return value.startsWith(prefix)
    }

    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1)
      return value.endsWith(suffix)
    }

    if (pattern.includes('*')) {
      const parts = pattern.split('*')
      if (parts.length === 2) {
        return value.startsWith(parts[0]) && value.endsWith(parts[1])
      }
    }

    if (this.isRegexPattern(pattern)) {
      try {
        const regex = new RegExp(pattern)
        return regex.test(value)
      } catch {
        return false
      }
    }

    return value.includes(pattern)
  }

  private isRegexPattern(pattern: string): boolean {
    const regexChars = /[\\^$.|?+()[{]/
    return regexChars.test(pattern)
  }

  findConflicts(rules: PermissionRule[]): Array<{
    rule1: PermissionRule
    rule2: PermissionRule
    conflict: string
  }> {
    const conflicts: Array<{
      rule1: PermissionRule
      rule2: PermissionRule
      conflict: string
    }> = []

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = rules[i]
        const rule2 = rules[j]

        if (this.patternsOverlap(rule1.pattern, rule2.pattern)) {
          if (rule1.behavior !== rule2.behavior) {
            conflicts.push({
              rule1,
              rule2,
              conflict: `Rules have overlapping patterns but different behaviors: ${rule1.behavior} vs ${rule2.behavior}`,
            })
          }
        }
      }
    }

    return conflicts
  }

  private patternsOverlap(pattern1: string, pattern2: string): boolean {
    if (pattern1 === '*' || pattern2 === '*') {
      return true
    }

    if (pattern1 === pattern2) {
      return true
    }

    if (pattern1.endsWith('*') && pattern2.startsWith(pattern1.slice(0, -1))) {
      return true
    }

    if (pattern2.endsWith('*') && pattern1.startsWith(pattern2.slice(0, -1))) {
      return true
    }

    return false
  }
}
