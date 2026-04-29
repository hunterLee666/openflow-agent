import { PermissionRule, RuleLayer, RuleSource, RuleMatchResult } from './types'
import { RuleSorter } from './RuleSorter'
import { RuleMatcher } from './RuleMatcher'

export class RuleManager {
  private layers: Map<RuleSource, RuleLayer> = new Map()
  private sorter: RuleSorter
  private matcher: RuleMatcher
  private cachedRules: PermissionRule[] | null = null

  constructor() {
    this.sorter = new RuleSorter()
    this.matcher = new RuleMatcher()
  }

  addLayer(layer: RuleLayer): void {
    this.layers.set(layer.source, layer)
    this.invalidateCache()
  }

  removeLayer(source: RuleSource): boolean {
    const removed = this.layers.delete(source)
    if (removed) {
      this.invalidateCache()
    }
    return removed
  }

  getLayer(source: RuleSource): RuleLayer | undefined {
    return this.layers.get(source)
  }

  getAllLayers(): RuleLayer[] {
    return Array.from(this.layers.values())
  }

  addRule(source: RuleSource, rule: PermissionRule): void {
    const layer = this.layers.get(source)
    if (layer) {
      layer.rules.push(rule)
      this.invalidateCache()
    }
  }

  removeRule(source: RuleSource, ruleId: string): boolean {
    const layer = this.layers.get(source)
    if (layer) {
      const index = layer.rules.findIndex((r) => r.id === ruleId)
      if (index !== -1) {
        layer.rules.splice(index, 1)
        this.invalidateCache()
        return true
      }
    }
    return false
  }

  getMergedRules(): PermissionRule[] {
    if (this.cachedRules) {
      return this.cachedRules
    }

    const allRules: PermissionRule[] = []
    for (const layer of this.layers.values()) {
      allRules.push(...layer.rules)
    }

    this.cachedRules = this.sorter.sort(allRules)
    return this.cachedRules
  }

  matchFirst(
    testValue: string,
    target?: 'tool' | 'path' | 'command',
  ): RuleMatchResult {
    const rules = this.getMergedRules()
    return this.matcher.matchFirst(rules, testValue, target)
  }

  matchAll(
    testValue: string,
    target?: 'tool' | 'path' | 'command',
  ): RuleMatchResult[] {
    const rules = this.getMergedRules()
    return this.matcher.matchAll(rules, testValue, target)
  }

  validateRules(): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    const rules = this.getMergedRules()
    const orderValidation = this.sorter.validateOrder(rules)

    if (!orderValidation.valid) {
      errors.push(...orderValidation.violations)
    }

    const conflicts = this.matcher.findConflicts(rules)
    for (const conflict of conflicts) {
      warnings.push(
        `Potential conflict between rules '${conflict.rule1.id}' and '${conflict.rule2.id}': ${conflict.conflict}`,
      )
    }

    for (const rule of rules) {
      if (!rule.pattern || rule.pattern.trim() === '') {
        errors.push(`Rule '${rule.id}' has empty pattern`)
      }

      if (rule.priority < 0 || rule.priority > 1000) {
        warnings.push(
          `Rule '${rule.id}' has unusual priority: ${rule.priority}`,
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  getStatistics(): {
    totalRules: number
    rulesByBehavior: Record<string, number>
    rulesBySource: Record<string, number>
    rulesByTarget: Record<string, number>
  } {
    const rules = this.getMergedRules()

    const rulesByBehavior: Record<string, number> = {
      deny: 0,
      ask: 0,
      allow: 0,
    }

    const rulesBySource: Record<string, number> = {}
    const rulesByTarget: Record<string, number> = {}

    for (const rule of rules) {
      rulesByBehavior[rule.behavior]++
      rulesBySource[rule.source] = (rulesBySource[rule.source] || 0) + 1
      rulesByTarget[rule.target] = (rulesByTarget[rule.target] || 0) + 1
    }

    return {
      totalRules: rules.length,
      rulesByBehavior,
      rulesBySource,
      rulesByTarget,
    }
  }

  private invalidateCache(): void {
    this.cachedRules = null
  }

  clear(): void {
    this.layers.clear()
    this.invalidateCache()
  }

  export(): RuleLayer[] {
    return this.getAllLayers()
  }

  import(layers: RuleLayer[]): void {
    for (const layer of layers) {
      this.layers.set(layer.source, layer)
    }
    this.invalidateCache()
  }
}
