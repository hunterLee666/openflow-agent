import type {
  PermissionRequest,
  PermissionResult,
  PermissionRule,
  AuditLogEntry,
} from "./types.js";
import {
  PermissionMode,
  PermissionDecision,
  PipelineStep,
  FailClosedReason,
  createAuditLog,
} from "./types.js";
import { analyzeBashCommand } from "./bash-analyzer.js";
import { normalize, resolve, relative } from "node:path";

const SAFE_GUARD_PATHS = [
  ".git",
  ".claude",
  ".openflow",
  ".bashrc",
  ".zshrc",
  ".bash_profile",
  ".profile",
  ".ssh",
  ".env",
  "node_modules/.cache",
];

const DANGEROUS_REDIRECT_PATTERNS = [
  /^\.\.\//,
  /^\/etc\//,
  /^\/usr\//,
  /^\/var\//,
  /^\/root\//,
  /^\/home\/(?!.*\/project)/,
];

export class PermissionPipeline {
  private auditLog: AuditLogEntry[] = [];

  async evaluate(request: PermissionRequest): Promise<PermissionResult> {
    try {
      if (request.mode === PermissionMode.BypassPermissions) {
        return this.allow(PipelineStep.SafetyGuardrails, "bypass mode enabled");
      }

      if (request.mode === PermissionMode.Plan) {
        return this.evaluatePlanMode(request);
      }

      if (request.mode === PermissionMode.DontAsk) {
        return this.evaluateDontAskMode(request);
      }

      const step1 = await this.step1ToolDeny(request);
      if (step1.decision === PermissionDecision.Deny) {
        return step1;
      }

      const step2 = await this.step2ToolAsk(request);
      if (step2.decision === PermissionDecision.Ask || step2.decision === PermissionDecision.Deny) {
        return step2;
      }

      const step3 = await this.step3ToolSpecificCheck(request);
      if (step3.decision === PermissionDecision.Deny) {
        return step3;
      }

      const step4 = await this.step4ToolImplementationReject(request);
      if (step4.decision === PermissionDecision.Deny) {
        return step4;
      }

      const step5 = await this.step5UserInteraction(request);
      if (step5.decision === PermissionDecision.Ask) {
        return step5;
      }

      const step6 = await this.step6ContentSpecificAsk(request);
      if (step6.decision === PermissionDecision.Ask) {
        return step6;
      }

      const step7 = await this.step7SafetyGuardrails(request);
      return step7;
    } catch (error) {
      return this.failClosed(
        request,
        FailClosedReason.GeneralUncertainty,
        error instanceof Error ? error.message : "unknown error"
      );
    }
  }

  private evaluatePlanMode(request: PermissionRequest): PermissionResult {
    const readOnlyTools = [
      "Read", "Glob", "Grep", "LS", "WebFetch", "WebSearch",
      "git_status", "git_diff", "git_log", "git_branch",
      "ImageAnalysis", "AudioAnalysis", "VideoAnalysis",
      "DatabaseQuery", "DatabaseSchema", "LintCheck", "FormatCheck",
      "TypeCheck", "GetDiagnostics", "RunTests", "ToolSearch",
    ];

    if (readOnlyTools.includes(request.toolName)) {
      return this.allow(PipelineStep.ToolDeny, "plan mode read-only tool");
    }

    return {
      decision: PermissionDecision.Deny,
      step: PipelineStep.ToolDeny,
      reason: "Plan 模式仅允许只读操作",
      auditLog: createAuditLog(
        request.toolName,
        request.mode,
        PermissionDecision.Deny,
        PipelineStep.ToolDeny,
        "plan_mode_write_attempt"
      ),
    };
  }

  private evaluateDontAskMode(request: PermissionRequest): PermissionResult {
    if (!request.preapprovedCommands || request.preapprovedCommands.length === 0) {
      return this.failClosed(
        request,
        FailClosedReason.GeneralUncertainty,
        "dontAsk 模式未配置预批准命令列表"
      );
    }

    const cmd = this.extractCommandFromInput(request.input);
    if (!cmd) {
      return this.failClosed(
        request,
        FailClosedReason.ParseError,
        "无法从输入中提取命令"
      );
    }

    const isPreapproved = request.preapprovedCommands.some(
      (approved) => cmd.startsWith(approved)
    );

    if (isPreapproved) {
      return this.allow(PipelineStep.ToolDeny, "dontAsk preapproved command");
    }

    return {
      decision: PermissionDecision.Deny,
      step: PipelineStep.ToolDeny,
      reason: `命令未在预批准列表中: ${cmd}`,
      auditLog: createAuditLog(
        request.toolName,
        request.mode,
        PermissionDecision.Deny,
        PipelineStep.ToolDeny,
        "dontAsk_not_preapproved",
        request.input
      ),
    };
  }

