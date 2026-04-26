import { EventEmitter } from "node:events";
import type { ToolDefinition } from "../types/index.js";
import { ExploreAgent } from "./explore-agent.js";
import { PlanAgent } from "./plan-agent.js";
import { VerificationAgent, VerificationVerdict } from "./verification-agent.js";
import { AntiRecursionGuard } from "./anti-recursion.js";
import { ForkPrefixOptimizer } from "./fork-prefix.js";
import { MessageRouter } from "./message-router.js";
import { WorkerConsciousnessInjector } from "./worker-consciousness.js";
import { BUILTIN_AGENT_TYPES, TOOL_GROUPS, resolveAllowedTools, buildSystemPromptForType } from "./agent-types.js";
import { z } from "zod";
export { BUILTIN_AGENT_TYPES, TOOL_GROUPS } from "./agent-types.js";
export type { AgentTypeDefinition, WorkerAgent, SwarmAgent } from "./agent-types.js";

export const SubAgentToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

export type SubAgentToolCall = z.infer<typeof SubAgentToolCallSchema>;

export const SubAgentMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  toolCalls: z.array(SubAgentToolCallSchema).optional(),
  toolCallId: z.string().optional(),
});

export type SubAgentMessage = z.infer<typeof SubAgentMessageSchema>;

export const SubAgentTaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  prompt: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  allowedTools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  timeout: z.number().optional(),
  maxTurns: z.number().optional(),
  mode: z.enum(["single", "swarm", "coordinator"]).optional(),
});

export type SubAgentTask = z.infer<typeof SubAgentTaskSchema>;

