import type { AgentConfig, ToolContext } from "../types/index.js";

export type TaskAgentType = "explore" | "plan" | "verify" | "general";

export interface TaskAgentConfig {
  type: TaskAgentType;
  name: string;
  maxTokens?: number;
  timeout?: number;
  antiRecursionDepth?: number;
  forkPrefix?: string;
  cacheEnabled?: boolean;
  distillationEnabled?: boolean;
}

export interface TaskResult {
  id: string;
  type: TaskAgentType;
  status: "completed" | "failed" | "partial";
  output?: unknown;
  error?: string;
  tokensUsed?: number;
  durationMs?: number;
  cacheHit?: boolean;
}

export interface ExploreTask {
  goal: string;
  scope?: string[];
  depth?: "shallow" | "medium" | "deep";
  filePatterns?: string[];
  excludePatterns?: string[];
}

export interface PlanTask {
  goal: string;
  constraints: string[];
  context?: Record<string, unknown>;
  approach?: "conservative" | "aggressive" | "incremental";
}

export interface VerifyTask {
  target: string;
  criteria: string[];
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
}

export const TASK_AGENT_DEFAULTS: Record<TaskAgentType, Partial<TaskAgentConfig>> = {
  explore: {
    maxTokens: 4096,
    timeout: 30000,
    antiRecursionDepth: 2,
    forkPrefix: "[Explore]",
    cacheEnabled: true,
    distillationEnabled: true,
  },
  plan: {
    maxTokens: 8192,
    timeout: 60000,
    antiRecursionDepth: 2,
    forkPrefix: "[Plan]",
    cacheEnabled: true,
    distillationEnabled: true,
  },
  verify: {
    maxTokens: 16384,
    timeout: 120000,
    antiRecursionDepth: 2,
    forkPrefix: "[Verify]",
    cacheEnabled: true,
    distillationEnabled: true,
  },
  general: {
    maxTokens: 8192,
    timeout: 60000,
    antiRecursionDepth: 2,
    forkPrefix: "[Task]",
    cacheEnabled: true,
    distillationEnabled: false,
  },
};

const _activeAgents = new Set<string>();

export class TaskAgent {
  private readonly config: AgentConfig;
  private readonly agentType: TaskAgentType;
  private readonly agentConfig: TaskAgentConfig;
  private recursionDepth = 0;

  constructor(
    config: AgentConfig,
    agentType: TaskAgentType,
    customConfig?: Partial<TaskAgentConfig>
  ) {
    this.config = config;
    this.agentType = agentType;
    this.agentConfig = {
      ...TASK_AGENT_DEFAULTS[agentType],
      ...customConfig,
      type: agentType,
      name: customConfig?.name || `${TASK_AGENT_DEFAULTS[agentType]?.forkPrefix || "[Task]"} ${agentType}`,
    };
  }

  get forkPrefix(): string {
    return this.agentConfig.forkPrefix || TASK_AGENT_DEFAULTS[this.agentType]?.forkPrefix || "[Task]";
  }

  get type(): TaskAgentType {
    return this.agentType;
  }

  canFork(): boolean {
    return this.recursionDepth < (this.agentConfig.antiRecursionDepth || 2);
  }

  private incrementRecursion(): boolean {
    this.recursionDepth++;
    return this.canFork();
  }

  private decrementRecursion(): void {
    this.recursionDepth = Math.max(0, this.recursionDepth - 1);
  }

  registerAgent(): string {
    const agentId = `${this.forkPrefix}:${Date.now()}:${Math.random().toString(36).substring(2, 8)}`;
    _activeAgents.add(agentId);
    return agentId;
  }

  unregisterAgent(agentId: string): void {
    _activeAgents.delete(agentId);
  }

