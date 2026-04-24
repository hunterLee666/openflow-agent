import {
  type PermissionPipeline,
  type PermissionContext,
  type PermissionDecision,
  type PermissionRule,
  type PermissionRuleSource,
  type PermissionRuleContent,
  type RiskLevel,
  PERMISSION_RULE_SOURCES,
  SOURCE_PRIORITY,
} from "./types.js";
import { GlobMatcher } from "../utils/glob.js";

export interface PipelineStepResult {
  step: number;
  action: "continue" | "deny" | "ask" | "allow";
  reason?: string;
  prompt?: string;
  risk?: RiskLevel;
  suggestions?: string[];
}

export class MultiSourcePermissionPipeline implements PermissionPipeline {
  private rulesBySource: Map<PermissionRuleSource, PermissionRule[]> = new Map();
  private sessionRules: PermissionRule[] = [];
  private workspaceConfig?: {
    root: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
  };

  private defaultDenyRules: PermissionRuleContent[] = [
    { pathPattern: "/.git/**" },
    { pathPattern: "/.ssh/**" },
    { pathPattern: "/.aws/**" },
    { pathPattern: "/etc/passwd" },
    { pathPattern: "/etc/shadow" },
  ];

  private defaultAskRules: PermissionRuleContent[] = [
    { toolName: "bash", commandPattern: "curl *" },
    { toolName: "bash", commandPattern: "wget *" },
    { toolName: "bash", commandPattern: "npm install *" },
    { toolName: "bash", commandPattern: "yarn add *" },
    { toolName: "bash", commandPattern: "pip install *" },
  ];

  constructor(workspaceConfig?: { root: string; allowedPaths?: string[]; deniedPaths?: string[] }) {
    this.workspaceConfig = workspaceConfig;
    this.initDefaultRules();
  }

  private initDefaultRules(): void {
    for (const source of PERMISSION_RULE_SOURCES) {
      this.rulesBySource.set(source, []);
    }

    const systemRules = this.rulesBySource.get("userSettings")!;
    for (const rule of this.defaultDenyRules) {
      systemRules.push({
        id: `deny-${Date.now()}-${Math.random()}`,
        source: "userSettings",
        behavior: "deny",
        priority: SOURCE_PRIORITY.userSettings,
        ruleContent: rule,
        description: "System default deny rule",
        createdAt: Date.now(),
      });
    }

    for (const rule of this.defaultAskRules) {
      systemRules.push({
        id: `ask-${Date.now()}-${Math.random()}`,
        source: "userSettings",
        behavior: "ask",
        priority: SOURCE_PRIORITY.userSettings,
        ruleContent: rule,
        description: "System default ask rule",
        createdAt: Date.now(),
      });
    }
  }

  async evaluate(ctx: PermissionContext): Promise<PermissionDecision> {
    const steps: PipelineStepResult[] = [];

    steps.push(this.step1_workspaceBoundary(ctx));
    if (steps[steps.length - 1].action !== "continue") {
      return this.toPermissionDecision(steps[steps.length - 1]);
    }

    steps.push(this.step2_systemDenyList(ctx));
    if (steps[steps.length - 1].action !== "continue") {
      return this.toPermissionDecision(steps[steps.length - 1]);
    }

    steps.push(this.step3_multiSourceRules(ctx));
    if (steps[steps.length - 1].action !== "continue") {
      return this.toPermissionDecision(steps[steps.length - 1]);
    }

    steps.push(this.step4_riskAssessment(ctx));
    if (steps[steps.length - 1].action !== "continue") {
      return this.toPermissionDecision(steps[steps.length - 1]);
    }

    return this.toPermissionDecision(steps[steps.length - 1]);
  }