export const SubAgentResultSchema = z.object({
  taskId: z.string(),
  output: z.string(),
  duration: z.number(),
  status: z.enum(["success", "error", "timeout", "cancelled"]),
  turns: z.number(),
  toolCalls: z.number(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SubAgentResult = z.infer<typeof SubAgentResultSchema>;

export const SubAgentConfigSchema = z.object({
  maxConcurrency: z.number(),
  defaultTimeout: z.number(),
  defaultMaxTurns: z.number(),
  isolationLevel: z.enum(["full", "tools", "context"]),
  enableAntiRecursion: z.boolean(),
  enableForkPrefix: z.boolean(),
  enableWorkerConsciousness: z.boolean(),
  enableStructuredRouting: z.boolean(),
});

export type SubAgentConfig = z.infer<typeof SubAgentConfigSchema>;

export const SubAgentStatusSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.enum(["idle", "running", "completed", "error", "cancelled"]),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  progress: z.string().optional(),
});

export type SubAgentStatus = z.infer<typeof SubAgentStatusSchema>;

export const SubAgentContextSchema = z.object({
  sessionId: z.string(),
  parentSessionId: z.string().optional(),
  projectDir: z.string(),
  conversationHistory: z.array(SubAgentMessageSchema),
  availableTools: z.array(z.any()),
  metadata: z.record(z.string(), z.unknown()),
  depth: z.number().optional(),
  agentType: z.string().optional(),
});

export type SubAgentContext = z.infer<typeof SubAgentContextSchema>;

export class SubAgentSystem extends EventEmitter {
  private agents: Map<string, SubAgentContext> = new Map();
  private statuses: Map<string, SubAgentStatus> = new Map();
  private config: SubAgentConfig;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;
  private llmProvider: ((messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: SubAgentToolCall[] }>) | null = null;
  private antiRecursionGuard: AntiRecursionGuard;
  private forkPrefixOptimizer: ForkPrefixOptimizer;
  private messageRouter: MessageRouter;
  private workerConsciousness: WorkerConsciousnessInjector;
  private exploreAgent: ExploreAgent;
  private planAgent: PlanAgent;
  private verificationAgent: VerificationAgent;

  constructor(config?: Partial<SubAgentConfig>) {
    super();
    this.config = {
      maxConcurrency: config?.maxConcurrency || 5,
      defaultTimeout: config?.defaultTimeout || 120000,
      defaultMaxTurns: config?.defaultMaxTurns || 25,
      isolationLevel: config?.isolationLevel || "full",
      enableAntiRecursion: config?.enableAntiRecursion !== false,
      enableForkPrefix: config?.enableForkPrefix !== false,
      enableWorkerConsciousness: config?.enableWorkerConsciousness !== false,
      enableStructuredRouting: config?.enableStructuredRouting !== false,
    };

    this.antiRecursionGuard = new AntiRecursionGuard();
    this.forkPrefixOptimizer = new ForkPrefixOptimizer();
    this.messageRouter = new MessageRouter();
    this.workerConsciousness = new WorkerConsciousnessInjector();
    this.exploreAgent = new ExploreAgent();
    this.planAgent = new PlanAgent();
    this.verificationAgent = new VerificationAgent();
  }

  setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<unknown>): void {
    this.toolExecutor = executor;
  }

  setLlmProvider(provider: (messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: SubAgentToolCall[] }>): void {
    this.llmProvider = provider;
  }

  createAgentContext(sessionId: string, parentSessionId: string, projectDir: string, tools: ToolDefinition[], depth: number = 0, agentType: string = "general-purpose"): SubAgentContext {
    const context: SubAgentContext = {
      sessionId,
      parentSessionId,
      projectDir,
      conversationHistory: [],
      availableTools: this.config.isolationLevel === "full" ? [] : tools,
      metadata: {
        createdAt: Date.now(),
        parentSessionId,
      },
      depth,
      agentType,
    };

    if (this.config.enableAntiRecursion) {
      this.antiRecursionGuard.registerAgent(sessionId, parentSessionId, depth);
    }

    this.agents.set(sessionId, context);
    return context;
  }

  async execute(task: SubAgentTask, parentContext: SubAgentContext): Promise<SubAgentResult> {
    const startTime = Date.now();
    const agentId = `subagent_${task.id}_${Date.now()}`;
    const depth = (parentContext.depth || 0) + 1;
    const agentType = task.type || "general-purpose";
    const mode = task.mode || this.inferMode(task, depth);

    if (this.config.enableAntiRecursion) {
      const typeDef = BUILTIN_AGENT_TYPES[agentType];
      if (typeDef?.canSpawnSubagents === false && depth > 1) {
        return {
          taskId: task.id,
          output: `Blocked: agent type "${agentType}" cannot spawn subagents`,
          duration: Date.now() - startTime,
          status: "error",
          turns: 0,
          toolCalls: 0,
          error: `Agent type "${agentType}" does not support subagent spawning`,
        };
      }

      const check = this.antiRecursionGuard.canSpawnSubagent(parentContext.sessionId || "", task);
      if (!check.allowed) {
        return {
          taskId: task.id,
          output: `Blocked by anti-recursion: ${check.reason}`,
          duration: Date.now() - startTime,
          status: "error",
          turns: 0,
          toolCalls: 0,
          error: check.reason,
        };
      }
    }

    const status: SubAgentStatus = {
      id: agentId,
      type: agentType,
      status: "running",
      startedAt: Date.now(),
      progress: "Initializing",
    };

    this.statuses.set(agentId, status);
    this.emit("agent:start", { agentId, task });

    try {
      let result: SubAgentResult;

      switch (mode) {
        case "single":
          result = await this.executeSingleMode(task, parentContext, status, depth, agentType);
          break;
        case "swarm":
          result = await this.executeSwarmMode(task, parentContext, status, depth, agentType);
          break;
        case "coordinator":
          result = await this.executeCoordinatorMode(task, parentContext, status, depth, agentType);
          break;
        default:
          result = await this.executeSingleMode(task, parentContext, status, depth, agentType);
      }

      if (this.config.enableStructuredRouting) {
        const structured = this.messageRouter.parseStructuredResponse(result.output);
        result.output = this.messageRouter.formatForParent(structured);
      }

      status.status = "completed";
      status.completedAt = Date.now();
      this.emit("agent:complete", { agentId, result });

      return result;
    } catch (error) {
      status.status = "error";
      status.completedAt = Date.now();
      this.emit("agent:error", { agentId, error });

      return {
        taskId: task.id,
        output: "",
        duration: Date.now() - startTime,
        status: "error",
        turns: 0,
        toolCalls: 0,
        error: (error as Error).message,
      };
    }
  }

  async executeParallel(tasks: SubAgentTask[], parentContext: SubAgentContext): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];
    const batches: SubAgentTask[][] = [];

    for (let i = 0; i < tasks.length; i += this.config.maxConcurrency) {
      batches.push(tasks.slice(i, i + this.config.maxConcurrency));
    }

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map((task) => this.execute(task, parentContext))
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            taskId: batch[i].id,
            output: "",
            duration: 0,
            status: "error",
            turns: 0,
            toolCalls: 0,
            error: (result.reason as Error)?.message || "Unknown error",
          });
        }
      }
    }

    return results;
  }

  private async executeSingleMode(
    task: SubAgentTask,
    parentContext: SubAgentContext,
    status: SubAgentStatus,
    depth: number,
    agentType: string
  ): Promise<SubAgentResult> {
    const agentContext = this.createAgentContext(
      `subagent_${task.id}_${Date.now()}`,
      parentContext.sessionId,
      parentContext.projectDir,
      parentContext.availableTools,
      depth,
      agentType
    );

    return this.runAgent(task, agentContext, status);
  }

  private async executeSwarmMode(
    task: SubAgentTask,
    parentContext: SubAgentContext,
    status: SubAgentStatus,
    depth: number,
    agentType: string
  ): Promise<SubAgentResult> {
    const agentContext = this.createAgentContext(
      `swarm_${task.id}_${Date.now()}`,
      parentContext.sessionId,
      parentContext.projectDir,
      parentContext.availableTools,
      depth,
      agentType
    );

    agentContext.conversationHistory.push({
      role: "system",
      content: this.buildSystemPromptForAgentType(agentType, task),
    });

    agentContext.conversationHistory.push({
      role: "user",
      content: task.prompt,
    });

    const allowedTools = this.resolveAllowedTools(task, parentContext.availableTools);

    if (!this.llmProvider) {
      throw new Error("LLM provider not configured");
    }

    const startTime = Date.now();
    const maxIterations = 5;
    let iteration = 0;
    let finalOutput = "";

    while (iteration < maxIterations) {
      iteration++;
      status.progress = `Swarm iteration ${iteration}/${maxIterations}`;

      const response = await this.llmProvider(agentContext.conversationHistory, allowedTools);

      agentContext.conversationHistory.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      if (response.toolCalls && response.toolCalls.length > 0) {
        const handoffCall = response.toolCalls.find((tc) => tc.name.startsWith("handoff_to_"));

        if (handoffCall) {
          const targetAgentId = handoffCall.name.replace("handoff_to_", "");
          const targetTypeDef = BUILTIN_AGENT_TYPES[targetAgentId];

          if (targetTypeDef) {
            agentContext.agentType = targetAgentId;
            agentContext.conversationHistory[0] = {
              role: "system",
              content: this.buildSystemPromptForAgentType(targetAgentId, task),
            };
          }

          for (const toolCall of response.toolCalls) {
            if (this.toolExecutor) {
              try {
                const result = await this.toolExecutor(toolCall.name, toolCall.arguments);
                agentContext.conversationHistory.push({
                  role: "tool",
                  content: JSON.stringify(result),
                  toolCallId: toolCall.id,
                });
              } catch (error) {
                agentContext.conversationHistory.push({
                  role: "tool",
                  content: `Error: ${(error as Error).message}`,
                  toolCallId: toolCall.id,
                });
              }
            }
          }
        } else {
          for (const toolCall of response.toolCalls) {
            if (this.toolExecutor) {
              try {
                const result = await this.toolExecutor(toolCall.name, toolCall.arguments);
                agentContext.conversationHistory.push({
                  role: "tool",
                  content: JSON.stringify(result),
                  toolCallId: toolCall.id,
                });
              } catch (error) {
                agentContext.conversationHistory.push({
                  role: "tool",
                  content: `Error: ${(error as Error).message}`,
                  toolCallId: toolCall.id,
                });
              }
            }
          }
        }
      } else {
        finalOutput = response.content;
        break;
      }
    }

    return {
      taskId: task.id,
      output: finalOutput || agentContext.conversationHistory[agentContext.conversationHistory.length - 1]?.content || "",
      duration: Date.now() - startTime,
      status: "success",
      turns: iteration,
      toolCalls: agentContext.conversationHistory.filter((m) => m.toolCalls && m.toolCalls.length > 0).length,
      metadata: {
        mode: "swarm",
        iterations: iteration,
        agentType,
        depth,
      },
    };
  }

  private async executeCoordinatorMode(
    task: SubAgentTask,
    parentContext: SubAgentContext,
    status: SubAgentStatus,
    depth: number,
    agentType: string
  ): Promise<SubAgentResult> {
    const startTime = Date.now();

    if (!this.llmProvider) {
      throw new Error("LLM provider not configured");
    }

    const decomposition = await this.decomposeTask(task, parentContext);

    const results = await this.executeSubtasks(decomposition, parentContext, depth);

    const aggregatedOutput = this.aggregateResults(results, task);

    return {
      taskId: task.id,
      output: aggregatedOutput,
      duration: Date.now() - startTime,
      status: "success",
      turns: decomposition.subtasks.length,
      toolCalls: results.reduce((sum, r) => sum + r.toolCalls, 0),
      metadata: {
        mode: "coordinator",
        subtasksCount: decomposition.subtasks.length,
        workersUsed: new Set(decomposition.subtasks.map((s) => s.assignedWorkerType)).size,
        aggregationStrategy: "concat",
        depth,
      },
    };
  }

  private async decomposeTask(
    task: SubAgentTask,
    parentContext: SubAgentContext
  ): Promise<{ subtasks: Array<{ id: string; description: string; assignedWorkerType: string; dependencies: string[] }> }> {
    if (!this.llmProvider) {
      throw new Error("LLM provider not configured");
    }

    const availableTypes = Object.entries(BUILTIN_AGENT_TYPES)
      .filter(([_, def]) => def.canSpawnSubagents !== false)
      .map(([id, def]) => `- ${id}: ${def.description}`)
      .join("\n");

    const systemPrompt = `You are a task coordinator. Decompose complex tasks into subtasks and assign them to appropriate agent types.

Available agent types:
${availableTypes}

Rules:
1. Break down the task into logical subtasks
2. Assign each subtask to the most suitable agent type
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
      "assignedWorkerType": "agent_type_id",
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
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn("Failed to parse task decomposition, using fallback:", error);
    }

    return {
      subtasks: [
        {
          id: "subtask_1",
          description: task.description,
          assignedWorkerType: task.type || "general-purpose",
          dependencies: [],
        },
      ],
    };
  }

  private async executeSubtasks(
    decomposition: { subtasks: Array<{ id: string; description: string; assignedWorkerType: string; dependencies: string[] }> },
    parentContext: SubAgentContext,
    depth: number
  ): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];
    const completedIds = new Set<string>();

    const executeSubtask = async (subtask: typeof decomposition.subtasks[0], currentDepth: number): Promise<SubAgentResult> => {
      for (const depId of subtask.dependencies) {
        if (!completedIds.has(depId)) {
          const depSubtask = decomposition.subtasks.find((s) => s.id === depId);
          if (depSubtask) {
            await executeSubtask(depSubtask, currentDepth);
          }
        }
      }

      if (currentDepth >= this.antiRecursionGuard.getMaxDepth()) {
        return {
          taskId: subtask.id,
          output: `Blocked: max delegation depth (${this.antiRecursionGuard.getMaxDepth()}) reached`,
          duration: 0,
          status: "error",
          turns: 0,
          toolCalls: 0,
          error: `Anti-recursion: depth ${currentDepth} exceeds max ${this.antiRecursionGuard.getMaxDepth()}`,
        };
      }

      const subAgentTask: SubAgentTask = {
        id: subtask.id,
        type: subtask.assignedWorkerType,
        description: subtask.description,
        prompt: subtask.description,
        timeout: 60000,
        maxTurns: 15,
      };

      const childContext: SubAgentContext = {
        ...parentContext,
        sessionId: `coordinator_${subtask.id}`,
        depth: currentDepth,
        agentType: subtask.assignedWorkerType,
      };

      const result = await this.executeSingleMode(subAgentTask, childContext, {
        id: `coordinator_${subtask.id}`,
        type: subtask.assignedWorkerType,
        status: "running",
        startedAt: Date.now(),
        progress: "Executing subtask",
      }, currentDepth, subtask.assignedWorkerType);

      completedIds.add(subtask.id);
      return result;
    };

    const independentSubtasks = decomposition.subtasks.filter((s) => s.dependencies.length === 0);
    const dependentSubtasks = decomposition.subtasks.filter((s) => s.dependencies.length > 0);

    const independentResults = await Promise.allSettled(
      independentSubtasks.map((s) => executeSubtask(s, depth))
    );

    for (const result of independentResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }

    for (const subtask of dependentSubtasks) {
      try {
        const result = await executeSubtask(subtask, depth);
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
    const parts: string[] = [];

    for (const result of results) {
      if (result.status === "success" && result.output) {
        parts.push(`## ${result.taskId}\n\n${result.output}`);
      }
    }

    return parts.join("\n\n---\n\n") || "No successful results.";
  }

  private async runAgent(
    task: SubAgentTask,
    context: SubAgentContext,
    status: SubAgentStatus
  ): Promise<SubAgentResult> {
    const startTime = Date.now();
    const timeout = task.timeout || this.config.defaultTimeout;
    const maxTurns = task.maxTurns || this.config.defaultMaxTurns;

    const allowedTools = this.resolveAllowedTools(task, context.availableTools);

    let systemPrompt = task.systemPrompt || this.buildSystemPromptForAgentType(context.agentType || task.type, task);

    if (this.config.enableForkPrefix) {
      task.description = this.forkPrefixOptimizer.formatDescription(task.description);
      task.prompt = this.forkPrefixOptimizer.formatPrompt(task.description, task.prompt);
      this.forkPrefixOptimizer.trackPrefix(task.description);
    }

    const typeDef = context.agentType ? BUILTIN_AGENT_TYPES[context.agentType] : undefined;
    if (this.config.enableWorkerConsciousness && typeDef?.canSpawnSubagents === false) {
      systemPrompt = this.workerConsciousness.inject(systemPrompt);
    }

    if (this.config.enableAntiRecursion && context.depth !== undefined) {
      const warning = this.antiRecursionGuard.formatAntiRecursionWarning(context.depth);
      systemPrompt += `\n${warning}`;
    }

    context.conversationHistory.push({
      role: "system",
      content: systemPrompt,
    });

    context.conversationHistory.push({
      role: "user",
      content: task.prompt,
    });

    let turnCount = 0;
    let toolCallCount = 0;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Sub-agent timed out after ${timeout}ms`)), timeout);
    });

    const agentPromise = (async (): Promise<SubAgentResult> => {
      while (turnCount < maxTurns) {
        turnCount++;
        status.progress = `Turn ${turnCount}/${maxTurns}`;

        if (!this.llmProvider) {
          throw new Error("LLM provider not configured");
        }

        const response = await this.llmProvider(context.conversationHistory, allowedTools);

        context.conversationHistory.push({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });

        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            toolCallCount++;

            if (!this.toolExecutor) {
              throw new Error("Tool executor not configured");
            }

            status.progress = `Executing tool: ${toolCall.name}`;
            this.emit("agent:toolCall", { agentId: context.sessionId, toolCall });

            try {
              const toolResult = await this.toolExecutor(toolCall.name, toolCall.arguments);

              context.conversationHistory.push({
                role: "tool",
                content: JSON.stringify(toolResult),
                toolCallId: toolCall.id,
              });
            } catch (error) {
              context.conversationHistory.push({
                role: "tool",
                content: `Error: ${(error as Error).message}`,
                toolCallId: toolCall.id,
              });
            }
          }
        } else {
          const duration = Date.now() - startTime;

          let output = response.content;
          if (this.config.enableForkPrefix) {
            output = this.forkPrefixOptimizer.formatCompletion(output);
          }

          const currentTypeDef = context.agentType ? BUILTIN_AGENT_TYPES[context.agentType] : undefined;
          if (this.config.enableWorkerConsciousness && currentTypeDef?.canSpawnSubagents === false) {
            const validation = this.workerConsciousness.validateResponse(output);
            if (!validation.valid) {
              output += `\n\nViolations: ${validation.violations.join("; ")}`;
            }
          }

          return {
            taskId: task.id,
            output,
            duration,
            status: "success",
            turns: turnCount,
            toolCalls: toolCallCount,
            metadata: {
              sessionId: context.sessionId,
              conversationLength: context.conversationHistory.length,
              depth: context.depth,
              agentType: context.agentType,
            },
          };
        }
      }

      return {
        taskId: task.id,
        output: context.conversationHistory[context.conversationHistory.length - 1]?.content || "",
        duration: Date.now() - startTime,
        status: "success",
        turns: turnCount,
        toolCalls: toolCallCount,
        metadata: {
          maxTurnsReached: true,
          depth: context.depth,
          agentType: context.agentType,
        },
      };
    })();

    return Promise.race([agentPromise, timeoutPromise.then(() => {
      throw new Error(`Sub-agent timed out after ${timeout}ms`);
    })]).catch((error) => {
      return {
        taskId: task.id,
        output: "",
        duration: Date.now() - startTime,
        status: "error",
        turns: turnCount,
        toolCalls: toolCallCount,
        error: (error as Error).message,
      };
    });
  }

  private resolveAllowedTools(task: SubAgentTask, availableTools: ToolDefinition[]): ToolDefinition[] {
    return resolveAllowedTools(task.type || "general-purpose", task.allowedTools, availableTools);
  }

  private buildSystemPromptForAgentType(agentType: string, task: SubAgentTask): string {
    const basePrompt = buildSystemPromptForType(agentType);

    const parts = [
      basePrompt,
      "",
      `Task: ${task.description}`,
      "",
      "Instructions:",
      "1. Focus only on the given task",
      "2. Use only the allowed tools",
      "3. Return concise, structured results",
      "4. Do not ask for clarification - make reasonable assumptions",
      "5. When done, return your final answer without using any tools",
    ];

    if (task.context) {
      parts.push("", "Context:", JSON.stringify(task.context, null, 2));
    }

    return parts.join("\n");
  }

  private inferMode(task: SubAgentTask, depth: number): "single" | "swarm" | "coordinator" {
    if (task.mode) return task.mode;

    const description = `${task.description} ${task.prompt}`.toLowerCase();

    const hasMultipleSubtasks = /\band\b.*\band\b/i.test(description) || /\bstep\s*\d/i.test(description) || /\b\d+\.\s/.test(description);
    const requiresParallelism = /\bparallel/i.test(description) || /\bconcurrent/i.test(description);
    const hasDependencies = /\bdepend.*on\b/i.test(description) || /\brequires?\b/i.test(description);

    if (requiresParallelism || (hasMultipleSubtasks && hasDependencies)) {
      return "coordinator";
    }

    if (hasMultipleSubtasks && depth < 2) {
      return "swarm";
    }

    return "single";
  }

  cancelAgent(agentId: string): boolean {
    const status = this.statuses.get(agentId);
    if (!status || status.status !== "running") {
      return false;
    }

    status.status = "cancelled";
    status.completedAt = Date.now();
    this.emit("agent:cancelled", { agentId });
    return true;
  }

  getStatus(agentId: string): SubAgentStatus | undefined {
    return this.statuses.get(agentId);
  }

  getAllStatuses(): SubAgentStatus[] {
    return Array.from(this.statuses.values());
  }

  getContext(sessionId: string): SubAgentContext | undefined {
    return this.agents.get(sessionId);
  }

  cleanup(sessionId: string): void {
    this.agents.delete(sessionId);
    for (const [id, status] of this.statuses.entries()) {
      if (id.startsWith(sessionId) || status.id === sessionId) {
        this.statuses.delete(id);
      }
    }
  }

  getActiveCount(): number {
    let count = 0;
    for (const status of this.statuses.values()) {
      if (status.status === "running") count++;
    }
    return count;
  }

  getAntiRecursionGuard(): AntiRecursionGuard {
    return this.antiRecursionGuard;
  }

  getForkPrefixOptimizer(): ForkPrefixOptimizer {
    return this.forkPrefixOptimizer;
  }

  getMessageRouter(): MessageRouter {
    return this.messageRouter;
  }

  getWorkerConsciousness(): WorkerConsciousnessInjector {
    return this.workerConsciousness;
  }

  getExploreAgent(): ExploreAgent {
    return this.exploreAgent;
  }

  getPlanAgent(): PlanAgent {
    return this.planAgent;
  }

  getVerificationAgent(): VerificationAgent {
    return this.verificationAgent;
  }
}