  async execute(task: ExploreTask | PlanTask | VerifyTask): Promise<TaskResult> {
    const agentId = this.registerAgent();
    const startTime = Date.now();

    try {
      const result = await this.executeTask(task);
      return {
        id: agentId,
        type: this.agentType,
        status: result.status,
        output: result.output,
        error: result.error,
        tokensUsed: result.tokensUsed,
        durationMs: Date.now() - startTime,
        cacheHit: result.cacheHit,
      };
    } catch (error) {
      return {
        id: agentId,
        type: this.agentType,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.unregisterAgent(agentId);
    }
  }

  private async executeTask(
    task: ExploreTask | PlanTask | VerifyTask
  ): Promise<{ status: TaskResult["status"]; output?: unknown; error?: string; tokensUsed?: number; cacheHit?: boolean }> {
    if (!this.canFork()) {
      return {
        status: "failed",
        error: `Anti-recursion: ${this.forkPrefix} reached max recursion depth (${this.recursionDepth})`,
      };
    }

    this.incrementRecursion();
    try {
      switch (this.agentType) {
        case "explore":
          return await this.executeExplore(task as ExploreTask);
        case "plan":
          return await this.executePlan(task as PlanTask);
        case "verify":
          return await this.executeVerify(task as VerifyTask);
        default:
          return await this.executeGeneral(task);
      }
    } finally {
      this.decrementRecursion();
    }
  }

  private async executeExplore(task: ExploreTask): Promise<{ status: TaskResult["status"]; output?: unknown; error?: string; tokensUsed?: number; cacheHit?: boolean }> {
    const exploration = {
      goal: task.goal,
      scope: task.scope || ["."],
      depth: task.depth || "medium",
      findings: [] as Array<{ path: string; type: string; content: string }>,
    };

    return {
      status: "completed",
      output: exploration,
      tokensUsed: Math.floor(task.goal.length / 4),
    };
  }

  private async executePlan(task: PlanTask): Promise<{ status: TaskResult["status"]; output?: unknown; error?: string; tokensUsed?: number; cacheHit?: boolean }> {
    const plan = {
      goal: task.goal,
      constraints: task.constraints,
      approach: task.approach || "incremental",
      steps: [] as Array<{ id: string; description: string; order: number; dependencies: string[] }>,
    };

    return {
      status: "completed",
      output: plan,
      tokensUsed: Math.floor(task.goal.length / 4),
    };
  }

  private async executeVerify(task: VerifyTask): Promise<{ status: TaskResult["status"]; output?: unknown; error?: string; tokensUsed?: number; cacheHit?: boolean }> {
    const verification = {
      target: task.target,
      criteria: task.criteria,
      results: {
        buildPassed: false,
        testPassed: false,
        lintPassed: false,
        manualChecks: [] as string[],
      },
    };

    return {
      status: "partial",
      output: verification,
      tokensUsed: Math.floor(task.target.length / 4),
    };
  }

  private async executeGeneral(task: ExploreTask | PlanTask | VerifyTask): Promise<{ status: TaskResult["status"]; output?: unknown; error?: string; tokensUsed?: number; cacheHit?: boolean }> {
    return {
      status: "completed",
      output: { task, agentType: this.agentType, prefix: this.forkPrefix },
      tokensUsed: 0,
    };
  }
}

export class TaskAgentRegistry {
  private agents = new Map<string, TaskAgent>();
  private static instance?: TaskAgentRegistry;

  static getInstance(): TaskAgentRegistry {
    if (!TaskAgentRegistry.instance) {
      TaskAgentRegistry.instance = new TaskAgentRegistry();
    }
    return TaskAgentRegistry.instance;
  }

  register(id: string, agent: TaskAgent): void {
    this.agents.set(id, agent);
  }

  get(id: string): TaskAgent | undefined {
    return this.agents.get(id);
  }

  unregister(id: string): void {
    this.agents.delete(id);
  }

  list(): Array<{ id: string; type: TaskAgentType; prefix: string }> {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      type: agent.type,
      prefix: agent.forkPrefix,
    }));
  }

  clear(): void {
    this.agents.clear();
  }
}

export function createTaskAgent(
  config: AgentConfig,
  type: TaskAgentType,
  customConfig?: Partial<TaskAgentConfig>
): TaskAgent {
  return new TaskAgent(config, type, customConfig);
}

export function getTaskAgentDefaults(type: TaskAgentType): Partial<TaskAgentConfig> {
  return TASK_AGENT_DEFAULTS[type];
}

export function isAgentActive(agentId: string): boolean {
  return _activeAgents.has(agentId);
}

export function getActiveAgentCount(): number {
  return _activeAgents.size;
}

export const FORK_PREFIXES = {
  explore: "[Explore]",
  plan: "[Plan]",
  verify: "[Verify]",
  general: "[Task]",
} as const;

export function getStandardForkPrefix(type: TaskAgentType): string {
  return FORK_PREFIXES[type] || FORK_PREFIXES.general;
}
