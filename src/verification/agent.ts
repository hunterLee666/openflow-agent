import { spawn } from "node:child_process";
import type {
  VerificationAgent,
  VerificationTask,
  VerificationResult,
  VerificationCheck,
  CheckResult,
} from "./types.js";

export class DefaultVerificationAgent implements VerificationAgent {
  generateChecks(target: string, context?: string): VerificationCheck[] {
    const checks: VerificationCheck[] = [];

    // Auto-detect project type and generate appropriate checks
    if (target.includes(".go")) {
      checks.push(
        { type: "build", name: "go build", command: "go build ./...", timeout: 60000 },
        { type: "test", name: "go test", command: "go test ./...", timeout: 120000 },
      );
    } else if (target.includes("package.json") || target.includes(".ts") || target.includes(".js")) {
      checks.push(
        { type: "build", name: "typecheck", command: "npx tsc --noEmit", timeout: 60000 },
        { type: "lint", name: "eslint", command: "npx eslint .", timeout: 60000 },
      );
    }

    // Always add adversarial checks for API endpoints
    if (context?.includes("api") || context?.includes("endpoint")) {
      checks.push(
        {
          type: "adversarial",
          name: "empty-body",
          command: "curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:8080/api/health",
          expected: /400/,
          timeout: 10000,
        },
        {
          type: "adversarial",
          name: "missing-auth",
          command: "curl -sS -o /dev/null -w '%{http_code}' http://localhost:8080/api/protected",
          expected: /401|403/,
          timeout: 10000,
        },
      );
    }

    return checks;
  }

  async verify(task: VerificationTask): Promise<VerificationResult> {
    const startTime = Date.now();
    const checkResults: CheckResult[] = [];
    const evidence: string[] = [];

    for (const check of task.checks) {
      const checkStart = Date.now();

      if (!check.command) {
        checkResults.push({
          name: check.name,
          status: "SKIP",
          duration: 0,
        });
        continue;
      }

      try {
        const result = await runCommand(check.command, check.timeout || 30000);
        const duration = Date.now() - checkStart;

        let status: "PASS" | "FAIL" = "PASS";

        if (check.expected) {
          if (check.expected instanceof RegExp) {
            status = check.expected.test(result.stdout) ? "PASS" : "FAIL";
          } else {
            status = result.stdout.includes(check.expected) ? "PASS" : "FAIL";
          }
        }

        if (result.exitCode !== 0 && check.type !== "adversarial") {
          status = "FAIL";
        }

        checkResults.push({
          name: check.name,
          status,
          output: result.stdout.slice(0, 500),
          duration,
        });

        evidence.push(`[${check.name}] ${status}\n${result.stdout.slice(0, 200)}`);
      } catch (e) {
        checkResults.push({
          name: check.name,
          status: "FAIL",
          error: (e as Error).message,
          duration: Date.now() - checkStart,
        });
        evidence.push(`[${check.name}] FAIL: ${(e as Error).message}`);
      }
    }

    // Determine verdict
    const hasFail = checkResults.some((c) => c.status === "FAIL");
    const hasSkip = checkResults.some((c) => c.status === "SKIP");
    const allPass = checkResults.every((c) => c.status === "PASS");

    let verdict: "PASS" | "FAIL" | "PARTIAL";
    if (allPass) {
      verdict = "PASS";
    } else if (hasFail) {
      verdict = "FAIL";
    } else {
      verdict = "PARTIAL";
    }

    return {
      taskId: task.id,
      verdict,
      checks: checkResults,
      summary: this.generateSummary(checkResults),
      evidence,
      duration: Date.now() - startTime,
    };
  }

  private generateSummary(results: CheckResult[]): string {
    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status === "FAIL").length;
    const skip = results.filter((r) => r.status === "SKIP").length;
    return `${pass} passed, ${fail} failed, ${skip} skipped`;
  }
}

function runCommand(command: string, timeout: number): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout after ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout || stderr, exitCode: code || 0 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
