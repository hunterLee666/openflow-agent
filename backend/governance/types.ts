import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const GovernanceConfigSchema = z.object({
  maskSensitiveOutputs: z.boolean().optional(),
  riskThreshold: RiskLevelSchema.optional(),
});

export const GovernanceContextSchema = z.object({
  cwd: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  isReadOnly: z.boolean(),
  isDestructive: z.boolean(),
  isNetworkAccess: z.boolean(),
  isGitCommand: z.boolean(),
  config: GovernanceConfigSchema,
});

export type GovernanceContext = z.infer<typeof GovernanceContextSchema>;

export const GovernanceStepResultSchema = z.object({
  step: z.number(),
  name: z.string(),
  action: z.enum(["continue", "deny", "allow", "modify"]),
  reason: z.string().optional(),
  modifiedInput: z.record(z.string(), z.unknown()).optional(),
  output: z.unknown().optional(),
  telemetry: z.record(z.string(), z.unknown()).optional(),
});

export type GovernanceStepResult = z.infer<typeof GovernanceStepResultSchema>;

export const GovernanceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  step: z.number().optional(),
  recoverable: z.boolean().optional(),
});

export const GovernanceResultSchema = z.object({
  status: z.enum(["ok", "error", "denied", "modified"]),
  data: z.unknown().optional(),
  error: GovernanceErrorSchema.optional(),
  steps: z.array(GovernanceStepResultSchema),
  telemetry: z.object({
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    durationMs: z.number().optional(),
    riskScore: z.number().optional(),
    payloadBytes: z.number().optional(),
  }).optional(),
});

export type GovernanceResult = z.infer<typeof GovernanceResultSchema>;

export const GovernanceHooksSchema = z.object({
  preToolUse: z.function()
    .args(GovernanceContextSchema)
    .returns(z.promise(z.object({
      action: z.enum(["allow", "deny", "modify"]),
      input: z.record(z.string(), z.unknown()).optional(),
      reason: z.string().optional(),
    })))
    .optional(),
  postToolUse: z.function()
    .args(GovernanceContextSchema, z.unknown())
    .returns(z.promise(z.object({
      action: z.enum(["allow", "modify"]),
      output: z.unknown().optional(),
      reason: z.string().optional(),
    })))
    .optional(),
  onTelemetry: z.function()
    .args(z.record(z.string(), z.unknown()))
    .returns(z.void())
    .optional(),
});

export type GovernanceHooks = z.infer<typeof GovernanceHooksSchema>;
