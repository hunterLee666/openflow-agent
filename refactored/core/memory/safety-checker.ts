import { SafetyLevel, SafetyFlag } from "./intent-recognizer.js";
import type { IntentRecognitionResult } from "./intent-recognizer.js";

export interface SafetyCheckResult {
  level: SafetyLevel;
  flags: SafetyFlag[];
  blockMessage?: string;
  warnings: string[];
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

export interface SafetyPolicy {
  blockedPatterns: string[];
  warnedPatterns: string[];
  allowedPatterns: string[];
  maxDestructiveOperations: number;
  enableLLMCheck: boolean;
  strictMode: boolean;
}

const DEFAULT_BLOCKED_PATTERNS = [
  "^rm -rf /$",
  "^rm -rf /\\*$",
  "^sudo rm -rf",
  "format c:",
  "drop database",
  "drop table",
  "delete from",
  "truncate table",
  "shutdown -r",
  "shutdown -h",
  "reboot",
  "kill -9",
  "chmod 777",
  "chown root",
  "passwd",
  "shadow",
  "etc/passwd",
  "etc/shadow",
  "curl.*\\|.*sh",
  "wget.*\\|.*bash",
  "eval\\(",
  "exec\\(",
  "system\\(",
  "__import__",
  "os\\.system",
  "subprocess\\.call",
  "subprocess\\.run",
];

const DEFAULT_WARNED_PATTERNS = [
  "rm ",
  "rmdir",
  "del ",
  "mv ",
  "chmod",
  "chown",
  "sudo",
  "npm install -g",
  "pip install",
  "apt-get install",
  "brew install",
  "yarn add",
  "npm uninstall",
  "pip uninstall",
  "git push --force",
  "git reset --hard",
  "git clean",
  "docker rm",
  "docker rmi",
  "kubectl delete",
  "terraform destroy",
];

const DEFAULT_ALLOWED_PATTERNS = [
  "ls",
  "cat",
  "echo",
  "pwd",
  "whoami",
  "date",
  "uname",
  "df",
  "du",
  "top",
  "ps",
  "grep",
  "find",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "diff",
  "git status",
  "git log",
  "git diff",
  "git branch",
  "npm list",
  "npm run",
  "npm test",
  "npm run build",
  "npm run lint",
  "python",
  "node",
  "ts-node",
  "deno",
  "bun",
];

const DEFAULT_POLICY: SafetyPolicy = {
  blockedPatterns: DEFAULT_BLOCKED_PATTERNS,
  warnedPatterns: DEFAULT_WARNED_PATTERNS,
  allowedPatterns: DEFAULT_ALLOWED_PATTERNS,
  maxDestructiveOperations: 3,
  enableLLMCheck: true,
  strictMode: false,
};

export class SafetyChecker {
  private config: SafetyPolicy;
  private llmClient: any;
  private destructiveOperationCount = 0;
  private sessionStartTime: number;

  constructor(config?: Partial<SafetyPolicy>) {
    this.config = { ...DEFAULT_POLICY, ...config };
    this.sessionStartTime = Date.now();
  }

  setLLMClient(client: any): void {
    this.llmClient = client;
  }

  async check(
    userInput: string,
    intentResult: IntentRecognitionResult
  ): Promise<SafetyCheckResult> {
    const result: SafetyCheckResult = {
      level: SafetyLevel.SAFE,
      flags: [SafetyFlag.NONE],
      warnings: [],
      requiresConfirmation: false,
    };

    const lowerInput = userInput.toLowerCase();

    for (const pattern of this.config.blockedPatterns) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(lowerInput)) {
        result.level = SafetyLevel.BLOCKED;
        result.flags = [SafetyFlag.DESTRUCTIVE_OPERATION];
        result.blockMessage = `此操作被安全策略阻止: 检测到危险模式 "${pattern}"`;
        return result;
      }
    }

    const detectedFlags: SafetyFlag[] = [];
    const warnings: string[] = [];

