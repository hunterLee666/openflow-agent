import type { CapabilityPlugin, CapabilityContext, ToolDefinition } from "../types/index.js";
import { CapabilityType } from "../types/index.js";

export interface LegacyToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  isConcurrencySafe: boolean;
  isReadOnly: boolean;
  isDestructive?: boolean;
  handler: (input: unknown, ctx: unknown) => Promise<unknown>;
  validateInput?: (input: unknown, ctx: unknown) => Promise<{ result: boolean; message?: string }>;
  maxResultSizeChars?: number;
}

export function adaptToolToPlugin(tool: LegacyToolDefinition): CapabilityPlugin {
  return {
    manifest: {
      name: tool.name,
      version: "1.0.0",
      type: CapabilityType.TOOL,
      description: tool.description,
      triggers: [tool.name],
    },

    async activate(ctx: CapabilityContext) {
      const adaptedTool: ToolDefinition = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        isReadOnly: tool.isReadOnly,
        handler: async (input: unknown, toolCtx: unknown) => {
          if (tool.validateInput) {
            const validation = await tool.validateInput(input, toolCtx);
            if (!validation.result) {
              throw new Error(validation.message || "Input validation failed");
            }
          }
          return tool.handler(input, toolCtx);
        },
      };

      ctx.tools.register(adaptedTool);
      return { dispose: () => ctx.tools.unregister(tool.name) };
    },

    async deactivate() {
      // Cleanup handled by dispose
    },
  };
}

export function adaptToolsToPlugins(tools: LegacyToolDefinition[]): CapabilityPlugin[] {
  return tools.map(adaptToolToPlugin);
}
