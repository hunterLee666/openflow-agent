import type { CapabilityPlugin, CapabilityContext, ToolDefinition } from "../types/index.js";
import { CapabilityType } from "../types/index.js";
import { SwarmMode, type SwarmAgent } from "../agents/swarm-mode.js";
import { CoordinatorMode, type WorkerAgent } from "../agents/coordinator-mode.js";
import { ModeSelector, type AgentMode } from "../agents/mode-selector.js";
import type { SubAgentTask, SubAgentContext, SubAgentResult } from "../agents/sub-agent-system.js";

export interface AgentToolManifest {
  name: string;
  version: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  triggers: string[];
  maxSteps?: number;
  temperature?: number;
  mode?: "auto" | "single" | "swarm" | "coordinator";
  workers?: Array<{
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    allowedTools: string[];
    handoffs?: string[];
  }>;
}

function createSingleAgentTool(
  manifest: AgentToolManifest,
  ctx: CapabilityContext
): ToolDefinition {
  return {
    name: `agent_${manifest.name}`,
    description: `Run agent: ${manifest.description}`,
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal" },
      },
    },
    isReadOnly: true,
    handler: async (input: unknown) => {
      const typed = input as { goal: string };
      const messages = [
        { role: "system", content: manifest.systemPrompt },
        { role: "user", content: typed.goal },
      ];

      const response = await ctx.llm.chat(messages, {
        tools: ctx.tools.list().filter((t) => manifest.allowedTools.includes(t.name)),
        temperature: manifest.temperature,
      });

      return response;
    },
  };
}

function createSwarmAgentTool(
  manifest: AgentToolManifest,
  ctx: CapabilityContext
): ToolDefinition {
  const swarmMode = new SwarmMode({
    maxIterations: manifest.maxSteps || 10,
    enableParallelExecution: true,
    parallelLimit: 3,
  });

  swarmMode.setLlmProvider(async (messages, tools) => {
    const response = await ctx.llm.chat(messages, {
      tools,
      temperature: manifest.temperature,
    });
    const typedResponse = response as { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };
    return {
      content: typedResponse.content,
      toolCalls: typedResponse.toolCalls,
    };
  });

  swarmMode.setToolExecutor(async (toolName, args) => {
    const availableTools = ctx.tools.list();
    const tool = availableTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return (tool as ToolDefinition).handler(args, {});
  });

  return {
    name: `agent_${manifest.name}`,
    description: `Run agent swarm: ${manifest.description}`,
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal" },
        context: { type: "string", description: "Additional context" },
      },
    },
    isReadOnly: true,
    handler: async (input: unknown) => {
      const typed = input as { goal: string; context?: string };

      if (!manifest.workers || manifest.workers.length === 0) {
        throw new Error("Swarm mode requires workers to be defined");
      }

      const swarmAgents: SwarmAgent[] = manifest.workers.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        systemPrompt: w.systemPrompt,
        allowedTools: w.allowedTools,
        handoffs: w.handoffs || [],
      }));

      const task: SubAgentTask = {
        id: `swarm_${manifest.name}_${Date.now()}`,
        type: "swarm",
        description: typed.goal,
        prompt: typed.context ? `${typed.goal}\n\nContext: ${typed.context}` : typed.goal,
        systemPrompt: manifest.systemPrompt,
        allowedTools: manifest.allowedTools,
        timeout: 120000,
        maxTurns: manifest.maxSteps || 25,
      };

      const parentContext: SubAgentContext = {
        sessionId: task.id,
        parentSessionId: undefined,
        projectDir: process.cwd(),
        conversationHistory: [],
        availableTools: ctx.tools.list(),
        metadata: {},
      };

      const result = await swarmMode.execute(task, swarmAgents, parentContext);

      return {
        output: result.output,
        metadata: result.metadata,
        duration: result.duration,
        mode: "swarm",
      };
    },
  };
}

