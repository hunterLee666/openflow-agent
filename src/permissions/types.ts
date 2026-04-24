export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "dontAsk"
  | "bypass"
  | "readonly";

export type PermissionBehavior = "allow" | "ask" | "deny";

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
  | { type: "allow"; reason?: string; updatedInput?: Record<string, unknown> }
  | { type: "deny"; reason: string }
  | { type: "ask"; prompt: string; risk: RiskLevel; suggestions?: string[] };

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PermissionRuleSource =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "flagSettings"
  | "policySettings"
  | "cliArg"
  | "command"
  | "session";

export interface PermissionRuleContent {
  toolName?: string;
  commandPattern?: string;
  pathPattern?: string;
}

export interface PermissionRule {
  id: string;
  source: PermissionRuleSource;
  behavior: PermissionBehavior;
  priority: number;
  ruleContent: PermissionRuleContent;
  risk?: RiskLevel;
  description?: string;
  createdAt?: number;
}

export interface PermissionPipeline {
  evaluate(ctx: PermissionContext): Promise<PermissionDecision>;
  addRule(rule: PermissionRule): void;
  removeRule(id: string): void;
  getRules(source?: PermissionRuleSource): PermissionRule[];
  clearRules(source?: PermissionRuleSource): void;
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

export interface PermissionSettings {
  version: number;
  permissions: {
    alwaysAllow?: PermissionRuleContent[];
    alwaysAsk?: PermissionRuleContent[];
    alwaysDeny?: PermissionRuleContent[];
  };
}

export const PERMISSION_RULE_SOURCES: PermissionRuleSource[] = [
  "userSettings",
  "projectSettings",
  "localSettings",
  "flagSettings",
  "policySettings",
  "cliArg",
  "command",
  "session",
];

export const SOURCE_PRIORITY: Record<PermissionRuleSource, number> = {
  userSettings: 1,
  projectSettings: 2,
  localSettings: 3,
  flagSettings: 4,
  policySettings: 5,
  cliArg: 6,
  command: 7,
  session: 8,
};