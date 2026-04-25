import { EventEmitter } from "node:events";
import type { ToolDefinition } from "../types/index.js";

export interface SubAgentContext {
  sessionId: string;
  parentSessionId?: string;
  projectDir: string;
  conversationHistory: SubAgentMessage[];
  availableTools: ToolDefinition[];
  metadata: Record<string, unknown>;
}

export interface SubAgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: SubAgentToolCall[];
  toolCallId?: string;
}

export interface SubAgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface SubAgentTask {
  id: string;
  type: string;
  description: string;
  prompt: string;
  context?: Record<string, unknown>;
  allowedTools?: string[];
  systemPrompt?: string;
  timeout?: number;
  maxTurns?: number;
}

export interface SubAgentResult {
  taskId: string;
  output: string;
  duration: number;
  status: "success" | "error" | "timeout" | "cancelled";
  turns: number;
  toolCalls: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SubAgentConfig {
  maxConcurrency: number;
  defaultTimeout: number;
  defaultMaxTurns: number;
  isolationLevel: "full" | "tools" | "context";
}

export interface SubAgentStatus {
  id: string;
  type: string;
  status: "idle" | "running" | "completed" | "error" | "cancelled";
  startedAt?: number;
  completedAt?: number;
  progress?: string;
}

export class SubAgentSystem extends EventEmitter {
  private agents: Map<string, SubAgentContext> = new Map();
  private statuses: Map<string, SubAgentStatus> = new Map();
  private config: SubAgentConfig;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;
  private llmProvider: ((messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: SubAgentToolCall[] }>) | null = null;

  constructor(config?: Partial<SubAgentConfig>) {
    super();
    this.config = {
      maxConcurrency: config?.maxConcurrency || 5,
      defaultTimeout: config?.defaultTimeout || 120000,
      defaultMaxTurns: config?.defaultMaxTurns || 25,
      isolationLevel: config?.isolationLevel || "full",
    };
  }

  setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<unknown>): void {
    this.toolExecutor = executor;
  }

  setLlmProvider(provider: (messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: SubAgentToolCall[] }>): void {
    this.llmProvider = provider;
  }

  createAgentContext(sessionId: string, parentSessionId: string, projectDir: string, tools: ToolDefinition[]): SubAgentContext {
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
    };

    this.agents.set(sessionId, context);
    return context;
  }

  async execute(task: SubAgentTask, parentContext: SubAgentContext): Promise<SubAgentResult> {
    const startTime = Date.now();
    const agentId = `subagent_${task.id}_${Date.now()}`;

    const status: SubAgentStatus = {
      id: agentId,
      type: task.type,
      status: "running",
      startedAt: Date.now(),
      progress: "Initializing",
    };

    this.statuses.set(agentId, status);
    this.emit("agent:start", { agentId, task });

    const agentContext = this.createAgentContext(
      agentId,
      parentContext.sessionId,
      parentContext.projectDir,
      parentContext.availableTools
    );

    try {
      const result = await this.runAgent(task, agentContext, status);

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

  private async runAgent(
    task: SubAgentTask,
    context: SubAgentContext,
    status: SubAgentStatus
  ): Promise<SubAgentResult> {
    const startTime = Date.now();
    const timeout = task.timeout || this.config.defaultTimeout;
    const maxTurns = task.maxTurns || this.config.defaultMaxTurns;

    const allowedTools = this.resolveAllowedTools(task, context.availableTools);

    const systemPrompt = task.systemPrompt || this.buildSystemPrompt(task);

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

          return {
            taskId: task.id,
            output: response.content,
            duration,
            status: "success",
            turns: turnCount,
            toolCalls: toolCallCount,
            metadata: {
              sessionId: context.sessionId,
              conversationLength: context.conversationHistory.length,
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
    if (!task.allowedTools || task.allowedTools.length === 0) {
      return availableTools;
    }

    const toolNames = new Set<string>();

    for (const toolRef of task.allowedTools) {
      if (toolRef.startsWith("group:")) {
        const groupTools = TOOL_GROUPS[toolRef];
        if (groupTools) {
          for (const t of groupTools) {
            toolNames.add(t);
          }
        }
      } else {
        toolNames.add(toolRef);
      }
    }

    return availableTools.filter((t) => toolNames.has(t.name));
  }

  private buildSystemPrompt(task: SubAgentTask): string {
    const parts = [
      `You are a specialized sub-agent of type "${task.type}".`,
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
}

export const BUILTIN_AGENT_TYPES: Record<string, { description: string; defaultTools?: string[] }> = {
  "general-purpose": {
    description: "General-purpose sub-agent for research, code search, and analysis",
  },
  "statusline-setup": {
    description: "Configures the status line display format",
    defaultTools: ["Read", "Write"],
  },
  "output-style-setup": {
    description: "Configures the output style and formatting",
    defaultTools: ["Read", "Write"],
  },
  "code-reviewer": {
    description: "Reviews code for quality, security, and best practices",
    defaultTools: ["Read", "Grep", "Glob"],
  },
  "test-runner": {
    description: "Runs tests and reports results",
    defaultTools: ["Bash", "Read", "Glob"],
  },
  "file-organizer": {
    description: "Organizes and structures project files",
    defaultTools: ["Read", "Write", "Edit", "LS", "Glob"],
  },
};

export const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "LS"],
  "group:search": ["Glob", "Grep"],
  "group:runtime": ["Bash", "BashOutput", "KillShell"],
  "group:web": ["WebFetch", "WebSearch"],
  "group:utility": ["TodoWrite", "ExitPlanMode", "SlashCommand", "Task"],
  "group:git": ["git_status", "git_diff", "git_log", "git_branch"],
};
