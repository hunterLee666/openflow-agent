import { createHash } from "node:crypto";
import { z } from "zod";

export interface DesensitizationRule {
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  priority: number;
  description: string;
}

export const DesensitizationConfigSchema = z.object({
  enableDesensitization: z.boolean(),
  enableHashReplacement: z.boolean(),
  customRules: z.array(z.any()),
  maxDesensitizationLength: z.number(),
  logDesensitization: z.boolean(),
});

export type DesensitizationConfig = z.infer<typeof DesensitizationConfigSchema>;

export const DesensitizationStatsSchema = z.object({
  totalRulesApplied: z.number(),
  sensitiveItemsFound: z.number(),
  originalLength: z.number(),
  desensitizedLength: z.number(),
  processingTimeMs: z.number(),
});

export type DesensitizationStats = z.infer<typeof DesensitizationStatsSchema>;

export const DesensitizationResultSchema = z.object({
  content: z.string(),
  stats: DesensitizationStatsSchema,
});

export type DesensitizationResult = z.infer<typeof DesensitizationResultSchema>;

const DEFAULT_CONFIG: DesensitizationConfig = {
  enableDesensitization: true,
  enableHashReplacement: true,
  customRules: [],
  maxDesensitizationLength: 100000,
  logDesensitization: false,
};