  private step1_workspaceBoundary(ctx: PermissionContext): PipelineStepResult {
    if (!this.workspaceConfig) {
      return { step: 1, action: "continue" };
    }

    const paths = this.extractPaths(ctx.tool, ctx.input);
    for (const path of paths) {
      if (this.workspaceConfig.deniedPaths?.some(p => new GlobMatcher(p).matches(path))) {
        return {
          step: 1,
          action: "deny",
          reason: `Path ${path} is outside workspace boundary`,
        };
      }

      if (this.workspaceConfig.allowedPaths && this.workspaceConfig.allowedPaths.length > 0) {
        const isAllowed = this.workspaceConfig.allowedPaths.some(p => new GlobMatcher(p).matches(path));
        if (!isAllowed) {
          return {
            step: 1,
            action: "deny",
            reason: `Path ${path} is not in allowed paths`,
          };
        }
      }
    }

    return { step: 1, action: "continue" };
  }

  private step2_systemDenyList(ctx: PermissionContext): PipelineStepResult {
    const dangerousPatterns = [
      { pattern: /rm\s+-rf\s+\/(?!tmp)/, reason: "Cannot delete root directory" },
      { pattern: /rm\s+-rf\s+~\//, reason: "Cannot delete home directory" },
      { pattern: /dd\s+if=/, reason: "Direct device access not allowed" },
      { pattern: /mkfs/, reason: "Filesystem formatting not allowed" },
      { pattern: /:\(\)\{\s*:\|:\s*&\s*\};:/, reason: "Fork bomb detected" },
      { pattern: /curl\s+.*\|/i, reason: "Pipe download to shell is dangerous" },
      { pattern: /wget\s+.*\|/i, reason: "Pipe download to shell is dangerous" },
    ];

    if (ctx.tool === "bash") {
      const cmd = String(ctx.input.command || ctx.input.cmd || "");
      for (const { pattern, reason } of dangerousPatterns) {
        if (pattern.test(cmd)) {
          return { step: 2, action: "deny", reason };
        }
      }
    }

    return { step: 2, action: "continue" };
  }

  private step3_multiSourceRules(ctx: PermissionContext): PipelineStepResult {
    const allRules: PermissionRule[] = [];

    for (const source of PERMISSION_RULE_SOURCES) {
      const sourceRules = this.rulesBySource.get(source) || [];
      allRules.push(...sourceRules);
    }
    allRules.push(...this.sessionRules);

    allRules.sort((a, b) => b.priority - a.priority);

    for (const rule of allRules) {
      if (this.ruleMatches(ctx, rule)) {
        if (rule.behavior === "deny") {
          return {
            step: 3,
            action: "deny",
            reason: `Denied by rule: ${rule.description || rule.id}`,
          };
        }

        if (rule.behavior === "ask") {
          return {
            step: 3,
            action: "ask",
            prompt: `This operation requires confirmation: ${rule.description || "unknown"}`,
            risk: rule.risk || "medium",
            suggestions: this.generateSuggestions(ctx),
          };
        }

        if (rule.behavior === "allow") {
          return {
            step: 3,
            action: "allow",
            reason: `Allowed by rule: ${rule.description || rule.id}`,
          };
        }
      }
    }

    return { step: 3, action: "continue" };
  }

  private step4_riskAssessment(ctx: PermissionContext): PipelineStepResult {
    if (ctx.mode === "bypass") {
      return { step: 4, action: "allow", reason: "Bypass mode enabled" };
    }

    if (ctx.mode === "readonly" && !ctx.isReadOnly) {
      return { step: 4, action: "deny", reason: "Readonly mode prevents write operations" };
    }

    const risk = this.assessRisk(ctx);

    if (ctx.mode === "auto") {
      if (risk === "critical" || risk === "high") {
        return { step: 4, action: "ask", prompt: "High risk operation in auto mode", risk };
      }
      return { step: 4, action: "allow", reason: "Auto mode allows medium/low risk" };
    }

    if (ctx.mode === "dontAsk" || ctx.mode === "acceptEdits") {
      if (risk === "critical") {
        return { step: 4, action: "deny", reason: "Critical risk always denied in this mode" };
      }
      return { step: 4, action: "allow", reason: "Allowed in current mode" };
    }

    if (risk === "critical") {
      return {
        step: 4,
        action: "ask",
        prompt: "This is a critical risk operation. Please confirm.",
        risk: "critical",
        suggestions: this.generateSuggestions(ctx),
      };
    }

    return { step: 4, action: "continue" };
  }

  private ruleMatches(ctx: PermissionContext, rule: PermissionRule): boolean {
    const content = rule.ruleContent;

    if (content.toolName && content.toolName !== ctx.tool) {
      return false;
    }

    if (content.pathPattern) {
      const paths = this.extractPaths(ctx.tool, ctx.input);
      const matcher = new GlobMatcher(content.pathPattern);
      const hasMatch = paths.some(p => matcher.matches(p));
      if (!hasMatch && paths.length > 0) {
        return false;
      }
    }

    if (content.commandPattern && ctx.tool === "bash") {
      const cmd = String(ctx.input.command || ctx.input.cmd || "");
      const cmdMatcher = new GlobMatcher(content.commandPattern);
      if (!cmdMatcher.matches(cmd)) {
        return false;
      }
    }

    return true;
  }

  private extractPaths(tool: string, input: Record<string, unknown>): string[] {
    const paths: string[] = [];

    if (tool === "read" || tool === "read_file" || tool === "edit" || tool === "write") {
      if (typeof input.path === "string") {
        paths.push(input.path);
      }
      if (Array.isArray(input.paths)) {
        paths.push(...input.paths.filter((p): p is string => typeof p === "string"));
      }
    }

    if (tool === "bash") {
      const cmd = String(input.command || input.cmd || "");
      const pathMatches = cmd.match(/['"]?(\/[^\s'"]+)['"]?/g);
      if (pathMatches) {
        paths.push(...pathMatches.map(p => p.replace(/['"]/g, "")));
      }
    }

    return paths;
  }

  private assessRisk(ctx: PermissionContext): RiskLevel {
    if (ctx.isDestructive) return "critical";
    if (ctx.isNetworkCommand) return "high";
    if (ctx.isGitCommand) return "medium";
    if (!ctx.isReadOnly) return "low";
    return "low";
  }

  private generateSuggestions(ctx: PermissionContext): string[] {
    const suggestions: string[] = [];

    if (ctx.tool === "bash") {
      suggestions.push("Allow once", "Always allow similar", "Deny once", "Cancel");
    }

    if (ctx.tool === "edit" || ctx.tool === "write") {
      suggestions.push("Save file", "Discard changes", "Cancel");
    }

    return suggestions;
  }

  private toPermissionDecision(step: PipelineStepResult): PermissionDecision {
    switch (step.action) {
      case "allow":
        return { type: "allow", reason: step.reason };
      case "deny":
        return { type: "deny", reason: step.reason || "Operation denied" };
      case "ask":
        return {
          type: "ask",
          prompt: step.prompt || "Confirmation required",
          risk: step.risk || "medium",
          suggestions: step.suggestions,
        };
      default:
        return { type: "allow", reason: "Default allow" };
    }
  }

  addRule(rule: PermissionRule): void {
    const rules = this.rulesBySource.get(rule.source) || [];
    rules.push(rule);
    this.rulesBySource.set(rule.source, rules);
  }

  removeRule(id: string): void {
    for (const [source, rules] of this.rulesBySource) {
      const filtered = rules.filter(r => r.id !== id);
      if (filtered.length !== rules.length) {
        this.rulesBySource.set(source, filtered);
        break;
      }
    }
    this.sessionRules = this.sessionRules.filter(r => r.id !== id);
  }

  getRules(source?: PermissionRuleSource): PermissionRule[] {
    if (source) {
      return this.rulesBySource.get(source) || [];
    }
    const allRules: PermissionRule[] = [];
    for (const rules of this.rulesBySource.values()) {
      allRules.push(...rules);
    }
    allRules.push(...this.sessionRules);
    return allRules;
  }

  clearRules(source?: PermissionRuleSource): void {
    if (source) {
      this.rulesBySource.set(source, []);
    } else {
      for (const source of PERMISSION_RULE_SOURCES) {
        this.rulesBySource.set(source, []);
      }
      this.sessionRules = [];
    }
  }

  addSessionRule(rule: Omit<PermissionRule, "source" | "priority">): void {
    this.sessionRules.push({
      ...rule,
      source: "session",
      priority: SOURCE_PRIORITY.session,
    });
  }
}