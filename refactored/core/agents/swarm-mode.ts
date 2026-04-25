import type { SubAgentMessage, SubAgentTask, SubAgentResult, SubAgentContext } from "./sub-agent-system.js";
import type { ToolDefinition } from "../types/index.js";
import { SwarmAgent } from "./agent-types.js";
import { MessageRouter } from "./message-router.js";
export { SwarmAgent } from "./agent-types.js";

export interface SwarmConfig {
  maxIterations: number;
  maxAgentsPerTask: number;
  enableParallelExecution: boolean;
  parallelLimit: number;
}

export interface SwarmContext {
  agents: Map<string, SwarmAgent>;
  currentAgentId: string;
  conversationHistory: SubAgentMessage[];
  sharedMemory: Map<string, unknown>;
  iterationCount: number;
}

export class SwarmMode {
  private config: SwarmConfig;
  private llmProvider: ((messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>) | null = null;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;
  private messageRouter: MessageRouter;

  constructor(config?: Partial<SwarmConfig>) {
    this.config = {
      maxIterations: config?.maxIterations || 10,
      maxAgentsPerTask: config?.maxAgentsPerTask || 5,
      enableParallelExecution: config?.enableParallelExecution ?? true,
      parallelLimit: config?.parallelLimit || 3,
    };
    this.messageRouter = new MessageRouter();
  }

  setLlmProvider(provider: (messages: SubAgentMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }>): void {
    this.llmProvider = provider;
  }

  setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<unknown>): void {
    this.toolExecutor = executor;
  }

  async execute(
    task: SubAgentTask,
    agents: SwarmAgent[],
    parentContext: SubAgentContext
  ): Promise<SubAgentResult> {
    const startTime = Date.now();
    const swarmCtx = this.initializeSwarm(agents, task);

    let iteration = 0;
    let finalOutput = "";

    while (iteration < this.config.maxIterations) {
      iteration++;
      const currentAgent = swarmCtx.agents.get(swarmCtx.currentAgentId);

      if (!currentAgent) {
        break;
      }

      const messages = this.buildAgentMessages(swarmCtx, currentAgent);
      const availableTools = this.resolveToolsForAgent(currentAgent, parentContext.availableTools);
      const handoffTools = this.createHandoffTools(swarmCtx, currentAgent);
      const allTools = [...availableTools, ...handoffTools];

      if (!this.llmProvider) {
        throw new Error("LLM provider not configured");
      }

      const response = await this.llmProvider(messages, allTools);

      swarmCtx.conversationHistory.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      if (response.toolCalls && response.toolCalls.length > 0) {
        const handoffCall = response.toolCalls.find((tc) => tc.name.startsWith("handoff_to_"));

        if (handoffCall) {
          const targetAgentId = handoffCall.name.replace("handoff_to_", "");
          const targetAgent = swarmCtx.agents.get(targetAgentId);

          if (targetAgent) {
            swarmCtx.currentAgentId = targetAgentId;
            swarmCtx.iterationCount++;

            swarmCtx.sharedMemory.set("lastAgentOutput", response.content);
            swarmCtx.sharedMemory.set("handoffReason", handoffCall.arguments.reason || "");
          }
        } else {
          for (const toolCall of response.toolCalls) {
            if (this.toolExecutor) {
              try {
                const result = await this.toolExecutor(toolCall.name, toolCall.arguments);
                swarmCtx.conversationHistory.push({
                  role: "tool",
                  content: JSON.stringify(result),
                  toolCallId: toolCall.id,
                });
              } catch (error) {
                swarmCtx.conversationHistory.push({
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

    const duration = Date.now() - startTime;

    const finalContent = finalOutput || swarmCtx.conversationHistory[swarmCtx.conversationHistory.length - 1]?.content || "";
    const structuredOutput = this.messageRouter.parseStructuredResponse(finalContent);

    return {
      taskId: task.id,
      output: this.messageRouter.formatForParent(structuredOutput),
      duration,
      status: "success",
      turns: iteration,
      toolCalls: swarmCtx.conversationHistory.filter((m) => m.toolCalls && m.toolCalls.length > 0).length,
      metadata: {
        mode: "swarm",
        iterations: iteration,
        agentsUsed: swarmCtx.iterationCount,
        sharedMemorySize: swarmCtx.sharedMemory.size,
      },
    };
  }

  private initializeSwarm(agents: SwarmAgent[], task: SubAgentTask): SwarmContext {
    const agentMap = new Map<string, SwarmAgent>();

    for (const agent of agents) {
      agentMap.set(agent.id, agent);
    }

    const firstAgent = agents[0];

    return {
      agents: agentMap,
      currentAgentId: firstAgent.id,
      conversationHistory: [
        {
          role: "system",
          content: `${firstAgent.systemPrompt}\n\nTask: ${task.description}\n\nYou can handoff to other agents using the handoff tools available to you.`,
        },
        {
          role: "user",
          content: task.prompt,
        },
      ],
      sharedMemory: new Map(),
      iterationCount: 1,
    };
  }

  private buildAgentMessages(swarmCtx: SwarmContext, agent: SwarmAgent): SubAgentMessage[] {
    const messages = [...swarmCtx.conversationHistory];

    const lastSystemIdx = messages.findLastIndex((m) => m.role === "system");

    if (lastSystemIdx >= 0) {
      messages[lastSystemIdx] = {
        role: "system",
        content: `${agent.systemPrompt}\n\nYou are currently active. Focus on the task and use tools or handoff when needed.`,
      };
    }

    return messages;
  }

  private resolveToolsForAgent(agent: SwarmAgent, availableTools: ToolDefinition[]): ToolDefinition[] {
    if (!agent.allowedTools || agent.allowedTools.length === 0) {
      return availableTools;
    }

    const allowedSet = new Set(agent.allowedTools);
    return availableTools.filter((t) => allowedSet.has(t.name));
  }

  private createHandoffTools(swarmCtx: SwarmContext, currentAgent: SwarmAgent): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const handoffId of currentAgent.handoffs) {
      const targetAgent = swarmCtx.agents.get(handoffId);

      if (targetAgent) {
        tools.push({
          name: `handoff_to_${handoffId}`,
          description: `Handoff to ${targetAgent.name}: ${targetAgent.description}`,
          inputSchema: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "Reason for handoff",
              },
              context: {
                type: "string",
                description: "Additional context to pass to the target agent",
              },
            },
            required: ["reason"],
          },
          handler: async (input: unknown) => {
            const typed = input as Record<string, unknown>;
            return {
              success: true,
              targetAgent: handoffId,
              reason: typed.reason,
            };
          },
        });
      }
    }

    return tools;
  }
}
