import type {
  PermissionContext,
  PermissionDecision,
  PermissionMode,
} from "./types.js";
import type { PermissionClassifier } from "./classifier.js";
import { createDefaultClassifier, type ClassifierResult } from "./classifier.js";

export type AutoDecisionConfig = {
  enabled?: boolean;
  autoAllowConfidence?: number;
  autoDenyConfidence?: number;
  requireConfirmationFor?: RiskLevel[];
  bypassModes?: PermissionMode[];
};

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AutoPermissionContext extends PermissionContext {
  assistantMessage?: string;
  toolUseId?: string;
  forceDecision?: PermissionDecision;
}

export interface AutoPermissionResult {
  decision: PermissionDecision;
  classifierResult?: ClassifierResult;
  usedAutoDecision: boolean;
  skipped: boolean;
  skipReason?: string;
}

export class AutoPermissionHandler {
  private classifier: PermissionClassifier;
  private config: Required<AutoDecisionConfig>;

  constructor(
    classifier?: PermissionClassifier,
    config?: AutoDecisionConfig
  ) {
    this.classifier = classifier || createDefaultClassifier();
    this.config = {
      enabled: config?.enabled ?? true,
      autoAllowConfidence: config?.autoAllowConfidence ?? 0.8,
      autoDenyConfidence: config?.autoDenyConfidence ?? 0.2,
      requireConfirmationFor: config?.requireConfirmationFor ?? ["high", "critical"],
      bypassModes: config?.bypassModes ?? ["bypass", "dontAsk"],
    };
  }

  async decide(context: AutoPermissionContext): Promise<AutoPermissionResult> {
    if (!this.config.enabled) {
      return {
        decision: { type: "ask", prompt: "Auto-decision disabled", risk: "medium" },
        usedAutoDecision: false,
        skipped: true,
        skipReason: "Auto-decision is disabled",
      };
    }

    if (this.isBypassMode(context.mode)) {
      return {
        decision: { type: "allow", reason: "Bypass mode" },
        usedAutoDecision: false,
        skipped: true,
        skipReason: "Permission mode bypasses decision",
      };
    }

    if (context.forceDecision) {
      return {
        decision: context.forceDecision,
        usedAutoDecision: false,
        skipped: true,
        skipReason: "Force decision provided",
      };
    }

    if (context.mode === "readonly") {
      return {
        decision: { type: "allow", reason: "Read-only mode" },
        usedAutoDecision: false,
        skipped: true,
        skipReason: "Read-only mode",
      };
    }

    if (context.mode === "dontAsk") {
      return {
        decision: { type: "allow", reason: "dontAsk mode" },
        usedAutoDecision: false,
        skipped: true,
        skipReason: "dontAsk permission mode",
      };
    }

    try {
      const result = await this.classifier.classify(context);
      const decision = this.mapClassifierResult(result);

      return {
        decision,
        classifierResult: result,
        usedAutoDecision: true,
        skipped: false,
      };
    } catch (error) {
      console.error("Classifier error:", error);
      return {
        decision: { type: "ask", prompt: "Classification failed", risk: "medium" },
        usedAutoDecision: false,
        skipped: true,
        skipReason: `Classifier error: ${error}`,
      };
    }
  }

  private isBypassMode(mode: PermissionMode): boolean {
    return this.config.bypassModes.includes(mode);
  }

