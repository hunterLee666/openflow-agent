import type {
  PermissionPipeline,
  PermissionContext,
  PermissionDecision,
  PermissionRule,
  RiskLevel,
} from "./types.js";
import { analyzeBash, isDangerousBash } from "./bash-analyzer.js";
import {
  DefaultSpeculativeClassifier,
  type SpeculativeClassifier,
  type RiskScore,
} from "./classifier.js";
import { WorkspaceBoundaryValidator, type WorkspaceConfig } from "../security/workspace-boundary.js";

export interface ToolDenyRule {
  tool?: string;
  pattern?: RegExp;
  reason: string;
}

export interface ToolAskRule {
  tool?: string;
  pattern?: RegExp;
  sandboxed?: boolean;
  prompt: string;
}

export interface SafetyGuard {
  pathPattern: RegExp;
  action: "deny" | "ask";
  reason: string;
}

export interface PipelineStepResult {
  step: number;
  action: "continue" | "deny" | "ask" | "allow";
  reason?: string;
  prompt?: string;
}

export class SevenStepPermissionPipeline implements PermissionPipeline {
  private denyRules: ToolDenyRule[] = [];
  private askRules: ToolAskRule[] = [];
  private safetyGuards: SafetyGuard[] = [];
  private customRules: PermissionRule[] = [];
  private workspaceValidator: WorkspaceBoundaryValidator;

