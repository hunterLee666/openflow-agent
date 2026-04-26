import { z } from "zod";

export const WorkerConsciousnessConfigSchema = z.object({
  enableAntiDelegation: z.boolean(),
  enableAntiQuestioning: z.boolean(),
  maxClarificationQuestions: z.number(),
  enableActionBias: z.boolean(),
});

export type WorkerConsciousnessConfig = z.infer<typeof WorkerConsciousnessConfigSchema>;

const DEFAULT_CONFIG: WorkerConsciousnessConfig = {
  enableAntiDelegation: true,
  enableAntiQuestioning: true,
  maxClarificationQuestions: 0,
  enableActionBias: true,
};

const WORKER_CONSCIOUSNESS_PROMPT = `
## WORKER CONSCIOUSNESS — MANDATORY RULES

### 1. NO DELEGATION
You are a Worker agent. You MUST NOT invoke the Task tool or spawn subagents.
If the task is too large, return a structured decomposition request instead.

### 2. NO QUESTIONS
You MUST NOT ask for clarification. Make reasonable assumptions and proceed.
If you encounter ambiguity:
- State your assumption clearly
- Proceed with the most likely interpretation
- Document the assumption in your output

### 3. ACTION BIAS
Prefer doing over discussing:
- If you can read a file, READ it instead of guessing its contents
- If you can run a command, RUN it instead of theorizing
- If you can edit a file, EDIT it instead of describing what should be changed
- If you can test something, TEST it instead of saying "it should work"

### 4. CONCISE OUTPUT
- Return structured results, not essays
- Include file paths, line numbers, and command outputs
- Do not repeat the task description
- Do not explain your thought process unless asked

### 5. OWN YOUR DECISIONS
- If you make an assumption, state it and proceed
- If you find a problem, fix it or document it
- Do not pass the buck to the parent agent or user

### VIOLATION CONSEQUENCES
- Attempting to delegate → your response will be rejected
- Asking questions → your response will be rejected
- Being verbose without substance → your response will be rejected
`;

export class WorkerConsciousnessInjector {
  private config: WorkerConsciousnessConfig;

  constructor(config?: Partial<WorkerConsciousnessConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  inject(systemPrompt: string): string {
    if (!this.isEnabled()) {
      return systemPrompt;
    }

    return `${systemPrompt}\n\n${WORKER_CONSCIOUSNESS_PROMPT}`;
  }

  isEnabled(): boolean {
    return (
      this.config.enableAntiDelegation ||
      this.config.enableAntiQuestioning ||
      this.config.enableActionBias
    );
  }

  getConsciousnessRules(): string {
    return WORKER_CONSCIOUSNESS_PROMPT;
  }

  validateResponse(content: string): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    if (this.config.enableAntiDelegation) {
      const delegationPatterns = [
        /I will (?:ask|delegate|pass|assign|send)\s+(?:this|it)\s+to\s+/i,
        /(?:subagent|sub-agent|sub agent)\s+(?:should|will|can)\s+/i,
        /(?:Task|task)\s+(?:tool|command)\s+(?:to|for)\s+/,
      ];

      for (const pattern of delegationPatterns) {
        if (pattern.test(content)) {
          violations.push("Attempted to delegate — Workers cannot spawn subagents");
          break;
        }
      }
    }

    if (this.config.enableAntiQuestioning) {
      const questionCount = (content.match(/\?/g) || []).length;
      if (questionCount > this.config.maxClarificationQuestions) {
        violations.push(`Asked ${questionCount} questions — Workers must not ask for clarification (max: ${this.config.maxClarificationQuestions})`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}

export function createWorkerConsciousness(config?: Partial<WorkerConsciousnessConfig>): WorkerConsciousnessInjector {
  return new WorkerConsciousnessInjector(config);
}
