import type {
  PermissionPipeline,
  PermissionContext,
  PermissionDecision,
  PermissionBehavior,
  RiskLevel,
} from "./types.js";
import type {
  PermissionClassifier,
  ClassifierResult,
} from "./classifier.js";
import { MultiSourcePermissionPipeline } from "./multi-source-pipeline.js";
import { isFeatureEnabled } from "../flags/feature-flags.js";

export interface EnhancedPipelineConfig {
  workspaceConfig?: {
    root: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
  };
  classifiers?: PermissionClassifier[];
  alwaysAllowRules?: AlwaysAllowRule[];
  alwaysDenyRules?: AlwaysDenyRule[];
  enableClassifier?: boolean;
  enableAutoAllow?: boolean;
  autoAllowThreshold?: number;
}

export interface AlwaysAllowRule {
  tool?: string;
  pattern?: RegExp;
  condition?: (ctx: PermissionContext) => boolean;
  reason?: string;
}

export interface AlwaysDenyRule {
  tool?: string;
  pattern?: RegExp;
  condition?: (ctx: PermissionContext) => boolean;
  reason: string;
}

export interface DecisionReason {
  type: "rule" | "classifier" | "mode" | "safety_check" | "auto_allow";
  source?: string;
  reason: string;
  confidence?: number;
}

export interface EnhancedDecision {
  decision: PermissionDecision;
  decisionChain: DecisionReason[];
  classifierResults?: ClassifierResult[];
  executionTimeMs?: number;
}

export class EnhancedPermissionPipeline implements PermissionPipeline {
  private basePipeline: MultiSourcePermissionPipeline;
  private classifiers: PermissionClassifier[];
  private alwaysAllowRules: AlwaysAllowRule[];
  private alwaysDenyRules: AlwaysDenyRule[];
  private enableClassifier: boolean;
  private enableAutoAllow: boolean;
  private autoAllowThreshold: number;

  constructor(config: EnhancedPipelineConfig = {}) {
    this.basePipeline = new MultiSourcePermissionPipeline(config.workspaceConfig);
    this.classifiers = config.classifiers ?? [];
    this.alwaysAllowRules = config.alwaysAllowRules ?? [];
    this.alwaysDenyRules = config.alwaysDenyRules ?? [];
    this.enableClassifier = config.enableClassifier ?? isFeatureEnabled("TRANSCRIPT_CLASSIFIER");
    this.enableAutoAllow = config.enableAutoAllow ?? true;
    this.autoAllowThreshold = config.autoAllowThreshold ?? 0.8;
  }

  async evaluate(ctx: PermissionContext): Promise<PermissionDecision> {
    const enhanced = await this.evaluateEnhanced(ctx);
    return enhanced.decision;
  }

