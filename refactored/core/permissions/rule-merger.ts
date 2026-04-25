import type { PermissionRule } from "./types.js";
import { PermissionRuleSchema } from "./types.js";
import { z } from "zod";

export interface RuleLayer {
  name: string;
  rules: PermissionRule[];
  priority: number;
}

export interface MergedRules {
  rules: PermissionRule[];
  warnings: string[];
}

export const RuleConfigSchema = z.object({
  version: z.number().optional(),
  rules: z.array(PermissionRuleSchema),
});

export type RuleConfig = z.infer<typeof RuleConfigSchema>;

function actionRank(action: "deny" | "ask" | "allow"): number {
  switch (action) {
    case "deny":
      return 0;
    case "ask":
      return 1;
    case "allow":
      return 2;
  }
}

export function mergeRules(layers: RuleLayer[]): MergedRules {
  const warnings: string[] = [];
  const allRules: PermissionRule[] = [];

  for (const layer of layers) {
    for (const rule of layer.rules) {
      allRules.push({
        ...rule,
        name: `[${layer.name}] ${rule.name}`,
      });
    }
  }

  const sorted = allRules.sort((a, b) => {
    const rankDiff = actionRank(a.action) - actionRank(b.action);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return (a.priority || 0) - (b.priority || 0);
  });

  const denyRules = sorted.filter((r) => r.action === "deny");
  const askRules = sorted.filter((r) => r.action === "ask");
  const allowRules = sorted.filter((r) => r.action === "allow");

  for (let i = 0; i < allowRules.length; i++) {
    for (let j = 0; j < denyRules.length; j++) {
      if (
        allowRules[i].tool === denyRules[j].tool &&
        allowRules[i].pattern === denyRules[j].pattern
      ) {
        warnings.push(
          `规则冲突: allow "${allowRules[i].name}" 与 deny "${denyRules[j].name}" 匹配相同模式，deny 优先生效`
        );
      }
    }
  }

  return {
    rules: sorted,
    warnings,
  };
}

export function parseRuleConfig(config: unknown): PermissionRule[] {
  try {
    const parsed = RuleConfigSchema.parse(config);
    return parsed.rules;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `规则配置解析失败: ${error.errors.map((e) => e.message).join("; ")}`
      );
    }
    throw error;
  }
}

export function createDefaultRules(): PermissionRule[] {
  return [
    {
      name: "block-remote-download",
      action: "deny",
      tool: "Bash",
      pattern: "(curl|wget)\\b",
      note: "默认禁 curl/wget；用私有 registry 与缓存",
    },
    {
      name: "block-parent-write",
      action: "deny",
      tool: "Edit",
      pathRegex: "^\\.\\./",
      note: "禁止写父目录",
    },
    {
      name: "block-dot-git-direct",
      action: "deny",
      tool: "Edit",
      pathRegex: "(^|/)\\.git(/|$)",
      note: "安全护栏与专用工具处理",
    },
    {
      name: "block-dot-claude",
      action: "deny",
      tool: "Edit",
      pathRegex: "(^|/)\\.claude(/|$)",
      note: "禁止修改 Claude 配置",
    },
    {
      name: "block-shell-config",
      action: "deny",
      tool: "Edit",
      pathRegex: "(\\.bashrc|\\.zshrc|\\.bash_profile|\\.profile)$",
      note: "禁止修改 Shell 配置",
    },
    {
      name: "block-ssh-dir",
      action: "deny",
      tool: "Edit",
      pathRegex: "(^|/)\\.ssh(/|$)",
      note: "禁止修改 SSH 配置",
    },
    {
      name: "block-env-file",
      action: "deny",
      tool: "Edit",
      pathRegex: "(^|/)\\.env$",
      note: "禁止修改环境变量文件",
    },
    {
      name: "ask-install-scripts",
      action: "ask",
      tool: "Bash",
      pattern: "(npm|pnpm|yarn)\\s+(i|install)\\b",
    },
    {
      name: "ask-git-force",
      action: "ask",
      tool: "Bash",
      pattern: "git\\s+(push\\s+--force|reset\\s+--hard|clean)",
    },
    {
      name: "allow-git-status",
      action: "allow",
      tool: "Bash",
      pattern: "^git\\s+status\\b",
    },
    {
      name: "allow-git-log",
      action: "allow",
      tool: "Bash",
      pattern: "^git\\s+log\\b",
    },
    {
      name: "allow-git-diff",
      action: "allow",
      tool: "Bash",
      pattern: "^git\\s+diff\\b",
    },
    {
      name: "allow-ls",
      action: "allow",
      tool: "Bash",
      pattern: "^(ls|ll|la)\\b",
    },
    {
      name: "allow-cat",
      action: "allow",
      tool: "Bash",
      pattern: "^cat\\b",
    },
    {
      name: "allow-echo",
      action: "allow",
      tool: "Bash",
      pattern: "^echo\\b",
    },
    {
      name: "allow-pwd",
      action: "allow",
      tool: "Bash",
      pattern: "^pwd\\b",
    },
    {
      name: "allow-grep",
      action: "allow",
      tool: "Bash",
      pattern: "^grep\\b",
    },
    {
      name: "allow-find",
      action: "allow",
      tool: "Bash",
      pattern: "^find\\b",
    },
  ];
}

