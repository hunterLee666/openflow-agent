export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface GovernanceContext {
  cwd: string;
  tool: string;
  input: Record<string, unknown>;
  isReadOnly: boolean;
  isDestructive: boolean;
  isNetworkAccess: boolean;
  isGitCommand: boolean;
  config: {
    maskSensitiveOutputs?: boolean;
    riskThreshold?: RiskLevel;
  };
}

export interface GovernanceStepResult {
  step: number;
  name: string;
  action: "continue" | "deny" | "allow" | "modify";
  reason?: string;
  modifiedInput?: Record<string, unknown>;
  output?: unknown;
  telemetry?: Record<string, unknown>;
}

export interface GovernanceResult {
  status: "ok" | "error" | "denied" | "modified";
  data?: unknown;
  error?: {
    code: string;
    message: string;
    step?: number;
    recoverable?: boolean;
  };
  steps: GovernanceStepResult[];
  telemetry?: {
    traceId?: string;
    spanId?: string;
    durationMs?: number;
    riskScore?: number;
    payloadBytes?: number;
  };
}

export interface GovernanceHooks {
  preToolUse?: (ctx: GovernanceContext) => Promise<{ action: "allow" | "deny" | "modify"; input?: Record<string, unknown>; reason?: string }>;
  postToolUse?: (ctx: GovernanceContext, output: unknown) => Promise<{ action: "allow" | "modify"; output?: unknown; reason?: string }>;
  onTelemetry?: (data: Record<string, unknown>) => void;
}