  async evaluateEnhanced(ctx: PermissionContext): Promise<EnhancedDecision> {
    const startTime = Date.now();
    const decisionChain: DecisionReason[] = [];
    const classifierResults: ClassifierResult[] = [];

    // Step 1: Always Deny Rules (highest priority)
    const denyCheck = this.checkAlwaysDeny(ctx);
    if (denyCheck.matched) {
      decisionChain.push({
        type: "rule",
        source: "always_deny",
        reason: denyCheck.reason,
      });
      return {
        decision: { type: "deny", reason: denyCheck.reason },
        decisionChain,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Step 2: Always Allow Rules
    const allowCheck = this.checkAlwaysAllow(ctx);
    if (allowCheck.matched) {
      decisionChain.push({
        type: "rule",
        source: "always_allow",
        reason: allowCheck.reason,
      });
      return {
        decision: { type: "allow", reason: allowCheck.reason },
        decisionChain,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Step 3: Base Pipeline (multi-source rules)
    const baseResult = await this.basePipeline.evaluate(ctx);
    if (baseResult.type === "deny") {
      decisionChain.push({
        type: "rule",
        source: "base_pipeline",
        reason: baseResult.reason || "Denied by base pipeline",
      });
      return {
        decision: baseResult,
        decisionChain,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (baseResult.type === "allow") {
      decisionChain.push({
        type: "rule",
        source: "base_pipeline",
        reason: baseResult.reason || "Allowed by base pipeline",
      });
      return {
        decision: baseResult,
        decisionChain,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Step 4: Classifier Evaluation
    if (this.enableClassifier && this.classifiers.length > 0) {
      const classifierDecision = await this.evaluateClassifiers(ctx, classifierResults);

      if (classifierDecision) {
        decisionChain.push({
          type: "classifier",
          source: classifierDecision.source,
          reason: classifierDecision.reason,
          confidence: classifierDecision.confidence,
        });

        if (classifierDecision.action === "deny") {
          return {
            decision: { type: "deny", reason: classifierDecision.reason },
            decisionChain,
            classifierResults,
            executionTimeMs: Date.now() - startTime,
          };
        }

        if (classifierDecision.action === "allow" && this.enableAutoAllow) {
          return {
            decision: { type: "allow", reason: classifierDecision.reason },
            decisionChain,
            classifierResults,
            executionTimeMs: Date.now() - startTime,
          };
        }
      }
    }

    // Step 5: Mode-based Decision
    const modeDecision = this.evaluateMode(ctx);
    if (modeDecision) {
      decisionChain.push({
        type: "mode",
        source: ctx.mode,
        reason: modeDecision.type === "ask" ? modeDecision.prompt : (modeDecision.reason || "Mode-based decision"),
      });
      return {
        decision: modeDecision,
        decisionChain,
        classifierResults,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Step 6: Default - Ask User
    decisionChain.push({
      type: "safety_check",
      reason: "No automatic decision could be made",
    });

    return {
      decision: {
        type: "ask",
        prompt: this.generatePrompt(ctx),
        risk: this.assessRisk(ctx),
        suggestions: this.generateSuggestions(ctx),
      },
      decisionChain,
      classifierResults,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private checkAlwaysDeny(ctx: PermissionContext): { matched: boolean; reason: string } {
    for (const rule of this.alwaysDenyRules) {
      if (this.matchesRule(ctx, rule)) {
        return { matched: true, reason: rule.reason };
      }
    }
    return { matched: false, reason: "" };
  }

  private checkAlwaysAllow(ctx: PermissionContext): { matched: boolean; reason: string } {
    for (const rule of this.alwaysAllowRules) {
      if (this.matchesRule(ctx, rule)) {
        return { matched: true, reason: rule.reason || "Allowed by always-allow rule" };
      }
    }
    return { matched: false, reason: "" };
  }

  private matchesRule(
    ctx: PermissionContext,
    rule: AlwaysAllowRule | AlwaysDenyRule
  ): boolean {
    if (rule.tool && rule.tool !== ctx.tool) {
      return false;
    }

    if (rule.pattern) {
      const inputStr = JSON.stringify(ctx.input);
      if (!rule.pattern.test(inputStr)) {
        return false;
      }
    }

    if (rule.condition && !rule.condition(ctx)) {
      return false;
    }

    return true;
  }

  private async evaluateClassifiers(
    ctx: PermissionContext,
    results: ClassifierResult[]
  ): Promise<{ action: PermissionBehavior; reason: string; source: string; confidence: number } | null> {
    let bestResult: ClassifierResult | null = null;
    let bestSource = "";

    for (const classifier of this.classifiers) {
      try {
        const result = await classifier.classify(ctx);
        results.push(result);

        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
          bestSource = classifier.constructor.name;
        }
      } catch (error) {
        console.warn(`Classifier ${classifier.constructor.name} failed:`, error);
      }
    }

    if (!bestResult) return null;

    const decision = bestResult.decision;

    if (decision.type === "deny") {
      return {
        action: "deny",
        reason: decision.reason,
        source: bestSource,
        confidence: bestResult.confidence,
      };
    }

    if (decision.type === "allow" && bestResult.confidence >= this.autoAllowThreshold) {
      return {
        action: "allow",
        reason: decision.reason || `Auto-approved by ${bestSource}`,
        source: bestSource,
        confidence: bestResult.confidence,
      };
    }

    return null;
  }

  private evaluateMode(ctx: PermissionContext): PermissionDecision | null {
    switch (ctx.mode) {
      case "bypass":
        return { type: "allow", reason: "Bypass mode" };
      case "readonly":
        if (!ctx.isReadOnly) {
          return { type: "deny", reason: "Readonly mode" };
        }
        return { type: "allow", reason: "Readonly operation allowed" };
      case "auto":
        if (ctx.isDestructive) {
          return null;
        }
        return { type: "allow", reason: "Auto mode" };
      case "dontAsk":
      case "acceptEdits":
        if (ctx.isDestructive) {
          return null;
        }
        return { type: "allow", reason: "Accept edits mode" };
      default:
        return null;
    }
  }

  private assessRisk(ctx: PermissionContext): RiskLevel {
    if (ctx.isDestructive) return "critical";
    if (ctx.isNetworkCommand) return "high";
    if (ctx.isGitCommand) return "medium";
    if (!ctx.isReadOnly) return "medium";
    return "low";
  }

  private generatePrompt(ctx: PermissionContext): string {
    const parts: string[] = [];
    parts.push(`Tool: ${ctx.tool}`);

    if (ctx.input.command) {
      parts.push(`Command: ${ctx.input.command}`);
    }
    if (ctx.input.path) {
      parts.push(`Path: ${ctx.input.path}`);
    }

    if (ctx.isDestructive) {
      parts.push("WARNING: This operation is destructive");
    }
    if (ctx.isNetworkCommand) {
      parts.push("WARNING: This operation involves network access");
    }

    return parts.join("\n");
  }

  private generateSuggestions(ctx: PermissionContext): string[] {
    const suggestions: string[] = [];

    if (ctx.tool === "bash") {
      suggestions.push("Review the command carefully before approving");
      if (ctx.isNetworkCommand) {
        suggestions.push("Consider using a sandboxed environment");
      }
    }

    if (ctx.isDestructive) {
      suggestions.push("Make sure you have backups");
    }

    return suggestions;
  }

  addClassifier(classifier: PermissionClassifier): void {
    this.classifiers.push(classifier);
  }

  removeClassifier(name: string): boolean {
    const index = this.classifiers.findIndex(
      (c) => c.constructor.name === name
    );
    if (index >= 0) {
      this.classifiers.splice(index, 1);
      return true;
    }
    return false;
  }

  addAlwaysAllowRule(rule: AlwaysAllowRule): void {
    this.alwaysAllowRules.push(rule);
  }

  addAlwaysDenyRule(rule: AlwaysDenyRule): void {
    this.alwaysDenyRules.push(rule);
  }

  addRule(rule: import("./types.js").PermissionRule): void {
    this.basePipeline.addRule(rule);
  }

  removeRule(id: string): void {
    this.basePipeline.removeRule(id);
  }

  getRules(source?: import("./types.js").PermissionRuleSource): import("./types.js").PermissionRule[] {
    return this.basePipeline.getRules(source);
  }

  clearRules(source?: import("./types.js").PermissionRuleSource): void {
    this.basePipeline.clearRules(source);
  }
}
