import type {
  PermissionPipeline,
  PermissionContext,
  PermissionDecision,
  PermissionRule,
  RiskLevel,
} from "./types.js";

export class DefaultPermissionPipeline implements PermissionPipeline {
  private rules: PermissionRule[] = [];

  constructor() {
    this.initDefaultRules();
  }

  private initDefaultRules(): void {
    // Step 1: Readonly mode — deny all write operations
    this.rules.push({
      id: "readonly-deny",
      mode: "readonly",
      action: "deny",
      description: "Readonly mode denies all write operations",
    });

    // Step 2: Bypass mode — allow everything (dangerous)
    this.rules.push({
      id: "bypass-allow",
      mode: "bypass",
      action: "allow",
      description: "Bypass mode allows everything",
    });

    // Step 3: DontAsk mode — allow without prompting
    this.rules.push({
      id: "dontask-allow",
      mode: "dontAsk",
      action: "allow",
      description: "DontAsk mode allows without prompting",
    });

    // Step 4: Auto mode — use risk classifier
    this.rules.push({
      id: "auto-classify",
      mode: "auto",
      action: "ask",
      risk: "high",
      description: "Auto mode asks for high-risk operations",
    });

    // Step 5: Plan mode — allow reads, ask for writes
    this.rules.push({
      id: "plan-readonly",
      mode: "plan",
      action: "ask",
      description: "Plan mode asks for all modifications",
    });

    // Step 6: AcceptEdits mode — allow edits, ask for destructive
    this.rules.push({
      id: "acceptedits-destructive",
      mode: "acceptEdits",
      action: "ask",
      risk: "high",
      description: "AcceptEdits mode asks for destructive operations",
    });

    // Step 7: Default mode — conservative
    this.rules.push({
      id: "default-conservative",
      mode: "default",
      action: "ask",
      risk: "medium",
      description: "Default mode asks for medium+ risk operations",
    });
  }

  async evaluate(ctx: PermissionContext): Promise<PermissionDecision> {
    // Step 1: Check readonly mode
    if (ctx.mode === "readonly" && !ctx.isReadOnly) {
      return { type: "deny", reason: "Readonly mode: write operations not allowed" };
    }

    // Step 2: Check bypass mode
    if (ctx.mode === "bypass") {
      return { type: "allow", reason: "Bypass mode: all operations allowed" };
    }

    // Step 3: Check dontAsk mode
    if (ctx.mode === "dontAsk") {
      return { type: "allow", reason: "DontAsk mode: no prompts" };
    }

    // Step 4: Assess risk level
    const risk = this.assessRisk(ctx);

    // Step 5: Check command blacklist
    if (ctx.tool === "bash" && ctx.input.command) {
      const cmd = String(ctx.input.command);
      if (this.isBlacklisted(cmd)) {
        return { type: "deny", reason: `Command blocked by blacklist: ${cmd}` };
      }
    }

    // Step 6: Git safety check
    if (ctx.isGitCommand) {
      const gitDecision = this.checkGitSafety(ctx);
      if (gitDecision) return gitDecision;
    }

    // Step 7: Mode-specific decision
    return this.modeDecision(ctx, risk);
  }

  private assessRisk(ctx: PermissionContext): RiskLevel {
    if (ctx.isDestructive) return "critical";
    if (ctx.isNetworkCommand) return "high";
    if (!ctx.isReadOnly) return "medium";
    return "low";
  }

  private isBlacklisted(cmd: string): boolean {
    const blacklist = [
      /rm\s+-rf\s+\//,
      /rm\s+-rf\s+~/,
      />\s*\/dev\/null/,
      /mkfs/,
      /dd\s+if=/,
      /:\(\)\{\s*:\|:\s*\&\s*\};\s*:/, // fork bomb
    ];
    return blacklist.some((pattern) => pattern.test(cmd));
  }

  private checkGitSafety(ctx: PermissionContext): PermissionDecision | null {
    const cmd = String(ctx.input.command || "");
    if (/git\s+push\s+.*--force/.test(cmd)) {
      return { type: "deny", reason: "Git safety: force push not allowed" };
    }
    if (/git\s+reset\s+.*--hard/.test(cmd)) {
      return { type: "deny", reason: "Git safety: hard reset not allowed" };
    }
    if (/git\s+branch\s+.*-D/.test(cmd)) {
      return { type: "ask", prompt: "Delete remote branch?", risk: "high" };
    }
    return null;
  }

  private modeDecision(ctx: PermissionContext, risk: RiskLevel): PermissionDecision {
    switch (ctx.mode) {
      case "acceptEdits":
        if (ctx.isReadOnly) return { type: "allow" };
        if (risk === "critical" || risk === "high") {
          return { type: "ask", prompt: `Allow destructive operation: ${ctx.tool}?`, risk };
        }
        return { type: "allow" };

      case "plan":
        if (ctx.isReadOnly) return { type: "allow" };
        return { type: "ask", prompt: `Allow modification: ${ctx.tool}?`, risk: "medium" };

      case "auto":
        if (risk === "critical") {
          return { type: "ask", prompt: `Critical risk: ${ctx.tool}. Confirm?`, risk };
        }
        if (risk === "high") {
          return { type: "ask", prompt: `High risk: ${ctx.tool}. Confirm?`, risk };
        }
        return { type: "allow" };

      case "default":
      default:
        if (risk === "low") return { type: "allow" };
        return { type: "ask", prompt: `Allow: ${ctx.tool}?`, risk };
    }
  }

  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }
}
