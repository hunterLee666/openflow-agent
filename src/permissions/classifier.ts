export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskScore {
  level: RiskLevel;
  score: number;
  factors: string[];
  reasons: string[];
}

export interface SpeculativeClassifier {
  classify(ctx: ClassifierContext): RiskScore;
}

export interface ClassifierContext {
  tool: string;
  input: Record<string, unknown>;
  cwd: string;
  isReadOnly: boolean;
  isDestructive: boolean;
  isNetworkAccess: boolean;
  isGitCommand: boolean;
}

const RISK_WEIGHTS = {
  isDestructive: 40,
  isNetworkAccess: 25,
  isGitCommand: 15,
  pathTraversal: 20,
  sensitivePath: 25,
  largeData: 10,
  shellInjection: 35,
  privilegeEscalation: 30,
};

const SENSITIVE_PATTERNS = [
  /\.ssh\//,
  /\.aws\//,
  /\.config\//,
  /\/etc\/passwd/,
  /\/etc\/shadow/,
  /\.env$/,
  /\.npmrc$/,
  /\.git\/config$/,
];

const NETWORK_PATTERNS = [
  /^curl\s+/i,
  /^wget\s+/i,
  /^nc\s+/i,
  /^nmap\s+/i,
  /^telnet\s+/i,
  /^ssh\s+/i,
  /^ftp\s+/i,
];

const SHELL_INJECTION_PATTERNS = [
  /;\s*rm\s+/i,
  /;\s*cat\s+/i,
  /\|\s*bash/i,
  /\|\s*sh\b/,
  /\`.*\`/,
  /\$\(.*\)/,
  /&&\s*rm\s+/i,
  /\|\|\s*rm\s+/i,
];

const DESTRUCTIVE_PATTERNS = [
  /^rm\s+-rf\b/,
  /^rm\s+-r\b/,
  /^dd\s+/,
  /^mkfs\b/,
  /^format\b/,
  /^fdisk\b/,
  /:\|:\|:;/,
];

export class DefaultSpeculativeClassifier implements SpeculativeClassifier {
  classify(ctx: ClassifierContext): RiskScore {
    const factors: string[] = [];
    const reasons: string[] = [];
    let score = 0;

    if (ctx.isDestructive) {
      score += RISK_WEIGHTS.isDestructive;
      factors.push("destructive_operation");
      reasons.push("Operation may delete or overwrite data");
    }

    if (ctx.isNetworkAccess) {
      score += RISK_WEIGHTS.isNetworkAccess;
      factors.push("network_access");
      reasons.push("Command accesses external network");
    }

    if (ctx.isGitCommand) {
      score += RISK_WEIGHTS.isGitCommand;
      factors.push("git_operation");
      reasons.push("Modifies version control state");
    }

    if (ctx.tool === "bash" || ctx.tool === "shell") {
      const cmd = String(ctx.input.command || "");

      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(cmd)) {
          score += RISK_WEIGHTS.sensitivePath;
          factors.push("sensitive_path");
          reasons.push(`Access to sensitive path: ${pattern}`);
        }
      }

      for (const pattern of SHELL_INJECTION_PATTERNS) {
        if (pattern.test(cmd)) {
          score += RISK_WEIGHTS.shellInjection;
          factors.push("shell_injection_risk");
          reasons.push(`Potential shell injection detected`);
        }
      }

      for (const pattern of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(cmd)) {
          score += RISK_WEIGHTS.isDestructive;
          factors.push("destructive_command");
          reasons.push(`Destructive command pattern detected`);
        }
      }

      const pathArgs = cmd.match(/['"]?(\/[^\s'"]+)/g);
      if (pathArgs) {
        for (const p of pathArgs) {
          const normalizedPath = p.replace(/['"]/g, "");
          if (normalizedPath.includes("..")) {
            score += RISK_WEIGHTS.pathTraversal;
            factors.push("path_traversal");
            reasons.push("Path contains .. traversal");
          }
        }
      }
    }

    if (ctx.tool === "write" || ctx.tool === "edit" || ctx.tool === "write_file") {
      const filePath = String(ctx.input.path || "");
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(filePath)) {
          score += RISK_WEIGHTS.sensitivePath;
          factors.push("sensitive_path_write");
          reasons.push(`Writing to sensitive path: ${pattern}`);
        }
      }
    }

    if (ctx.isReadOnly) {
      score = Math.floor(score * 0.3);
      factors.push("read_only_operation");
    }

    const level = this.scoreToLevel(score);
    return { level, score, factors: [...new Set(factors)], reasons: [...new Set(reasons)] };
  }

  private scoreToLevel(score: number): RiskLevel {
    if (score >= 70) return "critical";
    if (score >= 40) return "high";
    if (score >= 20) return "medium";
    return "low";
  }
}

export function createClassifierContext(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
  options?: {
    isReadOnly?: boolean;
    isDestructive?: boolean;
    isNetworkAccess?: boolean;
    isGitCommand?: boolean;
  }
): ClassifierContext {
  return {
    tool,
    input,
    cwd,
    isReadOnly: options?.isReadOnly ?? false,
    isDestructive: options?.isDestructive ?? false,
    isNetworkAccess: options?.isNetworkAccess ?? false,
    isGitCommand: options?.isGitCommand ?? false,
  };
}

export function isHighRisk(ctx: ClassifierContext, threshold = 40): boolean {
  const classifier = new DefaultSpeculativeClassifier();
  const result = classifier.classify(ctx);
  return result.score >= threshold;
}

export function shouldRequireConfirmation(ctx: ClassifierContext): boolean {
  const classifier = new DefaultSpeculativeClassifier();
  const result = classifier.classify(ctx);
  return result.level === "high" || result.level === "critical";
}

export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case "low": return "green";
    case "medium": return "yellow";
    case "high": return "orange";
    case "critical": return "red";
  }
}