function createCoordinatorAgentTool(
  manifest: AgentToolManifest,
  ctx: CapabilityContext
): ToolDefinition {
  const coordinatorMode = new CoordinatorMode({
    maxDelegationDepth: 3,
    enableValidation: true,
    aggregationStrategy: "concat",
    maxWorkers: manifest.workers?.length || 5,
  });

  coordinatorMode.setLlmProvider(async (messages, tools) => {
    const response = await ctx.llm.chat(messages, {
      tools,
      temperature: manifest.temperature,
    });
    const typedResponse = response as { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };
    return {
      content: typedResponse.content,
      toolCalls: typedResponse.toolCalls,
    };
  });

  coordinatorMode.setToolExecutor(async (toolName, args) => {
    const availableTools = ctx.tools.list();
    const tool = availableTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return (tool as ToolDefinition).handler(args, {});
  });

  coordinatorMode.setSubAgentExecutor(async (task, parentCtx) => {
    const messages = [
      { role: "system", content: task.systemPrompt || manifest.systemPrompt },
      { role: "user", content: task.prompt },
    ];

    const worker = manifest.workers?.find((w) => w.id === task.id.split("_")[0]);
    const workerTools = ctx.tools.list().filter((t) =>
      (worker?.allowedTools || manifest.allowedTools).includes(t.name)
    );

    const response = await ctx.llm.chat(messages, {
      tools: workerTools,
      temperature: manifest.temperature,
    });

    const typedResponse = response as { content: string; toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };

    return {
      taskId: task.id,
      output: typedResponse.content,
      duration: 0,
      status: "success",
      turns: 1,
      toolCalls: typedResponse.toolCalls?.length || 0,
    };
  });

  return {
    name: `agent_${manifest.name}`,
    description: `Run agent coordinator: ${manifest.description}`,
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Task goal" },
        context: { type: "string", description: "Additional context" },
      },
    },
    isReadOnly: true,
    handler: async (input: unknown) => {
      const typed = input as { goal: string; context?: string };

      if (!manifest.workers || manifest.workers.length === 0) {
        throw new Error("Coordinator mode requires workers to be defined");
      }

      const workers: WorkerAgent[] = manifest.workers.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        systemPrompt: w.systemPrompt,
        allowedTools: w.allowedTools,
      }));

      const task: SubAgentTask = {
        id: `coord_${manifest.name}_${Date.now()}`,
        type: "coordinator",
        description: typed.goal,
        prompt: typed.context ? `${typed.goal}\n\nContext: ${typed.context}` : typed.goal,
        systemPrompt: manifest.systemPrompt,
        allowedTools: manifest.allowedTools,
        timeout: 120000,
        maxTurns: manifest.maxSteps || 25,
      };

      const parentContext: SubAgentContext = {
        sessionId: task.id,
        parentSessionId: undefined,
        projectDir: process.cwd(),
        conversationHistory: [],
        availableTools: ctx.tools.list(),
        metadata: {},
      };

      const result = await coordinatorMode.execute(task, workers, parentContext);

      return {
        output: result.output,
        metadata: result.metadata,
        duration: result.duration,
        mode: "coordinator",
      };
    },
  };
}

export function createAgentTool(manifest: AgentToolManifest): CapabilityPlugin {
  return {
    manifest: {
      name: manifest.name,
      version: manifest.version,
      type: CapabilityType.AGENT,
      description: manifest.description,
      triggers: manifest.triggers,
      allowedTools: manifest.allowedTools,
    },

    async activate(ctx: CapabilityContext): Promise<unknown> {
      const mode = manifest.mode || "auto";

      let agentTool: ToolDefinition;

      if (mode === "single") {
        agentTool = createSingleAgentTool(manifest, ctx);
      } else if (mode === "swarm") {
        agentTool = createSwarmAgentTool(manifest, ctx);
      } else if (mode === "coordinator") {
        agentTool = createCoordinatorAgentTool(manifest, ctx);
      } else {
        const modeSelector = new ModeSelector();

        agentTool = {
          name: `agent_${manifest.name}`,
          description: `Run agent (auto mode): ${manifest.description}`,
          inputSchema: {
            type: "object",
            properties: {
              goal: { type: "string", description: "Task goal" },
              context: { type: "string", description: "Additional context" },
              forceMode: {
                type: "string",
                enum: ["single", "swarm", "coordinator"],
                description: "Force specific mode instead of auto-detection",
              },
            },
          },
          isReadOnly: true,
          handler: async (input: unknown) => {
            const typed = input as { goal: string; context?: string; forceMode?: AgentMode };

            const task: SubAgentTask = {
              id: `auto_${manifest.name}_${Date.now()}`,
              type: "auto",
              description: typed.goal,
              prompt: typed.context ? `${typed.goal}\n\nContext: ${typed.context}` : typed.goal,
              systemPrompt: manifest.systemPrompt,
              allowedTools: manifest.allowedTools,
              timeout: 120000,
              maxTurns: manifest.maxSteps || 25,
            };

            const analysis = modeSelector.analyzeTask(task);
            const selectedMode = typed.forceMode || analysis.recommendedMode;

            if (selectedMode === "single") {
              const tool = createSingleAgentTool(manifest, ctx);
              return tool.handler(input, {});
            } else if (selectedMode === "swarm") {
              if (!manifest.workers || manifest.workers.length === 0) {
                const tool = createSingleAgentTool(manifest, ctx);
                return tool.handler(input, {});
              }
              const tool = createSwarmAgentTool(manifest, ctx);
              return tool.handler(input, {});
            } else {
              if (!manifest.workers || manifest.workers.length === 0) {
                const tool = createSingleAgentTool(manifest, ctx);
                return tool.handler(input, {});
              }
              const tool = createCoordinatorAgentTool(manifest, ctx);
              return tool.handler(input, {});
            }
          },
        };
      }

      ctx.tools.register(agentTool);
      return { dispose: () => ctx.tools.unregister(`agent_${manifest.name}`) };
    },

    async deactivate(): Promise<void> {
      // Cleanup handled by dispose
    },
  };
}