export function createEnterpriseRules(): PermissionRule[] {
  return [
    {
      name: "enterprise-block-sudo",
      action: "deny",
      tool: "Bash",
      pattern: "^sudo\\b",
      note: "企业策略: 禁止 sudo",
    },
    {
      name: "enterprise-block-docker",
      action: "deny",
      tool: "Bash",
      pattern: "^docker\\b",
      note: "企业策略: 禁止 Docker 命令",
    },
    {
      name: "enterprise-block-kubectl",
      action: "deny",
      tool: "Bash",
      pattern: "^kubectl\\b",
      note: "企业策略: 禁止 kubectl 命令",
    },
    {
      name: "enterprise-block-chmod-recursive",
      action: "deny",
      tool: "Bash",
      pattern: "chmod\\s+-R",
      note: "企业策略: 禁止递归权限修改",
    },
    {
      name: "enterprise-block-chown-recursive",
      action: "deny",
      tool: "Bash",
      pattern: "chown\\s+-R",
      note: "企业策略: 禁止递归所有者修改",
    },
  ];
}

export function createAllowlistFromAudit(
  frequentlyAskedCommands: string[],
  reviewStatus: "approved" | "rejected"
): PermissionRule[] {
  if (reviewStatus === "rejected") {
    return [];
  }

  return frequentlyAskedCommands.map((cmd) => ({
    name: `allowlist-${cmd.replace(/\s+/g, "-").substring(0, 30)}`,
    action: "allow",
    tool: "Bash",
    pattern: `^${escapeRegex(cmd)}\\b`,
    note: "从审计日志生成的 allowlist",
  }));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateRules(rules: PermissionRule[]): string[] {
  const warnings: string[] = [];

  for (const rule of rules) {
    if (!rule.name) {
      warnings.push("规则缺少 name 字段");
    }

    if (rule.pattern) {
      try {
        new RegExp(rule.pattern);
      } catch {
        warnings.push(`规则 "${rule.name}" 的 pattern 不是有效的正则表达式`);
      }
    }

    if (rule.pathRegex) {
      try {
        new RegExp(rule.pathRegex);
      } catch {
        warnings.push(`规则 "${rule.name}" 的 pathRegex 不是有效的正则表达式`);
      }
    }
  }

  const denyRules = rules.filter((r) => r.action === "deny");
  const allowRules = rules.filter((r) => r.action === "allow");

  for (const allowRule of allowRules) {
    for (const denyRule of denyRules) {
      if (
        allowRule.tool === denyRule.tool &&
        allowRule.pattern === denyRule.pattern
      ) {
        warnings.push(
          `规则冲突: "${allowRule.name}" (allow) 与 "${denyRule.name}" (deny) 匹配相同模式`
        );
      }
    }
  }

  return warnings;
}
