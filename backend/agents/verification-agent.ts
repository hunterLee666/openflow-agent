import type { ToolDefinition } from "../types/index.js";
import { z } from "zod";

export const VerificationVerdictSchema = z.enum(["PASS", "FAIL", "PARTIAL"]);

export const VerificationCheckSchema = z.object({
  name: z.string(),
  command: z.string(),
  exitCode: z.number(),
  output: z.string(),
  passed: z.boolean(),
  category: z.enum(["build", "test", "lint", "runtime", "adversarial"]),
});

export const AdversarialProbeSchema = z.object({
  description: z.string(),
  command: z.string(),
  expectedStatus: z.number(),
  actualStatus: z.number().optional(),
  passed: z.boolean(),
});

export const VerificationResultSchema = z.object({
  verdict: VerificationVerdictSchema,
  checks: z.array(VerificationCheckSchema),
  adversarialProbes: z.array(AdversarialProbeSchema),
  environment: z.string(),
  summary: z.string(),
  evidence: z.array(z.string()),
  touchedFiles: z.array(z.string()),
  openQuestions: z.array(z.string()),
  recommendations: z.array(z.string()),
  duration: z.number(),
});

export const VerificationAgentConfigSchema = z.object({
  enableBuildCheck: z.boolean(),
  enableTestCheck: z.boolean(),
  enableLintCheck: z.boolean(),
  enableRuntimeCheck: z.boolean(),
  enableAdversarialProbes: z.boolean(),
  timeoutMs: z.number(),
  maxChecks: z.number(),
});

export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;
export type AdversarialProbe = z.infer<typeof AdversarialProbeSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type VerificationAgentConfig = z.infer<typeof VerificationAgentConfigSchema>;

const DEFAULT_CONFIG: VerificationAgentConfig = {
  enableBuildCheck: true,
  enableTestCheck: true,
  enableLintCheck: true,
  enableRuntimeCheck: true,
  enableAdversarialProbes: true,
  timeoutMs: 120000,
  maxChecks: 20,
};

const ALLOWED_TOOLS = ["Read", "Glob", "Grep", "LS", "Bash", "GitStatus", "GitLog", "GitDiff"];

const SYSTEM_PROMPT = `You are a Verification agent — an independent quality assurance inspector. Your motto is: "Try to break it."

## CORE PRINCIPLES
1. NEVER trust the implementation agent's self-assessment
2. NEVER judge by reading code alone — ALWAYS run executable checks
3. You are INDEPENDENT from the implementation — your job is to FIND FAILURES
4. Evidence over opinions: every judgment must include command output

## MANDATORY CHECKS (DO NOT SKIP)
1. BUILD: Run the build command (e.g., go build, pnpm build, cargo build)
2. TEST: Run the test suite (e.g., go test, pytest, pnpm test)
3. LINT: Run the linter (e.g., golangci-lint, eslint, clippy)
4. RUNTIME: Test critical paths with curl or equivalent
5. ADVERSARIAL: Probe edge cases (empty body, wrong types, large payloads, duplicates)

## VERDICT DEFINITIONS
- PASS: All mandatory checks green + adversarial probes handled correctly
- FAIL: Any critical check red (build fail, test fail, security probe breach)
- PARTIAL: Core functionality green but non-critical issues (docs missing, non-blocking lint warnings, partial probe coverage)

## HARD CONSTRAINTS
1. You MUST NOT modify source code files
2. You MUST NOT invoke the Task tool or spawn subagents
3. You MUST run actual commands, not just read diffs
4. You MUST include command output snippets as evidence
5. You MUST be independent — do not coordinate with the implementation agent

## OUTPUT FORMAT
Return a structured report:

### Verdict: PASS/FAIL/PARTIAL

### Environment
- OS, language version, tool versions

### Checks Executed
1. \`command\` → exit code N; output summary: ...
2. \`command\` → exit code N; output summary: ...

### Adversarial Probes
- Probe description → expected vs actual → PASS/FAIL

### Evidence
- Key output snippets that support the verdict

### Recommendations
- Specific actions to resolve failures (if any)

### Open Questions
- Areas not covered or needing human judgment

## IMPORTANT
- Be ruthless: if it breaks, say FAIL
- Be fair: if it works, say PASS
- Be precise: include exact commands and outputs
- Do NOT say "should work" — prove it works`;

export class VerificationAgent {
  private config: VerificationAgentConfig;
  private llmProvider: ((messages: Array<{ role: string; content: string }>, tools: ToolDefinition[]) => Promise<{ content: string }>) | null = null;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;

  constructor(config?: Partial<VerificationAgentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setLlmProvider(provider: (messages: Array<{ role: string; content: string }>, tools: ToolDefinition[]) => Promise<{ content: string }>): void {
    this.llmProvider = provider;
  }

  setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<unknown>): void {
    this.toolExecutor = executor;
  }

  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  getAllowedTools(availableTools: ToolDefinition[]): ToolDefinition[] {
    const allowedSet = new Set(ALLOWED_TOOLS);
    return availableTools.filter((t) => allowedSet.has(t.name));
  }