    for (const pattern of this.config.warnedPatterns) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(lowerInput)) {
        if (pattern.startsWith("rm ") || pattern.startsWith("del ")) {
          detectedFlags.push(SafetyFlag.MASS_DELETION);
          warnings.push("检测到文件删除操作");
        } else if (pattern.startsWith("sudo")) {
          detectedFlags.push(SafetyFlag.PRIVILEGE_ESCALATION);
          warnings.push("检测到权限提升操作");
        } else if (pattern.includes("install")) {
          detectedFlags.push(SafetyFlag.SYSTEM_MODIFICATION);
          warnings.push("检测到系统修改操作");
        } else if (pattern.includes("git push --force") || pattern.includes("git reset --hard")) {
          detectedFlags.push(SafetyFlag.DESTRUCTIVE_OPERATION);
          warnings.push("检测到可能破坏版本历史的操作");
        } else {
          detectedFlags.push(SafetyFlag.SYSTEM_MODIFICATION);
          warnings.push("检测到需要确认的操作");
        }
      }
    }

    if (detectedFlags.length > 0) {
      this.destructiveOperationCount++;

      if (this.destructiveOperationCount > this.config.maxDestructiveOperations) {
        result.level = SafetyLevel.BLOCKED;
        result.blockMessage = `本会话已执行 ${this.destructiveOperationCount} 次破坏性操作，已达到上限。`;
        result.flags = detectedFlags;
        result.warnings = warnings;
        return result;
      }

      result.level = SafetyLevel.CAUTION;
      result.flags = detectedFlags;
      result.warnings = warnings;
      result.requiresConfirmation = true;
      result.confirmationMessage = `此操作需要确认: ${warnings.join("; ")}`;
    }

    if (this.config.enableLLMCheck && this.llmClient) {
      const llmResult = await this.checkWithLLM(userInput, intentResult);
      if (llmResult.level === SafetyLevel.BLOCKED || llmResult.level === SafetyLevel.DANGEROUS) {
        result.level = llmResult.level;
        result.flags = [...new Set([...result.flags, ...llmResult.flags])];
        result.blockMessage = llmResult.blockMessage;
        result.warnings = [...result.warnings, ...llmResult.warnings];
      } else if (llmResult.requiresConfirmation) {
        result.requiresConfirmation = true;
        result.confirmationMessage = llmResult.confirmationMessage;
        result.warnings = [...result.warnings, ...llmResult.warnings];
      }
    }

    return result;
  }

  private async checkWithLLM(
    userInput: string,
    intentResult: IntentRecognitionResult
  ): Promise<SafetyCheckResult> {
    const prompt = `请评估以下用户输入的安全性:

用户输入: "${userInput}"
识别意图: ${intentResult.primaryIntent}

评估维度:
1. 是否包含破坏性操作（删除、格式化、覆盖）
2. 是否访问敏感数据（密码、密钥、凭证）
3. 是否涉及外部通信（网络请求、数据外传）
4. 是否尝试权限提升
5. 是否修改系统配置

输出 JSON:
{
  "level": "safe/caution/dangerous/blocked",
  "flags": ["安全标记"],
  "warnings": ["警告信息"],
  "requiresConfirmation": true/false,
  "confirmationMessage": "确认信息"
}`;

    try {
      const response = await this.llmClient.complete({
        messages: [
          { role: "system", content: "你是一个安全策略检查专家。" },
          { role: "user", content: prompt },
        ],
        maxTokens: 256,
        temperature: 0.1,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          level: parsed.level || SafetyLevel.SAFE,
          flags: parsed.flags || [SafetyFlag.NONE],
          warnings: parsed.warnings || [],
          requiresConfirmation: parsed.requiresConfirmation || false,
          confirmationMessage: parsed.confirmationMessage,
        };
      }
    } catch {
      // Fall back to rule-based check
    }

    return {
      level: SafetyLevel.SAFE,
      flags: [SafetyFlag.NONE],
      warnings: [],
      requiresConfirmation: false,
    };
  }

  resetDestructiveCount(): void {
    this.destructiveOperationCount = 0;
  }

  getDestructiveCount(): number {
    return this.destructiveOperationCount;
  }
}

export function createSafetyChecker(config?: Partial<SafetyPolicy>): SafetyChecker {
  return new SafetyChecker(config);
}