const SENSITIVE_PATTERNS: DesensitizationRule[] = [
  {
    pattern: /(sk-[a-zA-Z0-9]{20,})/g,
    replacement: "[API_KEY_REDACTED]",
    priority: 10,
    description: "OpenAI API 密钥",
  },
  {
    pattern: /(ghp_[a-zA-Z0-9]{36})/g,
    replacement: "[GITHUB_TOKEN_REDACTED]",
    priority: 10,
    description: "GitHub Personal Access Token",
  },
  {
    pattern: /(xoxb-[a-zA-Z0-9-]+)/g,
    replacement: "[SLACK_TOKEN_REDACTED]",
    priority: 10,
    description: "Slack Bot Token",
  },
  {
    pattern: /(AKIA[0-9A-Z]{16})/g,
    replacement: "[AWS_ACCESS_KEY_REDACTED]",
    priority: 10,
    description: "AWS Access Key",
  },
  {
    pattern: /(["']?[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}["']?)/g,
    replacement: (match: string) => {
      const parts = match.split("@");
      if (parts.length === 2) {
        const localPart = parts[0].replace(/["']/g, "");
        const domain = parts[1].replace(/["']/g, "");
        const maskedLocal = localPart.charAt(0) + "***" + localPart.charAt(localPart.length - 1);
        return `"${maskedLocal}@${domain}"`;
      }
      return "[EMAIL_REDACTED]";
    },
    priority: 8,
    description: "电子邮件地址",
  },
  {
    pattern: /(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/g,
    replacement: "[IP_ADDRESS_REDACTED]",
    priority: 7,
    description: "IP 地址",
  },
  {
    pattern: /(password\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: "$1[PASSWORD_REDACTED]",
    priority: 9,
    description: "密码字段",
  },
  {
    pattern: /(secret\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: "$1[SECRET_REDACTED]",
    priority: 9,
    description: "密钥字段",
  },
  {
    pattern: /(token\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: "$1[TOKEN_REDACTED]",
    priority: 9,
    description: "Token 字段",
  },
  {
    pattern: /(api[_-]?key\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: "$1[API_KEY_REDACTED]",
    priority: 9,
    description: "API Key 字段",
  },
  {
    pattern: /(access[_-]?token\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: "$1[ACCESS_TOKEN_REDACTED]",
    priority: 9,
    description: "Access Token 字段",
  },
  {
    pattern: /(private[_-]?key\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: "$1[PRIVATE_KEY_REDACTED]",
    priority: 9,
    description: "Private Key 字段",
  },
  {
    pattern: /(-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----)/g,
    replacement: "[PRIVATE_KEY_BLOCK_REDACTED]",
    priority: 10,
    description: "PEM 格式私钥",
  },
  {
    pattern: /(-----BEGIN\s+CERTIFICATE-----)/g,
    replacement: "[CERTIFICATE_BLOCK_REDACTED]",
    priority: 8,
    description: "PEM 格式证书",
  },
  {
    pattern: /(ssh-rsa\s+[A-Za-z0-9+/=]+)/g,
    replacement: "[SSH_PUBLIC_KEY_REDACTED]",
    priority: 8,
    description: "SSH 公钥",
  },
  {
    pattern: /(mongodb(\+srv)?:\/\/[^\s"']+)/g,
    replacement: "[MONGODB_URI_REDACTED]",
    priority: 10,
    description: "MongoDB 连接字符串",
  },
  {
    pattern: /(postgres(\+psycopg2)?:\/\/[^\s"']+)/g,
    replacement: "[POSTGRES_URI_REDACTED]",
    priority: 10,
    description: "PostgreSQL 连接字符串",
  },
  {
    pattern: /(mysql:\/\/[^\s"']+)/g,
    replacement: "[MYSQL_URI_REDACTED]",
    priority: 10,
    description: "MySQL 连接字符串",
  },
  {
    pattern: /(redis(:\/\/|s:\/\/)[^\s"']+)/g,
    replacement: "[REDIS_URI_REDACTED]",
    priority: 10,
    description: "Redis 连接字符串",
  },
  {
    pattern: /(https?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@[^\s"']+)/g,
    replacement: "[URL_WITH_CREDENTIALS_REDACTED]",
    priority: 10,
    description: "包含凭据的 URL",
  },
  {
    pattern: /(user(?:name)?\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
    replacement: (match: string, prefix: string, value: string) => {
      if (value.length <= 2) return match;
      if (["root", "admin", "user", "guest", "test", "default", "postgres", "mysql"].includes(value.toLowerCase())) {
        return match;
      }
      return `${prefix}[USERNAME_REDACTED]`;
    },
    priority: 6,
    description: "用户名字段",
  },
  {
    pattern: /(homeDir\s*[:=]\s*["']?)(\/[^\s"']+)/gi,
    replacement: "$1[HOME_DIR_REDACTED]",
    priority: 5,
    description: "用户主目录路径",
  },
  {
    pattern: /(hostname\s*[:=]\s*["']?)([^\s"'}]+\.local|[^\s"'}]+\.com|[^\s"'}]+\.net)/gi,
    replacement: "$1[HOSTNAME_REDACTED]",
    priority: 5,
    description: "主机名",
  },
];

export class ExplorationDesensitizer {
  private config: DesensitizationConfig;
  private rules: DesensitizationRule[];
  private stats: DesensitizationStats;

  constructor(config?: Partial<DesensitizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = [...SENSITIVE_PATTERNS, ...this.config.customRules].sort((a, b) => b.priority - a.priority);
    this.stats = {
      totalRulesApplied: 0,
      sensitiveItemsFound: 0,
      originalLength: 0,
      desensitizedLength: 0,
      processingTimeMs: 0,
    };
  }

  desensitize(content: string): DesensitizationResult {
    const startTime = Date.now();

    if (!this.config.enableDesensitization) {
      return {
        content,
        stats: {
          totalRulesApplied: 0,
          sensitiveItemsFound: 0,
          originalLength: content.length,
          desensitizedLength: content.length,
          processingTimeMs: 0,
        },
      };
    }

    if (content.length > this.config.maxDesensitizationLength) {
      content = content.slice(0, this.config.maxDesensitizationLength) + "\n... [内容过长已截断]";
    }

    this.stats = {
      totalRulesApplied: 0,
      sensitiveItemsFound: 0,
      originalLength: content.length,
      desensitizedLength: 0,
      processingTimeMs: 0,
    };

    let result = content;

    for (const rule of this.rules) {
      const matches = result.match(rule.pattern);
      if (matches && matches.length > 0) {
        this.stats.sensitiveItemsFound += matches.length;

        if (typeof rule.replacement === "string") {
          result = result.replace(rule.pattern, rule.replacement);
        } else {
          result = result.replace(rule.pattern, rule.replacement);
        }

        this.stats.totalRulesApplied++;

        if (this.config.logDesensitization) {
          console.log(`[Desensitizer] Applied rule: ${rule.description} (${matches.length} matches)`);
        }
      }
    }

    if (this.config.enableHashReplacement) {
      result = this.replaceWithHashes(result);
    }

    this.stats.desensitizedLength = result.length;
    this.stats.processingTimeMs = Date.now() - startTime;

    return {
      content: result,
      stats: { ...this.stats },
    };
  }

  desensitizeEnvironmentVariables(env: Record<string, string>): Record<string, string> {
    const sensitiveEnvKeys = [
      "PASSWORD",
      "SECRET",
      "TOKEN",
      "API_KEY",
      "APIKEY",
      "ACCESS_KEY",
      "PRIVATE_KEY",
      "CREDENTIAL",
      "AUTH",
      "SESSION",
      "COOKIE",
      "DATABASE_URL",
      "MONGO",
      "POSTGRES",
      "MYSQL",
      "REDIS",
      "AWS",
      "GCP",
      "AZURE",
      "GITHUB",
      "GITLAB",
      "SLACK",
      "DISCORD",
      "TELEGRAM",
      "OPENAI",
      "ANTHROPIC",
      "GOOGLE",
      "FACEBOOK",
      "TWITTER",
    ];

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      const upperKey = key.toUpperCase();
      const isSensitive = sensitiveEnvKeys.some((sensitive) => upperKey.includes(sensitive));

      if (isSensitive) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  desensitizeGitRemote(remote: string): string {
    if (!remote) return remote;

    const patterns = [
      /(https?:\/\/)([^:]+):([^@]+)@/g,
      /(git@)([^:]+):/g,
    ];

    let result = remote;

    for (const pattern of patterns) {
      result = result.replace(pattern, (match, prefix, host, credentials) => {
        if (credentials) {
          return `${prefix}[CREDENTIALS]@`;
        }
        return match;
      });
    }

    return result;
  }

  desensitizeUserInfo(userInfo: { username: string; homeDir: string }): { username: string; homeDir: string } {
    return {
      username: userInfo.username.length > 2 ? userInfo.username.charAt(0) + "***" : userInfo.username,
      homeDir: "[HOME_DIR_REDACTED]",
    };
  }

  getStats(): DesensitizationStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalRulesApplied: 0,
      sensitiveItemsFound: 0,
      originalLength: 0,
      desensitizedLength: 0,
      processingTimeMs: 0,
    };
  }

  addRule(rule: DesensitizationRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(pattern: RegExp): void {
    this.rules = this.rules.filter((r) => r.pattern.source !== pattern.source);
  }

  getRules(): DesensitizationRule[] {
    return [...this.rules];
  }

  private replaceWithHashes(content: string): string {
    const hashPatterns = [
      /(sk-[a-zA-Z0-9]{20,})/g,
      /(ghp_[a-zA-Z0-9]{36})/g,
      /(AKIA[0-9A-Z]{16})/g,
    ];

    let result = content;

    for (const pattern of hashPatterns) {
      result = result.replace(pattern, (match) => {
        const hash = createHash("sha256").update(match).digest("hex").slice(0, 16);
        return `[HASH:${hash}]`;
      });
    }

    return result;
  }
}

export function createExplorationDesensitizer(config?: Partial<DesensitizationConfig>): ExplorationDesensitizer {
  return new ExplorationDesensitizer(config);
}