  private async step1ToolDeny(request: PermissionRequest): Promise<PermissionResult> {
    const denyRuless = request.rules.filter((r) => r.action === "deny");

    for (const rule of denyRuless) {
      if (rule.tool && rule.tool !== request.toolName) {
        continue;
      }

      if (rule.pattern && request.toolName === "Bash") {
        const cmd = this.extractCommandFromInput(request.input);
        if (cmd && new RegExp(rule.pattern, "i").test(cmd)) {
          return {
            decision: PermissionDecision.Deny,
            step: PipelineStep.ToolDeny,
            reason: `deny rule: ${rule.name}${rule.note ? ` - ${rule.note}` : ""}`,
            auditLog: createAuditLog(
              request.toolName,
              request.mode,
              PermissionDecision.Deny,
              PipelineStep.ToolDeny,
              `tool_deny:${rule.name}`,
              request.input
            ),
          };
        }
      }

      if (rule.pathRegex && this.isEditTool(request.toolName)) {
        const path = this.extractPathFromInput(request.input);
        if (path && new RegExp(rule.pathRegex).test(path)) {
          return {
            decision: PermissionDecision.Deny,
            step: PipelineStep.ToolDeny,
            reason: `deny rule: ${rule.name}${rule.note ? ` - ${rule.note}` : ""}`,
            auditLog: createAuditLog(
              request.toolName,
              request.mode,
              PermissionDecision.Deny,
              PipelineStep.ToolDeny,
              `tool_deny:${rule.name}`,
              request.input
            ),
          };
        }
      }
    }

    return this.continue();
  }

  private async step2ToolAsk(request: PermissionRequest): Promise<PermissionResult> {
    const askRules = request.rules.filter((r) => r.action === "ask");

    for (const rule of askRules) {
      if (rule.tool && rule.tool !== request.toolName) {
        continue;
      }

      if (rule.pattern && request.toolName === "Bash") {
        const cmd = this.extractCommandFromInput(request.input);
        if (cmd && new RegExp(rule.pattern, "i").test(cmd)) {
          if (rule.sandboxException && request.sandboxEnabled) {
            return {
              decision: PermissionDecision.Allow,
              step: PipelineStep.ToolAsk,
              reason: `ask rule with sandbox exception: ${rule.name}`,
              requiresSandbox: true,
              auditLog: createAuditLog(
                request.toolName,
                request.mode,
                PermissionDecision.Allow,
                PipelineStep.ToolAsk,
                `tool_ask_sandbox:${rule.name}`,
                request.input
              ),
            };
          }

          return {
            decision: PermissionDecision.Ask,
            step: PipelineStep.ToolAsk,
            reason: `ask rule: ${rule.name}${rule.note ? ` - ${rule.note}` : ""}`,
            auditLog: createAuditLog(
              request.toolName,
              request.mode,
              PermissionDecision.Ask,
              PipelineStep.ToolAsk,
              `tool_ask:${rule.name}`,
              request.input
            ),
          };
        }
      }
    }

    return this.continue();
  }

  private async step3ToolSpecificCheck(request: PermissionRequest): Promise<PermissionResult> {
    if (request.toolName === "Bash") {
      return this.checkBashCommand(request);
    }

    if (this.isEditTool(request.toolName)) {
      return this.checkEditPath(request);
    }

    return this.continue();
  }

  private async step4ToolImplementationReject(request: PermissionRequest): Promise<PermissionResult> {
    const input = request.input as Record<string, unknown>;

    if (!input || typeof input !== "object") {
      return this.failClosed(
        request,
        FailClosedReason.ParseError,
        "工具输入格式错误"
      );
    }

    if (request.toolName === "Bash") {
      const cmd = input.command as string;
      if (!cmd || cmd.trim().length === 0) {
        return {
          decision: PermissionDecision.Deny,
          step: PipelineStep.ToolImplementationReject,
          reason: "命令不能为空",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Deny,
            PipelineStep.ToolImplementationReject,
            "empty_command"
          ),
        };
      }
    }

