import type { SubAgentTask, SubAgentResult, SubAgentContext } from "./sub-agent-system.js";
import { z } from "zod";

export const AntiRecursionConfigSchema = z.object({
  maxDepth: z.number(),
  enableStrictMode: z.boolean(),
  enableLogging: z.boolean(),
});

export const RecursionViolationSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  depth: z.number(),
  attemptedAction: z.string(),
  timestamp: z.number(),
});

export type AntiRecursionConfig = z.infer<typeof AntiRecursionConfigSchema>;
export type RecursionViolation = z.infer<typeof RecursionViolationSchema>;

export interface DepthTracker {
  getDepth(sessionId: string): number;
  setDepth(sessionId: string, depth: number): void;
  getParentSessionId(sessionId: string): string | undefined;
}

const DEFAULT_CONFIG: AntiRecursionConfig = {
  maxDepth: 3,
  enableStrictMode: true,
  enableLogging: true,
};

export class AntiRecursionGuard {
  private config: AntiRecursionConfig;
  private depthMap: Map<string, number> = new Map();
  private parentMap: Map<string, string> = new Map();
  private violations: RecursionViolation[] = [];

  constructor(config?: Partial<AntiRecursionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerAgent(agentId: string, parentSessionId: string | undefined, depth: number = 0): void {
    this.depthMap.set(agentId, depth);
    if (parentSessionId) {
      this.parentMap.set(agentId, parentSessionId);
    }
  }

  canSpawnSubagent(agentId: string, task: SubAgentTask): { allowed: boolean; reason?: string } {
    const currentDepth = this.depthMap.get(agentId) || 0;

    if (currentDepth >= this.config.maxDepth) {
      const violation: RecursionViolation = {
        taskId: task.id,
        agentId,
        depth: currentDepth,
        attemptedAction: `Attempted to spawn subagent at depth ${currentDepth} (max: ${this.config.maxDepth})`,
        timestamp: Date.now(),
      };
      this.violations.push(violation);

      if (this.config.enableLogging) {
        console.warn(`[AntiRecursion] Blocked: ${violation.attemptedAction}`);
      }

      return {
        allowed: false,
        reason: `Sub-agents cannot spawn sub-agents. Depth: ${currentDepth}/${this.config.maxDepth}. Return a structured decomposition request to the parent agent instead.`,
      };
    }

    return { allowed: true };
  }

  getDepth(sessionId: string): number {
    return this.depthMap.get(sessionId) || 0;
  }

  getMaxDepth(): number {
    return this.config.maxDepth;
  }

  getViolations(): RecursionViolation[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }

  getDepthChain(sessionId: string): string[] {
    const chain: string[] = [];
    let current: string | undefined = sessionId;

    while (current) {
      chain.unshift(current);
      current = this.parentMap.get(current);
    }

    return chain;
  }

  isRootAgent(sessionId: string): boolean {
    return !this.parentMap.has(sessionId);
  }

  formatAntiRecursionWarning(depth: number): string {
    return `
## ANTI-RECURSION RULE
You are a sub-agent at depth ${depth}/${this.config.maxDepth}.
You MUST NOT invoke the Task tool or spawn subagents.

If the task is too large for you to handle:
1. Return a structured decomposition request
2. List the subtasks you would need
3. Let the parent agent dispatch them

VIOLATION: Your response will be rejected if you attempt to spawn subagents.`;
  }
}

export function createAntiRecursionGuard(config?: Partial<AntiRecursionConfig>): AntiRecursionGuard {
  return new AntiRecursionGuard(config);
}