  private bashBlacklist: RegExp[] = [
    /rm\s+-rf\s+\/(?!tmp)/,
    /rm\s+-rf\s+~\//,
    /dd\s+if=/,
    /mkfs/,
    /:\(\)\{\s*:\|:\s*\&/,
    /curl\s+.*\|/,
    /wget\s+.*\|/,
  ];

  private sensitiveContentPatterns: RegExp[] = [
    /password\s*=/i,
    /api[_-]?key\s*=/i,
    /secret\s*=/i,
    /bearer\s+/i,
    /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/i,
  ];

  constructor(workspaceConfig?: WorkspaceConfig) {
    this.initDefaultRules();
    this.workspaceValidator = new WorkspaceBoundaryValidator(workspaceConfig);
  }

  private initDefaultRules(): void {
    this.denyRules = [
      { tool: "bash", pattern: /rm\s+-rf\s+\//, reason: "Cannot delete root directory" },
      { tool: "bash", pattern: /rm\s+-rf\s+~\//, reason: "Cannot delete home directory" },
      { tool: "bash", pattern: /:\(\)\{.*:\|:.*\};:/, reason: "Fork bomb detected" },
      { tool: "bash", pattern: /mkfs/, reason: "Filesystem formatting not allowed" },
      { tool: "edit", pattern: /\/\.git\//, reason: "Cannot edit files in .git directory" },
      { tool: "edit", pattern: /\/\.ssh\//, reason: "Cannot edit SSH config" },
    ];

    this.askRules = [
      { tool: "bash", pattern: /curl\s+/, prompt: "Download from network?", sandboxed: true },
      { tool: "bash", pattern: /wget\s+/, prompt: "Download from network?", sandboxed: true },
      { tool: "bash", pattern: /nc\s+/, prompt: "Network connection?" },
      { tool: "bash", pattern: /nmap\s+/, prompt: "Network scan?" },
    ];

    this.safetyGuards = [
      { pathPattern: /\/\.git\//, action: "deny", reason: ".git directory protection" },
      { pathPattern: /\/\.claude\//, action: "deny", reason: ".claude directory protection" },
      { pathPattern: /\/\.vscode\//, action: "ask", reason: "VSCode config modification" },
      { pathPattern: /\.(bashrc|bash_profile|zshrc|profile)$/, action: "ask", reason: "Shell config modification" },
    ];
  }

  async evaluate(ctx: PermissionContext): Promise<PermissionDecision> {
    const step1 = this.step1ToolDeny(ctx);
    if (step1.action !== "continue") return this.toDecision(step1);

    const step2 = this.step2ToolAsk(ctx);
    if (step2.action !== "continue") return this.toDecision(step2);

    const step3 = this.step3ToolSpecific(ctx);
    if (step3.action !== "continue") return this.toDecision(step3);

    const step4 = this.step4SpeculativeClassifier(ctx);
    if (step4.action !== "continue") return this.toDecision(step4);

    const step5 = this.step5UserInteraction(ctx);
    if (step5.action !== "continue") return this.toDecision(step5);

    const step6 = this.step7SafetyGuardrails(ctx);
    if (step6.action !== "continue") return this.toDecision(step6);

    const step7 = this.step6ContentSpecific(ctx);
    if (step7.action !== "continue") return this.toDecision(step7);

    const step8 = this.step8WorkspaceBoundary(ctx);
    if (step8.action !== "continue") return this.toDecision(step8);

    return { type: "allow", reason: "All checks passed" };
  }

  private step8WorkspaceBoundary(ctx: PermissionContext): PipelineStepResult {
    const pathTools = ["read", "read_file", "write", "write_file", "edit", "bash"];
    if (!pathTools.includes(ctx.tool)) {
      return { step: 8, action: "continue" };
    }

    let path: string | undefined;
    if (ctx.tool === "bash") {
      const cmd = String(ctx.input.command || "");
      const match = cmd.match(/(?:cd\s+)?(?:(?:read|cat|ls|grep|find|head|tail)\s+)?['"]([^'"]+)['"]/);
      if (match) path = match[1];
    } else if (ctx.input.path) {
      path = String(ctx.input.path);
    }

    if (!path) {
      return { step: 8, action: "continue" };
    }

    const operation = ctx.isReadOnly ? "read" : "write";
    const validation = this.workspaceValidator.validatePath(path, operation);

    if (!validation.valid) {
      return {
        step: 8,
        action: "deny",
        reason: `Workspace boundary violation: ${validation.reason}`,
      };
    }

    return { step: 8, action: "continue" };
  }

  private step4SpeculativeClassifier(ctx: PermissionContext): PipelineStepResult {
    const classifier = new DefaultSpeculativeClassifier();
    const risk = classifier.classify({
      tool: ctx.tool,
      input: ctx.input,
      cwd: ctx.cwd,
      isReadOnly: ctx.isReadOnly,
      isDestructive: ctx.isDestructive,
      isNetworkAccess: ctx.isGitCommand ? false : ctx.tool === "bash" && /curl|wget|nc|ssh/i.test(String(ctx.input.command || "")),
      isGitCommand: ctx.isGitCommand,
    });

    if (risk.level === "critical") {
      return {
        step: 4,
        action: "deny",
        reason: `Critical risk detected: ${risk.reasons.join("; ")}`,
      };
    }

    if (risk.level === "high" && ctx.mode === "readonly") {
      return {
        step: 4,
        action: "deny",
        reason: `High risk operation blocked in readonly mode`,
      };
    }

    return { step: 4, action: "continue" };
  }

  normalizeInputAfterPermission(ctx: PermissionContext): Record<string, unknown> {
    let normalized = { ...ctx.input };

    if (ctx.tool === "bash") {
      const cmd = String(normalized.command || "");
      normalized.command = cmd.trim();
    }

    if (ctx.tool === "edit" || ctx.tool === "write" || ctx.tool === "write_file") {
      const path = String(normalized.path || "");
      normalized.path = path.replace(/\/+/g, "/");
    }

    return normalized;
  }

  private step1ToolDeny(ctx: PermissionContext): PipelineStepResult {
    for (const rule of this.denyRules) {
      if (this.matchesRule(ctx, rule.tool, rule.pattern)) {
        return {
          step: 1,
          action: "deny",
          reason: rule.reason,
        };
      }
    }

    for (const rule of this.customRules) {
      if (rule.action === "deny" && this.matchesRule(ctx, rule.tool, rule.pattern)) {
        return {
          step: 1,
          action: "deny",
          reason: rule.description,
        };
      }
    }

    return { step: 1, action: "continue" };
  }

  private step2ToolAsk(ctx: PermissionContext): PipelineStepResult {
    for (const rule of this.askRules) {
      if (this.matchesRule(ctx, rule.tool, rule.pattern)) {
        return {
          step: 2,
          action: "ask",
          prompt: rule.prompt,
        };
      }
    }

    for (const rule of this.customRules) {
      if (rule.action === "ask" && this.matchesRule(ctx, rule.tool, rule.pattern)) {
        return {
          step: 2,
          action: "ask",
          prompt: rule.description,
        };
      }
    }

    return { step: 2, action: "continue" };
  }

  private step3ToolSpecific(ctx: PermissionContext): PipelineStepResult {
    if (ctx.tool === "bash") {
      const cmd = String(ctx.input.command || "");

      for (const pattern of this.bashBlacklist) {
        if (pattern.test(cmd)) {
          return {
            step: 3,
            action: "deny",
            reason: `Command blocked: ${cmd.slice(0, 50)}`,
          };
        }
      }

      const analysis = analyzeBash(cmd);

      if (analysis.isDangerous) {
        return {
          step: 3,
          action: "deny",
          reason: analysis.dangerousReason,
        };
      }

      if (analysis.requiresConfirmation) {
        return {
          step: 3,
          action: "ask",
          prompt: analysis.confirmationPrompt,
        };
      }
    }

    if (ctx.tool === "edit" || ctx.tool === "write") {
      const path = String(ctx.input.path || "");
      if (this.isPathEscape(ctx.cwd, path)) {
        return {
          step: 3,
          action: "deny",
          reason: "Path escape attempt detected",
        };
      }
    }

    return { step: 3, action: "continue" };
  }

  private step4ToolImplementation(ctx: PermissionContext): PipelineStepResult {
    if (ctx.tool === "edit" || ctx.tool === "write") {
      const path = String(ctx.input.path || "");
      if (!path || path.trim() === "") {
        return {
          step: 4,
          action: "deny",
          reason: "Invalid empty path",
        };
      }

      if (path.includes("\0")) {
        return {
          step: 4,
          action: "deny",
          reason: "Null character in path",
        };
      }
    }

    if (ctx.tool === "bash") {
      const cmd = String(ctx.input.command || "");
      if (cmd.length > 10000) {
        return {
          step: 4,
          action: "deny",
          reason: "Command too long",
        };
      }
    }

    return { step: 4, action: "continue" };
  }

  private step5UserInteraction(ctx: PermissionContext): PipelineStepResult {
    switch (ctx.mode) {
      case "readonly":
        if (!ctx.isReadOnly) {
          return {
            step: 5,
            action: "deny",
            reason: "Readonly mode: write operations not allowed",
          };
        }
        return { step: 5, action: "continue" };

      case "bypass":
        return { step: 5, action: "allow" };

      case "dontAsk":
        return { step: 5, action: "allow" };

      case "plan":
        if (!ctx.isReadOnly) {
          return {
            step: 5,
            action: "ask",
            prompt: `Plan mode: allow modification?`,
          };
        }
        return { step: 5, action: "continue" };

      case "acceptEdits":
        if (ctx.isDestructive) {
          return {
            step: 5,
            action: "ask",
            prompt: `Destructive operation, confirm?`,
          };
        }
        return { step: 5, action: "continue" };

      case "auto":
      case "default":
      default:
        return { step: 5, action: "continue" };
    }
  }

  private step6ContentSpecific(ctx: PermissionContext): PipelineStepResult {
    if (ctx.tool === "read" || ctx.tool === "edit") {
      const content = String(ctx.input.content || ctx.input.text || "");

      for (const pattern of this.sensitiveContentPatterns) {
        if (pattern.test(content)) {
          return {
            step: 6,
            action: "ask",
            prompt: "Sensitive content detected (credentials/keys), continue?",
          };
        }
      }
    }

    return { step: 6, action: "continue" };
  }

  private step7SafetyGuardrails(ctx: PermissionContext): PipelineStepResult {
    let path = "";

    if (ctx.tool === "edit" || ctx.tool === "write" || ctx.tool === "read") {
      path = String(ctx.input.path || "");
    } else if (ctx.tool === "bash") {
      const cmd = String(ctx.input.command || "");
      const match = cmd.match(/['"]?(\/[^\s']+)['"]?/);
      if (match) path = match[1];
    }

    for (const guard of this.safetyGuards) {
      if (guard.pathPattern.test(path)) {
        return {
          step: 7,
          action: guard.action,
          reason: guard.reason,
        };
      }
    }

    return { step: 7, action: "continue" };
  }

  private matchesRule(ctx: PermissionContext, tool?: string, pattern?: RegExp): boolean {
    if (tool && ctx.tool !== tool) return false;
    if (!pattern) return true;

    const cmd = String(ctx.input.command || ctx.input.path || ctx.input.content || "");
    return pattern.test(cmd);
  }

  private isPathEscape(cwd: string, path: string): boolean {
    if (path.startsWith("/")) {
      return !path.startsWith(cwd);
    }
    const fullPath = `${cwd}/${path}`;
    return fullPath !== fullPath.replace(/\/\.\.\//g, "/");
  }

  private isPipeSafe(cmd: string): boolean {
    const safePipes = [
      /\|\s*grep/,
      /\|\s*awk/,
      /\|\s*sed/,
      /\|\s*sort/,
      /\|\s*uniq/,
      /\|\s*head/,
      /\|\s*tail/,
      /\|\s*wc/,
    ];

    return safePipes.some((p) => p.test(cmd));
  }

  private toDecision(result: PipelineStepResult): PermissionDecision {
    switch (result.action) {
      case "deny":
        return { type: "deny", reason: result.reason || `Denied at step ${result.step}` };
      case "ask":
        return { type: "ask", prompt: result.prompt || `Confirm at step ${result.step}`, risk: "medium" };
      case "allow":
        return { type: "allow", reason: result.reason };
      default:
        return { type: "allow", reason: "Default allow" };
    }
  }

  addRule(rule: PermissionRule): void {
    this.customRules.push(rule);
  }

  removeRule(id: string): void {
    this.customRules = this.customRules.filter((r) => r.id !== id);
  }

  addDenyRule(rule: ToolDenyRule): void {
    this.denyRules.push(rule);
  }

  addAskRule(rule: ToolAskRule): void {
    this.askRules.push(rule);
  }

  addSafetyGuard(guard: SafetyGuard): void {
    this.safetyGuards.push(guard);
  }
}

export const createPermissionPipeline = (): SevenStepPermissionPipeline => {
  return new SevenStepPermissionPipeline();
};