    if (this.isEditTool(request.toolName)) {
      const path = input.file_path as string;
      if (!path || path.trim().length === 0) {
        return {
          decision: PermissionDecision.Deny,
          step: PipelineStep.ToolImplementationReject,
          reason: "文件路径不能为空",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Deny,
            PipelineStep.ToolImplementationReject,
            "empty_path"
          ),
        };
      }
    }

    return this.continue();
  }

  private async step5UserInteraction(request: PermissionRequest): Promise<PermissionResult> {
    if (request.mode === PermissionMode.AcceptEdits) {
      if (this.isEditTool(request.toolName)) {
        return this.allow(PipelineStep.UserInteraction, "acceptEdits mode");
      }

      if (request.toolName === "Bash") {
        return {
          decision: PermissionDecision.Ask,
          step: PipelineStep.UserInteraction,
          reason: "acceptEdits 模式下命令仍需确认",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Ask,
            PipelineStep.UserInteraction,
            "acceptEdits_bash_ask"
          ),
        };
      }
    }

    if (request.mode === PermissionMode.Default) {
      if (request.toolName === "Bash" || this.isWriteTool(request.toolName)) {
        return {
          decision: PermissionDecision.Ask,
          step: PipelineStep.UserInteraction,
          reason: "Default 模式需要确认",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Ask,
            PipelineStep.UserInteraction,
            "default_mode_ask"
          ),
        };
      }
    }

    if (request.mode === PermissionMode.Auto) {
      return this.continue();
    }

    return this.continue();
  }

  private async step6ContentSpecificAsk(request: PermissionRequest): Promise<PermissionResult> {
    const sensitivePatterns = [
      /AWS_SECRET_ACCESS_KEY/i,
      /AWS_ACCESS_KEY_ID/i,
      /PRIVATE_KEY/i,
      /password\s*=/i,
      /api_key\s*=/i,
      /token\s*=/i,
      /secret\s*=/i,
    ];

    const inputStr = JSON.stringify(request.input);

    for (const pattern of sensitivePatterns) {
      if (pattern.test(inputStr)) {
        return {
          decision: PermissionDecision.Ask,
          step: PipelineStep.ContentSpecificAsk,
          reason: "检测到敏感内容模式",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Ask,
            PipelineStep.ContentSpecificAsk,
            "sensitive_content_detected",
            request.input
          ),
        };
      }
    }

    return this.continue();
  }

  private async step7SafetyGuardrails(request: PermissionRequest): Promise<PermissionResult> {
    if (this.isEditTool(request.toolName)) {
      const path = this.extractPathFromInput(request.input);
      if (path) {
        for (const guardPath of SAFE_GUARD_PATHS) {
          if (path.includes(guardPath)) {
            return {
              decision: PermissionDecision.Deny,
              step: PipelineStep.SafetyGuardrails,
              reason: `安全护栏: 禁止修改 ${guardPath}`,
              auditLog: createAuditLog(
                request.toolName,
                request.mode,
                PermissionDecision.Deny,
                PipelineStep.SafetyGuardrails,
                `guardrail:${guardPath}`,
                request.input
              ),
            };
          }
        }
      }
    }

    if (request.toolName === "Bash") {
      const cmd = this.extractCommandFromInput(request.input);
      if (cmd) {
        const guardPatterns = [
          /\.git\s/,
          /\.claude\s/,
          /\.bashrc/,
          /\.zshrc/,
          /\.ssh\//,
        ];

        for (const pattern of guardPatterns) {
          if (pattern.test(cmd)) {
            return {
              decision: PermissionDecision.Ask,
              step: PipelineStep.SafetyGuardrails,
              reason: `安全护栏: 检测到敏感路径访问`,
              auditLog: createAuditLog(
                request.toolName,
                request.mode,
                PermissionDecision.Ask,
                PipelineStep.SafetyGuardrails,
                "guardrail_sensitive_path",
                request.input
              ),
            };
          }
        }
      }
    }

    return this.allow(PipelineStep.SafetyGuardrails, "passed all checks");
  }

  private checkBashCommand(request: PermissionRequest): PermissionResult {
    const cmd = this.extractCommandFromInput(request.input);
    if (!cmd) {
      return this.failClosed(
        request,
        FailClosedReason.ParseError,
        "无法提取 Bash 命令"
      );
    }

    try {
      const analysis = analyzeBashCommand(cmd);

      if (analysis.hasDownloadPipeToShell) {
        return {
          decision: PermissionDecision.Deny,
          step: PipelineStep.ToolSpecificCheck,
          reason: "检测到下载管道到 Shell 执行 (如 curl | bash)",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Deny,
            PipelineStep.ToolSpecificCheck,
            "download_pipe_shell",
            request.input
          ),
        };
      }

      if (analysis.riskLevel === "critical") {
        return {
          decision: PermissionDecision.Deny,
          step: PipelineStep.ToolSpecificCheck,
          reason: `命令风险极高: ${analysis.riskReasons.join(", ")}`,
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Deny,
            PipelineStep.ToolSpecificCheck,
            `critical_risk:${analysis.riskReasons.join(";")}`,
            request.input
          ),
        };
      }

      if (analysis.riskLevel === "high") {
        return {
          decision: PermissionDecision.Ask,
          step: PipelineStep.ToolSpecificCheck,
          reason: `命令风险高: ${analysis.riskReasons.join(", ")}`,
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Ask,
            PipelineStep.ToolSpecificCheck,
            `high_risk:${analysis.riskReasons.join(";")}`,
            request.input
          ),
        };
      }

      return this.continue();
    } catch (error) {
      return this.failClosed(
        request,
        FailClosedReason.ASTAnalysisFailed,
        error instanceof Error ? error.message : "AST 分析失败"
      );
    }
  }

  private checkEditPath(request: PermissionRequest): PermissionResult {
    const path = this.extractPathFromInput(request.input);
    if (!path) {
      return this.failClosed(
        request,
        FailClosedReason.PathNormalizationFailed,
        "无法提取文件路径"
      );
    }

    const normalizedPath = normalize(path);

    if (normalizedPath.startsWith("..")) {
      return {
        decision: PermissionDecision.Deny,
        step: PipelineStep.ToolSpecificCheck,
        reason: "禁止写入父目录 (../)",
        auditLog: createAuditLog(
          request.toolName,
          request.mode,
          PermissionDecision.Deny,
          PipelineStep.ToolSpecificCheck,
          "parent_directory_write",
          request.input
        ),
      };
    }

    if (request.projectRoot) {
      const resolvedPath = resolve(request.projectRoot, path);
      const relativePath = relative(request.projectRoot, resolvedPath);

      if (relativePath.startsWith("..")) {
        return {
          decision: PermissionDecision.Deny,
          step: PipelineStep.ToolSpecificCheck,
          reason: "禁止写入项目目录外",
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Deny,
            PipelineStep.ToolSpecificCheck,
            "outside_project_write",
            request.input
          ),
        };
      }
    }

    for (const pattern of DANGEROUS_REDIRECT_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        return {
          decision: PermissionDecision.Deny,
          step: PipelineStep.ToolSpecificCheck,
          reason: `危险路径: ${normalizedPath}`,
          auditLog: createAuditLog(
            request.toolName,
            request.mode,
            PermissionDecision.Deny,
            PipelineStep.ToolSpecificCheck,
            `dangerous_path:${normalizedPath}`,
            request.input
          ),
        };
      }
    }

    return this.continue();
  }

  private failClosed(
    request: PermissionRequest,
    reason: FailClosedReason,
    detail: string
  ): PermissionResult {
    return {
      decision: PermissionDecision.Deny,
      step: PipelineStep.ToolImplementationReject,
      reason: `Fail-closed: ${reason} - ${detail}`,
      auditLog: createAuditLog(
        request.toolName,
        request.mode,
        PermissionDecision.Deny,
        PipelineStep.ToolImplementationReject,
        `fail_closed:${reason}`,
        request.input
      ),
    };
  }

  private allow(step: PipelineStep, reason: string): PermissionResult {
    return {
      decision: PermissionDecision.Allow,
      step,
      reason,
    };
  }

  private continue(): PermissionResult {
    return {
      decision: PermissionDecision.Allow,
      step: PipelineStep.ToolDeny,
      reason: "continue",
    };
  }

  private isEditTool(toolName: string): boolean {
    return ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName);
  }

  private isWriteTool(toolName: string): boolean {
    return this.isEditTool(toolName) || toolName === "Bash";
  }

  private extractCommandFromInput(input: unknown): string | null {
    if (!input || typeof input !== "object") {
      return null;
    }

    const obj = input as Record<string, unknown>;
    return (obj.command as string) || null;
  }

  private extractPathFromInput(input: unknown): string | null {
    if (!input || typeof input !== "object") {
      return null;
    }

    const obj = input as Record<string, unknown>;
    return (obj.file_path as string) || (obj.path as string) || null;
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  clearAuditLog(): void {
    this.auditLog = [];
  }
}

export function createPermissionPipeline(): PermissionPipeline {
  return new PermissionPipeline();
}
