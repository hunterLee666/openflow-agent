export interface VerificationTask {
  id: string;
  target: string;
  checks: VerificationCheck[];
  context?: string;
}

export interface VerificationCheck {
  type: "build" | "test" | "lint" | "e2e" | "http" | "adversarial" | "custom";
  name: string;
  command?: string;
  expected?: string | RegExp;
  timeout?: number;
}

export interface VerificationResult {
  taskId: string;
  verdict: "PASS" | "FAIL" | "PARTIAL";
  checks: CheckResult[];
  summary: string;
  evidence: string[];
  duration: number;
}

export interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  output?: string;
  error?: string;
  duration: number;
}

export interface VerificationAgent {
  verify(task: VerificationTask): Promise<VerificationResult>;
  generateChecks(target: string, context?: string): VerificationCheck[];
}
