import type { PermissionRequest, PermissionResult, PermissionRule } from "./types.js";
import { PermissionMode, PermissionDecision } from "./types.js";
import { createPermissionPipeline } from "./permission-pipeline.js";
import { mergeRules, createDefaultRules, createEnterpriseRules, type RuleLayer } from "./rule-merger.js";
import { createSandboxExecutor, type SandboxConfig } from "./sandbox-executor.js";
import type { OpenFlowSettings } from "../runtime/layered-config.js";
import { z } from "zod";

export const PermissionSystemConfigSchema = z.object({
  mode: z.nativeEnum(PermissionMode),
  rules: z.array(z.custom<PermissionRule>()).optional(),
  preapprovedCommands: z.array(z.string()).optional(),
  sandbox: z.custom<SandboxConfig>().optional(),
  projectRoot: z.string(),
  sessionId: z.string().optional(),
});

export type PermissionSystemConfig = z.infer<typeof PermissionSystemConfigSchema>;

export const PermissionCheckInputSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
});

export type PermissionCheckInput = z.infer<typeof PermissionCheckInputSchema>;

export class PermissionSystem {
  private pipeline = createPermissionPipeline();
  private sandboxExecutor;
  private config: PermissionSystemConfig;
  private mergedRules: PermissionRule[];

  constructor(config: PermissionSystemConfig) {
    this.config = config;

    const defaultRules = createDefaultRules();
    const enterpriseRules = createEnterpriseRules();

    const layers: RuleLayer[] = [
      { name: "enterprise", rules: enterpriseRules, priority: 0 },
      { name: "default", rules: defaultRules, priority: 1 },
    ];

    if (config.rules && config.rules.length > 0) {
      layers.push({ name: "custom", rules: config.rules, priority: 2 });
    }

    const merged = mergeRules(layers);
    this.mergedRules = merged.rules;

    this.sandboxExecutor = createSandboxExecutor(config.sandbox);
  }

  async initialize(): Promise<void> {
    if (this.config.sandbox?.enabled) {
      await this.sandboxExecutor.initialize();
    }
  }

  async checkPermission(input: PermissionCheckInput): Promise<PermissionResult> {
    const request: PermissionRequest = {
      toolName: input.toolName,
      input: input.input,
      mode: this.config.mode,
      projectRoot: this.config.projectRoot,
      rules: this.mergedRules,
      preapprovedCommands: this.config.preapprovedCommands,
      sandboxEnabled: this.config.sandbox?.enabled,
      sessionId: this.config.sessionId,
    };

    return this.pipeline.evaluate(request);
  }

  async executeWithPermission(
    toolName: string,
    input: unknown,
    handler: () => Promise<unknown>
  ): Promise<unknown> {
    const result = await this.checkPermission({ toolName, input });

    if (result.decision === PermissionDecision.Deny) {
      throw new Error(
        `权限拒绝: ${result.reason || "未知原因"} [步骤 ${result.step}]`
      );
    }

    if (result.decision === PermissionDecision.Ask) {
      throw new Error(
        `需要用户确认: ${result.reason || "未知原因"} [步骤 ${result.step}]`
      );
    }

    if (result.requiresSandbox && this.config.sandbox?.enabled) {
      if (toolName === "Bash") {
        const cmd = (input as Record<string, unknown>).command as string;
        if (cmd) {
          return this.sandboxExecutor.executeInSandbox(cmd);
        }
      }
    }

    return handler();
  }

  async updateMode(mode: PermissionMode): Promise<void> {
    this.config.mode = mode;
  }

  async updateRules(rules: PermissionRule[]): Promise<void> {
    const defaultRules = createDefaultRules();
    const enterpriseRules = createEnterpriseRules();

    const layers: RuleLayer[] = [
      { name: "enterprise", rules: enterpriseRules, priority: 0 },
      { name: "default", rules: defaultRules, priority: 1 },
      { name: "custom", rules, priority: 2 },
    ];

    const merged = mergeRules(layers);
    this.mergedRules = merged.rules;
  }

  getAuditLog() {
    return this.pipeline.getAuditLog();
  }

  async shutdown(): Promise<void> {
    await this.sandboxExecutor.cleanup();
  }

  static fromSettings(
    settings: OpenFlowSettings,
    projectRoot: string,
    sessionId?: string
  ): PermissionSystem {
    const modeStr = settings.permissions?.defaultMode || "default";
    const mode = PermissionMode[modeStr as keyof typeof PermissionMode] || PermissionMode.Default;

    const rules: PermissionRule[] = [];
    if (settings.permissions?.rules) {
      for (const rule of settings.permissions.rules) {
        rules.push({
          name: rule.name,
          action: rule.action,
          tool: rule.tool,
          pattern: rule.pattern,
          pathRegex: rule.pathRegex,
          note: rule.note,
        });
      }
    }

    const preapprovedCommands = settings.permissions?.allow;

    const sandboxEnabled = settings.permissions?.sandbox ?? false;

    return new PermissionSystem({
      mode,
      rules,
      preapprovedCommands,
      sandbox: {
        enabled: sandboxEnabled,
        profile: {
          allowedPaths: [projectRoot],
          readOnlyPaths: ["/usr/bin", "/usr/lib", "/bin", "/lib"],
          deniedPaths: ["/etc/shadow", "/etc/passwd", "/root"],
          allowNetwork: false,
        },
      },
      projectRoot,
      sessionId,
    });
  }
}

export function createPermissionSystem(config: PermissionSystemConfig): PermissionSystem {
  return new PermissionSystem(config);
}
