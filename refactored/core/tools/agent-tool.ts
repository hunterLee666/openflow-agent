import type { CapabilityPlugin, CapabilityContext } from "../types/index.js";
import { CapabilityType } from "../types/index.js";

export interface AgentToolManifest {
  name: string;
  version: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  triggers: string[];
  maxSteps?: number;
  temperature?: number;
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
      const agentTool = {
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

      ctx.tools.register(agentTool);
      return { dispose: () => ctx.tools.unregister(`agent_${manifest.name}`) };
    },

    async deactivate(): Promise<void> {
      // Cleanup handled by dispose
    },
  };
}
