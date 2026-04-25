import type { SubAgentMessage, SubAgentTask, SubAgentResult, SubAgentContext } from "./sub-agent-system.js";
import type { ToolDefinition } from "../types/index.js";
import { AntiRecursionGuard } from "./anti-recursion.js";

export interface WorkerAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
}

export interface CoordinatorConfig {
  maxDelegationDepth: number;
  enableValidation: boolean;
  aggregationStrategy: "concat" | "vote" | "best";
  maxWorkers: number;
}

export interface TaskDecomposition {
  subtasks: Array<{
    id: string;
    description: string;
    assignedWorkerId: string;
    dependencies: string[];
  }>;
}

export class CoordinatorMode {
  private config: CoordinatorConfig;
  private antiRecursionGuard: AntiRecursionGuard;
  private llmProvider: ((messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>) | null = null;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;
  private executeSubAgent: ((task: SubAgentTask, context: SubAgentContext) => Promise<SubAgentResult>) | null = null;

  constructor(config?: Partial<CoordinatorConfig>, antiRecursionGuard?: AntiRecursionGuard) {
    this.config = {
      maxDelegationDepth: config?.maxDelegationDepth || 3,
      enableValidation: config?.enableValidation ?? true,
      aggregationStrategy: config?.aggregationStrategy || "concat",
      maxWorkers: config?.maxWorkers || 5,
    };
    this.antiRecursionGuard = antiRecursionGuard || new AntiRecursionGuard({ maxDepth: this.config.maxDelegationDepth });
  }

  setLlmProvider(provider: (messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>): void {
    this.llmProvider = provider;
  }

  setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<unknown>): void {
    this.toolExecutor = executor;
  }

  setSubAgentExecutor(executor: (task: SubAgentTask, context: SubAgentContext) => Promise<SubAgentResult>): void {
    this.executeSubAgent = executor;
  }

  async execute(
    task: SubAgentTask,
    workers: WorkerAgent[],
    parentContext: SubAgentContext
  ): Promise<SubAgentResult> {
    const startTime = Date.now();

    const decomposition = await this.decomposeTask(task, workers, parentContext);

    const results = await this.executeSubtasks(decomposition, workers, parentContext);

    const aggregatedOutput = this.aggregateResults(results, task);

    const duration = Date.now() - startTime;

    return {
      taskId: task.id,
      output: aggregatedOutput,
      duration,
      status: "success",
      turns: decomposition.subtasks.length,
      toolCalls: results.reduce((sum, r) => sum + r.toolCalls, 0),
      metadata: {
        mode: "coordinator",
        subtasksCount: decomposition.subtasks.length,
        workersUsed: new Set(decomposition.subtasks.map((s) => s.assignedWorkerId)).size,
        aggregationStrategy: this.config.aggregationStrategy,
      },
    };
  }

  private async decomposeTask(
    task: SubAgentTask,
    workers: WorkerAgent[],
    parentContext: SubAgentContext
  ): Promise<TaskDecomposition> {
    if (!this.llmProvider) {
      throw new Error("LLM provider not configured");
    }

    const workerDescriptions = workers
      .map((w) => `- ${w.id}: ${w.name} - ${w.description}`)
      .join("\n");

    const systemPrompt = `You are a task coordinator. Your job is to decompose complex tasks into subtasks and assign them to appropriate workers.

Available workers:
${workerDescriptions}

Rules:
1. Break down the task into logical subtasks
2. Assign each subtask to the most suitable worker
3. Identify dependencies between subtasks
4. Return the decomposition in JSON format`;

    const messages: SubAgentMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Task: ${task.description}\n\nDetails: ${task.prompt}\n\nPlease decompose this task and return JSON with this structure:
{
  "subtasks": [
    {
      "id": "subtask_1",
      "description": "What needs to be done",
      "assignedWorkerId": "worker_id",
      "dependencies": []
    }
  ]
}`,
      },
    ];

    const response = await this.llmProvider(messages, []);

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decomposition = JSON.parse(jsonMatch[0]) as TaskDecomposition;
        return decomposition;
      }
    } catch (error) {
      console.warn("Failed to parse task decomposition, using fallback:", error);
    }

    return this.fallbackDecomposition(task, workers);
  }

  private fallbackDecomposition(task: SubAgentTask, workers: WorkerAgent[]): TaskDecomposition {
    return {
      subtasks: [
        {
          id: "subtask_1",
          description: task.description,
          assignedWorkerId: workers[0]?.id || "default",
          dependencies: [],
        },
      ],
    };
  }

  private async executeSubtasks(
    decomposition: TaskDecomposition,
    workers: WorkerAgent[],
    parentContext: SubAgentContext
  ): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];
    const completedIds = new Set<string>();

    const workerMap = new Map<string, WorkerAgent>();
    for (const worker of workers) {
      workerMap.set(worker.id, worker);
    }

    const executeSubtask = async (subtask: typeof decomposition.subtasks[0], depth: number = 1): Promise<SubAgentResult> => {
      for (const depId of subtask.dependencies) {
        if (!completedIds.has(depId)) {
          const depSubtask = decomposition.subtasks.find((s) => s.id === depId);
          if (depSubtask) {
            await executeSubtask(depSubtask, depth);
          }
        }
      }

      if (!this.executeSubAgent) {
        throw new Error("Sub-agent executor not configured");
      }

      if (depth >= this.config.maxDelegationDepth) {
        return {
          taskId: subtask.id,
          output: `Blocked: max delegation depth (${this.config.maxDelegationDepth}) reached`,
          duration: 0,
          status: "error",
          turns: 0,
          toolCalls: 0,
          error: `Anti-recursion: depth ${depth} exceeds max ${this.config.maxDelegationDepth}`,
        };
      }

      const worker = workerMap.get(subtask.assignedWorkerId);
      const workerPrompt = worker
        ? `${worker.systemPrompt}\n\nSubtask: ${subtask.description}`
        : subtask.description;

      const subAgentTask: SubAgentTask = {
        id: subtask.id,
        type: worker?.id || "worker",
        description: subtask.description,
        prompt: subtask.description,
        systemPrompt: workerPrompt,
        allowedTools: worker?.allowedTools,
        timeout: 60000,
        maxTurns: 15,
      };

      const childContext: SubAgentContext = {
        ...parentContext,
        sessionId: `coordinator_${subtask.id}`,
        depth,
        agentType: worker?.id || "worker",
      };

      this.antiRecursionGuard.registerAgent(childContext.sessionId, parentContext.sessionId, depth);

      const result = await this.executeSubAgent(subAgentTask, childContext);
      completedIds.add(subtask.id);

      return result;
    };

    const independentSubtasks = decomposition.subtasks.filter(
      (s) => s.dependencies.length === 0
    );
    const dependentSubtasks = decomposition.subtasks.filter(
      (s) => s.dependencies.length > 0
    );

    const independentResults = await Promise.allSettled(
      independentSubtasks.map((s) => executeSubtask(s, 1))
    );

    for (const result of independentResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    for (const subtask of dependentSubtasks) {
      try {
        const result = await executeSubtask(subtask, 1);
        results.push(result);
      } catch (error) {
        results.push({
          taskId: subtask.id,
          output: "",
          duration: 0,
          status: "error",
          turns: 0,
          toolCalls: 0,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  private aggregateResults(results: SubAgentResult[], task: SubAgentTask): string {
    switch (this.config.aggregationStrategy) {
      case "concat":
        return this.concatResults(results);
      case "vote":
        return this.voteResults(results);
      case "best":
        return this.bestResult(results);
      default:
        return this.concatResults(results);
    }
  }

  private concatResults(results: SubAgentResult[]): string {
    const parts: string[] = [];

    for (const result of results) {
      if (result.status === "success" && result.output) {
        parts.push(`## ${result.taskId}\n\n${result.output}`);
      }
    }

    return parts.join("\n\n---\n\n");
  }

  private voteResults(results: SubAgentResult[]): string {
    const outputs = results
      .filter((r) => r.status === "success" && r.output)
      .map((r) => r.output);

    if (outputs.length === 0) {
      return "No successful results to aggregate.";
    }

    if (outputs.length === 1) {
      return outputs[0];
    }

    return `Multiple results obtained:\n\n${outputs.map((o, i) => `Result ${i + 1}:\n${o}`).join("\n\n")}`;
  }

  private bestResult(results: SubAgentResult[]): string {
    const successful = results.filter((r) => r.status === "success" && r.output);

    if (successful.length === 0) {
      return "No successful results.";
    }

    successful.sort((a, b) => b.turns - a.turns);

    return successful[0].output;
  }
}
