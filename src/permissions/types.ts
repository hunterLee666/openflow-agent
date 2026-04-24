export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "dontAsk"
  | "bypass"
  | "readonly";

export interface PermissionContext {
  tool: string;
  input: Record<string, unknown>;
  cwd: string;
  mode: PermissionMode;
  isReadOnly: boolean;
  isDestructive: boolean;
  isGitCommand: boolean;
  isNetworkCommand: boolean;
}

export type PermissionDecision =
  | { type: "allow"; reason?: string }
  | { type: "deny"; reason: string }
  | { type: "ask"; prompt: string; risk: RiskLevel };

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PermissionRule {
  id: string;
  tool?: string;
  pattern?: RegExp;
  mode: PermissionMode;
  action: "allow" | "deny" | "ask";
  risk?: RiskLevel;
  description: string;
}

export interface PermissionPipeline {
  evaluate(ctx: PermissionContext): Promise<PermissionDecision>;
  addRule(rule: PermissionRule): void;
  removeRule(id: string): void;
}

export interface CommandBlacklist {
  isBlocked(cmd: string): boolean;
  addPattern(pattern: string | RegExp): void;
}

export interface GitSafetyRules {
  allowForcePush: boolean;
  allowHardReset: boolean;
  allowRemoteDelete: boolean;
  requireBranchProtection: boolean;
}