  private mapClassifierResult(result: ClassifierResult): PermissionDecision {
    const { decision, confidence } = result;

    if (decision.type === "allow" || decision.type === "deny") {
      return decision;
    }

    if (
      decision.type === "ask" &&
      decision.risk &&
      this.config.requireConfirmationFor.includes(decision.risk)
    ) {
      return decision;
    }

    if (confidence >= this.config.autoAllowConfidence && decision.type === "ask") {
      return {
        type: "allow",
        reason: `Auto-approved with confidence ${confidence.toFixed(2)}`,
      };
    }

    if (confidence <= this.config.autoDenyConfidence && decision.type === "ask") {
      return {
        type: "deny",
        reason: `Auto-denied with confidence ${confidence.toFixed(2)}`,
      };
    }

    return decision;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  setThresholds(allow: number, deny: number): void {
    this.config.autoAllowConfidence = allow;
    this.config.autoDenyConfidence = deny;
  }

  setBypassModes(modes: PermissionMode[]): void {
    this.config.bypassModes = modes;
  }

  getConfig(): Readonly<AutoDecisionConfig> {
    return { ...this.config };
  }
}

export type CanUseToolFn<Input extends Record<string, unknown> = Record<string, unknown>> = (
  toolName: string,
  input: Input,
  context: PermissionContext,
  assistantMessage?: string,
  toolUseId?: string,
  forceDecision?: PermissionDecision
) => Promise<PermissionDecision>;

export function createCanUseTool(
  handler: AutoPermissionHandler
): CanUseToolFn {
  return async function canUseTool(
    toolName,
    input,
    context,
    assistantMessage,
    toolUseId,
    forceDecision
  ): Promise<PermissionDecision> {
    const extendedContext: AutoPermissionContext = {
      ...context,
      tool: toolName,
      input,
      assistantMessage,
      toolUseId,
      forceDecision,
    };

    const result = await handler.decide(extendedContext);
    return result.decision;
  };
}

export interface PermissionDecisionWithMeta {
  type: "allow" | "deny" | "ask";
  reason?: string;
  prompt?: string;
  risk?: RiskLevel;
  suggestions?: string[];
  metadata?: {
    timestamp: number;
    toolName: string;
    confidence?: number;
    reasons?: string[];
    classifierName?: string;
  };
}

export class PermissionDecisionLogger {
  private decisions: PermissionDecisionWithMeta[] = [];

  log(decision: PermissionDecision, context: PermissionContext, result?: ClassifierResult): void {
    const decisionWithMeta: PermissionDecisionWithMeta = {
      type: decision.type,
      ...(decision.type === "allow" && { reason: decision.reason }),
      ...(decision.type === "deny" && { reason: decision.reason }),
      ...(decision.type === "ask" && { prompt: decision.prompt, risk: decision.risk, suggestions: decision.suggestions }),
      metadata: {
        timestamp: Date.now(),
        toolName: context.tool,
        confidence: result?.confidence,
        reasons: result?.reasons,
      },
    };

    this.decisions.push(decisionWithMeta);
  }

  getDecisions(): ReadonlyArray<PermissionDecisionWithMeta> {
    return this.decisions;
  }

  getDecisionsByTool(toolName: string): PermissionDecisionWithMeta[] {
    return this.decisions.filter(
      (d) => d.metadata?.toolName === toolName
    );
  }

  getRecentDecisions(count: number): PermissionDecisionWithMeta[] {
    return this.decisions.slice(-count);
  }

  clear(): void {
    this.decisions = [];
  }

  getStats(): {
    total: number;
    allowed: number;
    denied: number;
    asked: number;
    byTool: Record<string, { allowed: number; denied: number; asked: number }>;
  } {
    const stats = {
      total: this.decisions.length,
      allowed: 0,
      denied: 0,
      asked: 0,
      byTool: {} as Record<string, { allowed: number; denied: number; asked: number }>,
    };

    for (const decision of this.decisions) {
      const toolName = decision.metadata?.toolName || "unknown";

      if (!stats.byTool[toolName]) {
        stats.byTool[toolName] = { allowed: 0, denied: 0, asked: 0 };
      }

      switch (decision.type) {
        case "allow":
          stats.allowed++;
          stats.byTool[toolName].allowed++;
          break;
        case "deny":
          stats.denied++;
          stats.byTool[toolName].denied++;
          break;
        case "ask":
          stats.asked++;
          stats.byTool[toolName].asked++;
          break;
      }
    }

    return stats;
  }
}

export function createPermissionHandlerWithLogging(
  handler: AutoPermissionHandler,
  logger: PermissionDecisionLogger
): CanUseToolFn {
  const canUseTool = createCanUseTool(handler);

  return async function canUseToolLogged(
    toolName,
    input,
    context,
    assistantMessage,
    toolUseId,
    forceDecision
  ): Promise<PermissionDecision> {
    const extendedContext: AutoPermissionContext = {
      ...context,
      tool: toolName,
      input,
      assistantMessage,
      toolUseId,
      forceDecision,
    };

    const result = await handler.decide(extendedContext);
    logger.log(result.decision, extendedContext, result.classifierResult);
    return result.decision;
  };
}
