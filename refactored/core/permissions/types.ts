import { z } from "zod";

export enum PermissionMode {
  Default = "default",
  AcceptEdits = "acceptEdits",
  Plan = "plan",
  Auto = "auto",
  DontAsk = "dontAsk",
  BypassPermissions = "bypassPermissions",
}

export enum PermissionDecision {
  Allow = "allow",
  Ask = "ask",
  Deny = "deny",
}

export enum PipelineStep {
  ToolDeny = 1,
  ToolAsk = 2,
  ToolSpecificCheck = 3,
  ToolImplementationReject = 4,
  UserInteraction = 5,
  ContentSpecificAsk = 6,
  SafetyGuardrails = 7,
}

export enum FailClosedReason {
  ParseError = "parse_error",
  SandboxFailed = "sandbox_failed",
  ClassifierMalformed = "classifier_malformed",
  PathNormalizationFailed = "path_normalization_failed",
  UnknownMode = "unknown_mode",
  RuleParseError = "rule_parse_error",
  ASTAnalysisFailed = "ast_analysis_failed",
  GeneralUncertainty = "general_uncertainty",
}

export interface PermissionRule {
  name: string;
  action: "deny" | "ask" | "allow";
  tool?: string;
  pattern?: string;
  pathRegex?: string;
  note?: string;
  sandboxException?: boolean;
}

export interface PermissionRequest {
  toolName: string;
  input: unknown;
  mode: PermissionMode;
  projectRoot: string;
  rules: PermissionRule[];
  preapprovedCommands?: string[];
  sandboxEnabled?: boolean;
  sessionId?: string;
}

export interface PermissionResult {
  decision: PermissionDecision;
  step: PipelineStep;
  reason?: string;
  requiresSandbox?: boolean;
  auditLog?: AuditLogEntry;
}

export interface AuditLogEntry {
  timestamp: number;
  event: string;
  step: PipelineStep;
  tool: string;
  reasonCode: string;
  hashRedactedInput?: string;
  mode: PermissionMode;
  decision: PermissionDecision;
}

export const PermissionRuleSchema = z.object({
  name: z.string(),
  action: z.enum(["deny", "ask", "allow"]),
  tool: z.string().optional(),
  pattern: z.string().optional(),
  pathRegex: z.string().optional(),
  note: z.string().optional(),
  sandboxException: z.boolean().optional(),
});

export const PermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
]);

export function hashInput(input: unknown): string {
  const str = JSON.stringify(input);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export function createAuditLog(
  tool: string,
  mode: PermissionMode,
  decision: PermissionDecision,
  step: PipelineStep,
  reason: string,
  input?: unknown
): AuditLogEntry {
  return {
    timestamp: Date.now(),
    event: `permission_${decision}`,
    step,
    tool,
    reasonCode: reason,
    hashRedactedInput: input ? hashInput(input) : undefined,
    mode,
    decision,
  };
}