  async execute(
    taskDescription: string,
    availableTools: ToolDefinition[],
    projectDir: string,
    context?: {
      buildCommand?: string;
      testCommand?: string;
      lintCommand?: string;
      endpoints?: string[];
    }
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const allowedTools = this.getAllowedTools(availableTools);

    const contextSection = context
      ? `
## Known Commands & Endpoints
${context.buildCommand ? `Build: ${context.buildCommand}` : ""}
${context.testCommand ? `Test: ${context.testCommand}` : ""}
${context.lintCommand ? `Lint: ${context.lintCommand}` : ""}
${context.endpoints ? `Endpoints to test: ${context.endpoints.join(", ")}` : ""}
`.trim()
      : "";

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Fork started — processing in background: Verify ${taskDescription}\n\nProject directory: ${projectDir}\n\nTask: Verify the implementation of: ${taskDescription}\n\n${contextSection}`,
      },
    ];

    if (!this.llmProvider) {
      throw new Error("LLM provider not configured");
    }

    const response = await this.llmProvider(messages, allowedTools);

    return this.parseResponse(response.content, Date.now() - startTime);
  }

  private parseResponse(content: string, duration: number): VerificationResult {
    const checks: VerificationCheck[] = [];
    const adversarialProbes: AdversarialProbe[] = [];
    const evidence: string[] = [];
    const openQuestions: string[] = [];
    const recommendations: string[] = [];
    const touchedFiles: string[] = [];

    let verdict: VerificationVerdict = "FAIL";
    const verdictMatch = content.match(/###\s*Verdict:\s*(PASS|FAIL|PARTIAL)/i);
    if (verdictMatch) {
      verdict = verdictMatch[1].toUpperCase() as VerificationVerdict;
    }

    const checkRegex = /^(\d+)\.\s*`([^`]+)`\s*→\s*exit code\s*(\d+)[;，]\s*(.+)$/gm;
    let match;
    while ((match = checkRegex.exec(content)) !== null) {
      checks.push({
        name: `Check ${match[1]}`,
        command: match[2],
        exitCode: parseInt(match[3], 10),
        output: match[4].trim(),
        passed: parseInt(match[3], 10) === 0,
        category: this.categorizeCheck(match[2]),
      });
    }

    const probeRegex = /^[-*]\s*(.+?)\s*→\s*expected\s*(\d+)\s*vs\s*actual\s*(\d+)\s*→\s*(PASS|FAIL)/gm;
    while ((match = probeRegex.exec(content)) !== null) {
      adversarialProbes.push({
        description: match[1].trim(),
        command: "",
        expectedStatus: parseInt(match[2], 10),
        actualStatus: parseInt(match[3], 10),
        passed: match[4].toUpperCase() === "PASS",
      });
    }

    const evidenceRegex = /^[-*]\s*(.+?)(?::(\d+))?\s*[—-]\s*(.+)$/gm;
    while ((match = evidenceRegex.exec(content)) !== null) {
      evidence.push(`${match[1]}${match[2] ? `:${match[2]}` : ""} — ${match[3]}`);
    }

    const questionRegex = /^[-*]\s*(.+?\?)$/gm;
    while ((match = questionRegex.exec(content)) !== null) {
      openQuestions.push(match[1].trim());
    }

    const recRegex = /^[-*]\s*(.+)$/gm;
    while ((match = recRegex.exec(content)) !== null) {
      if (match[1].includes("should") || match[1].includes("fix") || match[1].includes("resolve")) {
        recommendations.push(match[1].trim());
      }
    }

    const fileRegex = /^[-*]\s*(.+?\.\w+)\s*(?:\((.+?)\))?$/gm;
    while ((match = fileRegex.exec(content)) !== null) {
      touchedFiles.push(match[1].trim());
    }

    return {
      verdict,
      checks,
      adversarialProbes,
      environment: this.extractEnvironment(content),
      summary: this.extractSummary(content),
      evidence,
      touchedFiles,
      openQuestions,
      recommendations,
      duration,
    };
  }

  private categorizeCheck(command: string): VerificationCheck["category"] {
    const lower = command.toLowerCase();
    if (lower.includes("build") || lower.includes("compile")) return "build";
    if (lower.includes("test")) return "test";
    if (lower.includes("lint")) return "lint";
    if (lower.includes("curl") || lower.includes("http")) return "runtime";
    return "adversarial";
  }

  private extractEnvironment(content: string): string {
    const envMatch = content.match(/###\s*Environment\s*\n([\s\S]*?)(?=\n###|$)/);
    return envMatch ? envMatch[1].trim() : "Unknown";
  }

  private extractSummary(content: string): string {
    const lines = content.split("\n").filter((l) => l.trim());
    const firstMeaningful = lines.find((l) => !l.startsWith("#") && !l.startsWith("-") && l.trim().length > 20);
    return firstMeaningful?.trim() || content.slice(0, 200);
  }
}

export function createVerificationAgent(config?: Partial<VerificationAgentConfig>): VerificationAgent {
  return new VerificationAgent(config);
}
