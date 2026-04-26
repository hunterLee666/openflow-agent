import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const CodeIssueSeveritySchema = z.enum(["critical", "warning", "info"]);
export const CodeIssueCategorySchema = z.enum(["security", "performance", "style", "bug", "maintainability"]);

export const CodeIssueSchema = z.object({
  line: z.number(),
  severity: CodeIssueSeveritySchema,
  category: CodeIssueCategorySchema,
  message: z.string(),
  suggestion: z.string().optional(),
});

export const ReviewConfigSchema = z.object({
  maxFiles: z.number().optional(),
  maxLinesPerFile: z.number().optional(),
  categories: z.array(CodeIssueCategorySchema).optional(),
  ignorePatterns: z.array(z.string()).optional(),
});

export const ReviewResultSchema = z.object({
  file: z.string(),
  issues: z.array(CodeIssueSchema),
  summary: z.string(),
  score: z.number(),
});

export type CodeIssue = z.infer<typeof CodeIssueSchema>;
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

const DEFAULT_CONFIG: Required<ReviewConfig> = {
  maxFiles: 50,
  maxLinesPerFile: 1000,
  categories: ["security", "performance", "style", "bug", "maintainability"],
  ignorePatterns: ["node_modules", "dist", "build", ".git", "__pycache__"],
};

const SECURITY_PATTERNS: Array<{ pattern: RegExp; message: string; suggestion: string }> = [
  {
    pattern: /eval\s*\(/,
    message: "使用 eval() 可能导致代码注入",
    suggestion: "使用 JSON.parse() 或其他安全替代方案",
  },
  {
    pattern: /innerHTML\s*=/,
    message: "使用 innerHTML 可能导致 XSS 攻击",
    suggestion: "使用 textContent 或安全的 DOM 操作方法",
  },
  {
    pattern: /document\.write\s*\(/,
    message: "使用 document.write() 可能导致 XSS 攻击",
    suggestion: "使用 DOM 操作方法替代",
  },
  {
    pattern: /password|secret|token|api_key|apikey/i,
    message: "可能硬编码了敏感信息",
    suggestion: "使用环境变量或密钥管理服务",
  },
  {
    pattern: /console\.log\s*\(/,
    message: "生产代码中不应包含 console.log",
    suggestion: "使用日志库或移除调试输出",
  },
];

const PERFORMANCE_PATTERNS: Array<{ pattern: RegExp; message: string; suggestion: string }> = [
  {
    pattern: /for\s*\(\s*(?:var|let|const)\s+\w+\s+in\s+/,
    message: "使用 for...in 遍历数组性能较差",
    suggestion: "使用 for...of 或 Array.forEach()",
  },
  {
    pattern: /new\s+Array\s*\(/,
    message: "使用 new Array() 可能导致意外行为",
    suggestion: "使用数组字面量 [] 或 Array.from()",
  },
  {
    pattern: /while\s*\(\s*true\s*\)/,
    message: "无限循环可能导致性能问题",
    suggestion: "确保循环有明确的退出条件",
  },
];

const STYLE_PATTERNS: Array<{ pattern: RegExp; message: string; suggestion: string }> = [
  {
    pattern: /var\s+/,
    message: "使用 var 声明变量",
    suggestion: "使用 let 或 const 替代 var",
  },
  {
    pattern: /==(?!=)/,
    message: "使用 == 进行相等比较",
    suggestion: "使用 === 进行严格相等比较",
  },
  {
    pattern: /!\s*=\s*=/,
    message: "使用 != 进行不等比较",
    suggestion: "使用 !== 进行严格不等比较",
  },
];

export async function reviewCode(
  targetPath: string,
  config: ReviewConfig = {}
): Promise<ReviewResult[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const results: ReviewResult[] = [];

  const fileStat = await stat(targetPath);

  if (fileStat.isFile()) {
    const result = await reviewFile(targetPath, mergedConfig);
    if (result) {
      results.push(result);
    }
  } else if (fileStat.isDirectory()) {
    const files = await scanDirectory(targetPath, mergedConfig);
    for (const file of files.slice(0, mergedConfig.maxFiles)) {
      const result = await reviewFile(file, mergedConfig);
      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}

export function formatReviewResults(results: ReviewResult[]): string {
  const lines: string[] = [];
  let totalIssues = 0;
  let criticalCount = 0;
  let warningCount = 0;

  for (const result of results) {
    totalIssues += result.issues.length;
    criticalCount += result.issues.filter((i) => i.severity === "critical").length;
    warningCount += result.issues.filter((i) => i.severity === "warning").length;
  }

  lines.push(`# Code Review Summary`);
  lines.push(``);
  lines.push(`- Files Reviewed: ${results.length}`);
  lines.push(`- Total Issues: ${totalIssues}`);
  lines.push(`- Critical: ${criticalCount}`);
  lines.push(`- Warnings: ${warningCount}`);
  lines.push(`- Average Score: ${(results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(1)}/100`);
  lines.push(``);

  for (const result of results) {
    if (result.issues.length === 0) continue;

    lines.push(`## ${result.file}`);
    lines.push(`Score: ${result.score}/100`);
    lines.push(``);

    for (const issue of result.issues) {
      const severityIcon = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
      lines.push(`${severityIcon} **Line ${issue.line}** - [${issue.category.toUpperCase()}] ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`   💡 ${issue.suggestion}`);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

async function reviewFile(filePath: string, config: Required<ReviewConfig>): Promise<ReviewResult | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    if (lines.length > config.maxLinesPerFile) {
      return null;
    }

    const issues: CodeIssue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (config.categories.includes("security")) {
        for (const { pattern, message, suggestion } of SECURITY_PATTERNS) {
          if (pattern.test(line)) {
            issues.push({
              line: lineNum,
              severity: "critical",
              category: "security",
              message,
              suggestion,
            });
          }
        }
      }

      if (config.categories.includes("performance")) {
        for (const { pattern, message, suggestion } of PERFORMANCE_PATTERNS) {
          if (pattern.test(line)) {
            issues.push({
              line: lineNum,
              severity: "warning",
              category: "performance",
              message,
              suggestion,
            });
          }
        }
      }

      if (config.categories.includes("style")) {
        for (const { pattern, message, suggestion } of STYLE_PATTERNS) {
          if (pattern.test(line)) {
            issues.push({
              line: lineNum,
              severity: "info",
              category: "style",
              message,
              suggestion,
            });
          }
        }
      }
    }

    const score = calculateScore(issues, lines.length);

    return {
      file: filePath,
      issues,
      summary: `Found ${issues.length} issues in ${filePath}`,
      score,
    };
  } catch {
    return null;
  }
}

async function scanDirectory(dirPath: string, config: Required<ReviewConfig>): Promise<string[]> {
  const files: string[] = [];
  const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".rb", ".php"]);

  async function scan(currentDir: string) {
    const entries = await readdir(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);

      if (config.ignorePatterns.some((pattern) => fullPath.includes(pattern))) {
        continue;
      }

      const entryStat = await stat(fullPath);

      if (entryStat.isDirectory()) {
        await scan(fullPath);
      } else if (codeExtensions.has(entry.slice(entry.lastIndexOf(".")))) {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

function calculateScore(issues: CodeIssue[], totalLines: number): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 10;
        break;
      case "warning":
        score -= 5;
        break;
      case "info":
        score -= 2;
        break;
    }
  }

  const issueDensity = issues.length / totalLines;
  if (issueDensity > 0.1) {
    score -= 20;
  } else if (issueDensity > 0.05) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
