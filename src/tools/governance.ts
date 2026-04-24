import type { ToolDefinition, ToolContext } from "../types/index.js";
import { safeValidateInput, safeValidateOutput, formatValidationError, type SafeParseResult } from "./validation.js";
import { maskSensitiveString, maskCommandOutput } from "./masking.js";
import { analyzeBash } from "../permissions/bash-analyzer.js";
import type { RiskLevel } from "../permissions/types.js";

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

const SENSITIVE_PATTERNS = [
  /password\s*=/i,
  /api[_-]?key\s*=/i,
  /secret\s*=/i,
  /bearer\s+/i,
  /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/i,
];

export class FourteenStepGovernancePipeline {
  private hooks?: GovernanceHooks;
  private riskThreshold: RiskLevel;

  constructor(hooks?: GovernanceHooks, riskThreshold: RiskLevel = "medium") {
    this.hooks = hooks;
    this.riskThreshold = riskThreshold;
  }

  async execute(
    tool: ToolDefinition,
    rawInput: unknown,
    ctx: ToolContext,
    toolContext: GovernanceContext
  ): Promise<GovernanceResult> {
    const steps: GovernanceStepResult[] = [];
    const startTime = Date.now();
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    let currentInput = rawInput as Record<string, unknown>;
    let currentToolName = tool.name;
    const telemetry: Record<string, unknown> = { traceId, spanId, toolName: tool.name };

    try {
      // Step 1: 解析输入 (Parse Input)
      const step1 = this.step1_parseInput(rawInput);
      steps.push(step1);
      if (step1.action === "deny") {
        return this.buildErrorResult("parse_error", step1.reason || "Parse failed", steps, startTime, traceId, spanId);
      }

      // Step 2: 校验Schema (Schema Validation)
      const step2 = await this.step2_validateSchema(tool, currentInput);
      steps.push(step2);
      if (step2.action === "deny") {
        return this.buildErrorResult("schema_error", step2.reason || "Schema validation failed", steps, startTime, traceId, spanId);
      }

      // Step 3: validateInput 业务层验证 (Business Validation)
      const step3 = this.step3_validateInput(currentInput, toolContext);
      steps.push(step3);
      if (step3.action === "deny") {
        return this.buildErrorResult("business_error", step3.reason || "Business validation failed", steps, startTime, traceId, spanId);
      }

      // Step 4: 投机分类器 (Speculative Classifier)
      const step4 = this.step4_speculativeClassifier(toolContext);
      steps.push(step4);
      telemetry.riskScore = this.riskLevelToScore(step4.reason || "medium");

      if (step4.action === "deny") {
        return this.buildErrorResult("risk_error", step4.reason || "Risk threshold exceeded", steps, startTime, traceId, spanId);
      }

      // Step 5: PreToolUse Hook
      const step5 = await this.step5_preToolUse(toolContext);
      steps.push(step5);
      if (step5.action === "deny") {
        return this.buildErrorResult("pre_hook_error", step5.reason || "PreToolUse hook denied", steps, startTime, traceId, spanId);
      }
      if (step5.action === "modify" && step5.modifiedInput) {
        currentInput = step5.modifiedInput;
      }

      // Step 6: 正式权限决策 (Formal Permission)
      const step6 = this.step6_permissionDecision(toolContext);
      steps.push(step6);
      if (step6.action === "deny") {
        return this.buildErrorResult("permission_error", step6.reason || "Permission denied", steps, startTime, traceId, spanId);
      }

      // Step 7: 二次修正输入 (Secondary Input Correction)
      const step7 = this.step7_correctInput(currentInput, toolContext);
      steps.push(step7);
      if (step7.action === "modify" && step7.modifiedInput) {
        currentInput = step7.modifiedInput;
      }

      // Step 8: tool.call() 执行
      const step8 = await this.step8_execute(tool, currentInput, ctx);
      steps.push(step8);
      if (step8.action === "deny") {
        return this.buildErrorResult("execution_error", step8.reason || "Tool execution failed", steps, startTime, traceId, spanId);
      }

      let output = step8.output;

      // Step 9: 遥测日志 (Telemetry)
      const step9 = this.step9_telemetry(steps, telemetry);
      steps.push(step9);

      // Step 10: PostToolUse Hook
      const step10 = await this.step10_postToolUse(toolContext, output);
      steps.push(step10);
      if (step10.action === "modify" && step10.output !== undefined) {
        output = step10.output;
      }

      // Step 11: 结构化输出 (Structured Output)
      const step11 = this.step11_structuredOutput(tool.name, output);
      steps.push(step11);

      // Step 12: 输出Schema再校验 (Optional Output Validation)
      const step12 = await this.step12_outputValidation(tool, output);
      steps.push(step12);
      if (step12.action === "deny") {
        return this.buildErrorResult("output_validation_error", step12.reason || "Output validation failed", steps, startTime, traceId, spanId);
      }

      // Step 13: 敏感字段脱敏 (Optional Sensitive Field Masking)
      const step13 = this.step13_maskSensitive(tool.name, output, toolContext);
      steps.push(step13);
      if (step13.action === "modify" && step13.output !== undefined) {
        output = step13.output;
      }

      // Step 14: 压缩/引用 (Optional Compression/Reference)
      const step14 = this.step14_compress(output);
      steps.push(step14);
      if (step14.action === "modify" && step14.output !== undefined) {
        output = step14.output;
      }

      const durationMs = Date.now() - startTime;
      return {
        status: "ok",
        data: output,
        steps,
        telemetry: {
          traceId,
          spanId,
          durationMs,
          riskScore: telemetry.riskScore as number | undefined,
          payloadBytes: JSON.stringify(output).length,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        status: "error",
        error: {
          code: "unknown_error",
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
        },
        steps,
        telemetry: {
          traceId,
          spanId,
          durationMs,
        },
      };
    }
  }

  // Step 1: 解析输入
  private step1_parseInput(raw: unknown): GovernanceStepResult {
    if (raw === null || raw === undefined) {
      return { step: 1, name: "parseInput", action: "deny", reason: "Input is null or undefined" };
    }
    if (typeof raw !== "object") {
      return { step: 1, name: "parseInput", action: "deny", reason: "Input must be an object" };
    }
    return { step: 1, name: "parseInput", action: "continue" };
  }

  // Step 2: Schema校验
  private async step2_validateSchema(tool: ToolDefinition, input: Record<string, unknown>): Promise<GovernanceStepResult> {
    const result = safeValidateInput(tool.inputSchema, input);
    if (!result.ok) {
      return {
        step: 2,
        name: "validateSchema",
        action: "deny",
        reason: formatValidationError(result),
        telemetry: { errorCount: result.error.issues.length },
      };
    }
    return { step: 2, name: "validateSchema", action: "continue" };
  }

  // Step 3: validateInput 业务层验证
  private step3_validateInput(input: Record<string, unknown>, ctx: GovernanceContext): GovernanceStepResult {
    if (ctx.tool === "bash" && ctx.isDestructive) {
      const cmd = String(input.command || "");
      if (/rm\s+-rf\s+\/|dd\s+if=|mkfs/.test(cmd)) {
        return { step: 3, name: "validateInput", action: "deny", reason: "Destructive command detected" };
      }
    }

    if (ctx.tool === "edit" || ctx.tool === "write") {
      const filePath = String(input.path || "");
      if (/\/\.git\//.test(filePath) || /\/\.ssh\//.test(filePath)) {
        return { step: 3, name: "validateInput", action: "deny", reason: "Cannot modify protected paths" };
      }
    }

    return { step: 3, name: "validateInput", action: "continue" };
  }

  // Step 4: 投机分类器
  private step4_speculativeClassifier(ctx: GovernanceContext): GovernanceStepResult {
    let riskScore = 0;
    const reasons: string[] = [];

    if (ctx.isDestructive) {
      riskScore += 40;
      reasons.push("destructive_operation");
    }

    if (ctx.isNetworkAccess) {
      riskScore += 30;
      reasons.push("network_access");
    }

    if (ctx.isGitCommand) {
      riskScore += 20;
      reasons.push("git_command");
    }

    if (ctx.tool === "bash") {
      const bashAnalysis = analyzeBash(String(ctx.input.command || ""));
      if (bashAnalysis.isDangerous) {
        riskScore += 50;
        reasons.push("dangerous_bash_pattern");
      }
      if (bashAnalysis.hasPipe) {
        riskScore += 20;
        reasons.push("pipe_to_shell");
      }
    }

    const thresholdScore = this.riskLevelToScore(this.riskThreshold);

    if (riskScore >= 100) {
      return { step: 4, name: "speculativeClassifier", action: "deny", reason: `Critical risk: ${reasons.join(", ")}` };
    }

    if (riskScore >= thresholdScore) {
      return { step: 4, name: "speculativeClassifier", action: "continue", reason: `Risk score: ${riskScore}` };
    }

    return { step: 4, name: "speculativeClassifier", action: "continue", reason: `Low risk: ${riskScore}` };
  }

  // Step 5: PreToolUse Hook
  private async step5_preToolUse(ctx: GovernanceContext): Promise<GovernanceStepResult> {
    if (!this.hooks?.preToolUse) {
      return { step: 5, name: "preToolUse", action: "continue" };
    }

    try {
      const result = await this.hooks.preToolUse(ctx);
      if (result.action === "deny") {
        return { step: 5, name: "preToolUse", action: "deny", reason: result.reason };
      }
      if (result.action === "modify" && result.input) {
        return { step: 5, name: "preToolUse", action: "modify", modifiedInput: result.input, reason: result.reason };
      }
      return { step: 5, name: "preToolUse", action: "allow" };
    } catch (error) {
      return {
        step: 5,
        name: "preToolUse",
        action: "continue",
        reason: `Hook error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Step 6: 正式权限决策
  private step6_permissionDecision(ctx: GovernanceContext): GovernanceStepResult {
    if (ctx.isReadOnly && (ctx.tool === "write" || ctx.tool === "edit" || ctx.tool === "bash")) {
      return { step: 6, name: "permissionDecision", action: "deny", reason: "Readonly mode - write operations not allowed" };
    }
    return { step: 6, name: "permissionDecision", action: "continue" };
  }

  // Step 7: 二次修正输入
  private step7_correctInput(input: Record<string, unknown>, ctx: GovernanceContext): GovernanceStepResult {
    let modified = false;
    const corrected = { ...input };

    if (ctx.tool === "bash") {
      const cmd = String(corrected.command || "").trim();
      if (cmd !== corrected.command) {
        corrected.command = cmd;
        modified = true;
      }
    }

    if (ctx.tool === "edit" || ctx.tool === "write" || ctx.tool === "write_file") {
      const filePath = String(corrected.path || "").replace(/\/+/g, "/");
      if (filePath !== corrected.path) {
        corrected.path = filePath;
        modified = true;
      }
    }

    if (modified) {
      return { step: 7, name: "correctInput", action: "modify", modifiedInput: corrected, reason: "Input normalized" };
    }
    return { step: 7, name: "correctInput", action: "continue" };
  }

  // Step 8: tool.call() 执行
  private async step8_execute(
    tool: ToolDefinition,
    input: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<GovernanceStepResult> {
    const toolContext: ToolContext = { ...ctx };
    try {
      const output = await tool.handler(input, toolContext);
      return { step: 8, name: "execute", action: "continue", output };
    } catch (error) {
      return {
        step: 8,
        name: "execute",
        action: "deny",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Step 9: 遥测日志
  private step9_telemetry(steps: GovernanceStepResult[], telemetry: Record<string, unknown>): GovernanceStepResult {
    this.hooks?.onTelemetry?.(telemetry);
    return { step: 9, name: "telemetry", action: "continue", telemetry };
  }

  // Step 10: PostToolUse Hook
  private async step10_postToolUse(ctx: GovernanceContext, output: unknown): Promise<GovernanceStepResult> {
    if (!this.hooks?.postToolUse) {
      return { step: 10, name: "postToolUse", action: "continue" };
    }

    try {
      const result = await this.hooks.postToolUse(ctx, output);
      if (result.action === "modify" && result.output !== undefined) {
        return { step: 10, name: "postToolUse", action: "modify", output: result.output, reason: result.reason };
      }
      return { step: 10, name: "postToolUse", action: "allow" };
    } catch (error) {
      return {
        step: 10,
        name: "postToolUse",
        action: "continue",
        reason: `Hook error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Step 11: 结构化输出
  private step11_structuredOutput(toolName: string, output: unknown): GovernanceStepResult {
    const structured = {
      tool: toolName,
      result: output,
      timestamp: Date.now(),
    };
    return { step: 11, name: "structuredOutput", action: "continue", output: structured };
  }

  // Step 12: 输出Schema再校验 (Optional)
  private async step12_outputValidation(tool: ToolDefinition, output: unknown): Promise<GovernanceStepResult> {
    if (!tool.outputSchema) {
      return { step: 12, name: "outputValidation", action: "continue" };
    }

    const result = safeValidateOutput(tool.outputSchema, output);
    if (!result.ok) {
      return {
        step: 12,
        name: "outputValidation",
        action: "deny",
        reason: `Output schema validation failed: ${formatValidationError(result)}`,
      };
    }
    return { step: 12, name: "outputValidation", action: "continue" };
  }

  // Step 13: 敏感字段脱敏 (Optional)
  private step13_maskSensitive(toolName: string, output: unknown, ctx: GovernanceContext): GovernanceStepResult {
    if (!ctx.config.maskSensitiveOutputs) {
      return { step: 13, name: "maskSensitive", action: "continue" };
    }

    let masked = output;
    if (typeof output === "string") {
      masked = maskSensitiveString(output);
    } else if (toolName === "bash" || toolName === "run_terminal_cmd") {
      masked = maskCommandOutput(output);
    }

    if (masked !== output) {
      return { step: 13, name: "maskSensitive", action: "modify", output: masked, reason: "Sensitive data masked" };
    }
    return { step: 13, name: "maskSensitive", action: "continue" };
  }

  // Step 14: 压缩/引用 (Optional)
  private step14_compress(output: unknown): GovernanceStepResult {
    const outputStr = JSON.stringify(output);
    if (outputStr.length > 10000) {
      const compressed = {
        $ref: `memory://${Date.now()}`,
        length: outputStr.length,
        preview: outputStr.substring(0, 500),
      };
      return { step: 14, name: "compress", action: "modify", output: compressed, reason: "Output compressed" };
    }
    return { step: 14, name: "compress", action: "continue" };
  }

  private riskLevelToScore(level: RiskLevel | string): number {
    const scoreMap: Record<string, number> = {
      low: 20,
      medium: 50,
      high: 80,
      critical: 100,
    };
    return scoreMap[level] || 50;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateSpanId(): string {
    return `span_${Math.random().toString(36).substring(2, 11)}`;
  }

  private buildErrorResult(
    code: string,
    message: string,
    steps: GovernanceStepResult[],
    startTime: number,
    traceId: string,
    spanId: string
  ): GovernanceResult {
    return {
      status: "error",
      error: {
        code,
        message,
        step: steps[steps.length - 1]?.step,
        recoverable: false,
      },
      steps,
      telemetry: {
        traceId,
        spanId,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

export function formatGovernanceError(result: GovernanceResult): string {
  if (result.status !== "error" && result.status !== "denied") {
    return "";
  }
  const lastStep = result.steps[result.steps.length - 1];
  return `Governance error at step ${lastStep?.step || "?"} (${lastStep?.name}): ${result.error?.message || "Unknown error"}`;
}
