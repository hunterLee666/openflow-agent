import {
  type PermissionRule,
  type PermissionContext,
  type ConflictStrategy,
  type PermissionConflictResolution,
  type PermissionBehavior,
} from "./types.js";

export class ConflictResolver {
  private defaultStrategy: ConflictStrategy = "priority-wins";
  private countTrackers: Map<string, { count: number; resetTime: number }> = new Map();

  resolve(
    matchingRules: PermissionRule[],
    ctx: PermissionContext,
    strategy?: ConflictStrategy
  ): PermissionConflictResolution | null {
    if (matchingRules.length <= 1) {
      return null;
    }

    const resolutionStrategy = strategy || this.defaultStrategy;

    const winningRule = this.selectWinningRule(matchingRules, resolutionStrategy, ctx);
    const losingRules = matchingRules.filter(r => r.id !== winningRule.id);

    return {
      resolvedAction: winningRule.behavior,
      winningRule,
      losingRules,
      resolutionStrategy,
    };
  }

  private selectWinningRule(
    rules: PermissionRule[],
    strategy: ConflictStrategy,
    ctx: PermissionContext
  ): PermissionRule {
    switch (strategy) {
      case "priority-wins":
        return this.priorityWins(rules);
      case "deny-wins":
        return this.denyWins(rules);
      case "allow-wins":
        return this.allowWins(rules);
      case "most-specific-wins":
        return this.mostSpecificWins(rules);
      case " newest-wins":
        return this.newestWins(rules);
      case "oldest-wins":
        return this.oldestWins(rules);
      default:
        return this.priorityWins(rules);
    }
  }

  private priorityWins(rules: PermissionRule[]): PermissionRule {
    return rules.reduce((best, current) =>
      current.priority > best.priority ? current : best
    );
  }

  private denyWins(rules: PermissionRule[]): PermissionRule {
    const denyRules = rules.filter(r => r.behavior === "deny");
    if (denyRules.length > 0) {
      return denyRules.reduce((best, current) =>
        current.priority > best.priority ? current : denyRules[0]
      );
    }
    return this.priorityWins(rules);
  }

  private allowWins(rules: PermissionRule[]): PermissionRule {
    const allowRules = rules.filter(r => r.behavior === "allow");
    if (allowRules.length > 0) {
      return allowRules.reduce((best, current) =>
        current.priority > best.priority ? current : allowRules[0]
      );
    }
    return this.priorityWins(rules);
  }

  private mostSpecificWins(rules: PermissionRule[]): PermissionRule {
    const withSpecificity = rules.map(r => ({
      rule: r,
      specificity: r.specificity ?? this.calculateSpecificity(r),
    }));
    return withSpecificity.reduce((best, current) =>
      current.specificity > best.specificity ? current : best
    ).rule;
  }

  private newestWins(rules: PermissionRule[]): PermissionRule {
    return rules.reduce((newest, current) => {
      const currentTime = current.metadata?.createdAt || 0;
      const newestTime = newest.metadata?.createdAt || 0;
      return currentTime > newestTime ? current : newest;
    });
  }

  private oldestWins(rules: PermissionRule[]): PermissionRule {
    return rules.reduce((oldest, current) => {
      const currentTime = current.metadata?.createdAt || Infinity;
      const oldestTime = oldest.metadata?.createdAt || Infinity;
      return currentTime < oldestTime ? current : oldest;
    });
  }

  private calculateSpecificity(rule: PermissionRule): number {
    let specificity = 0;
    const content = rule.ruleContent;

    if (content.toolName) {
      specificity += 10;
    }
    if (content.pathPattern) {
      const pattern = content.pathPattern;
      specificity += pattern.split(/[\/*]/).filter(Boolean).length * 5;
      if (pattern.includes("**")) {
        specificity += 20;
      }
      if (pattern.includes("?")) {
        specificity += 3;
      }
    }
    if (content.commandPattern) {
      specificity += 15;
    }
    if (content.conditions) {
      specificity += Object.keys(content.conditions).length * 10;
    }

    return specificity;
  }

  checkConditions(rule: PermissionRule, ctx: PermissionContext): boolean {
    const conditions = rule.ruleContent.conditions;
    if (!conditions) {
      return true;
    }

    if (conditions.timeRange) {
      if (!this.checkTimeRange(conditions.timeRange, ctx.timestamp)) {
        return false;
      }
    }

    if (conditions.count) {
      if (!this.checkCount(rule.id, conditions.count)) {
        return false;
      }
    }

    if (conditions.context) {
      if (!this.checkContext(conditions.context, ctx)) {
        return false;
      }
    }

    return true;
  }

  private checkTimeRange(
    timeRange: { start: string; end: string },
    timestamp?: number
  ): boolean {
    if (!timestamp) {
      return true;
    }

    const now = new Date(timestamp);
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = timeRange.start.split(":").map(Number);
    const [endH, endM] = timeRange.end.split(":").map(Number);

    const start = startH * 60 + startM;
    const end = endH * 60 + endM;

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      return currentTime >= start || currentTime <= end;
    }
  }

  private checkCount(
    ruleId: string,
    countLimit: { max: number; windowMs: number }
  ): boolean {
    const tracker = this.countTrackers.get(ruleId);
    const now = Date.now();

    if (!tracker || now > tracker.resetTime) {
      this.countTrackers.set(ruleId, { count: 1, resetTime: now + countLimit.windowMs });
      return true;
    }

    if (tracker.count >= countLimit.max) {
      return false;
    }

    tracker.count++;
    return true;
  }

  private checkContext(
    contextCondition: { readonly?: boolean; networkAvailable?: boolean; gitRepo?: boolean },
    ctx: PermissionContext
  ): boolean {
    if (contextCondition.readonly !== undefined && ctx.isReadOnly !== contextCondition.readonly) {
      return false;
    }
    if (contextCondition.gitRepo !== undefined && ctx.isGitCommand !== contextCondition.gitRepo) {
      return false;
    }
    return true;
  }

  isRuleExpired(rule: PermissionRule): boolean {
    if (!rule.metadata?.expiresAt) {
      return false;
    }
    return Date.now() > rule.metadata.expiresAt;
  }

  setDefaultStrategy(strategy: ConflictStrategy): void {
    this.defaultStrategy = strategy;
  }

  getDefaultStrategy(): ConflictStrategy {
    return this.defaultStrategy;
  }
}

export const defaultConflictResolver = new ConflictResolver();
