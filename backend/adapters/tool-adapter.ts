import type { CapabilityPlugin, CapabilityContext, ToolDefinition } from "../types/index.js";
import { z } from "zod";

export const LegacyToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.unknown(),
  outputSchema: z.unknown().optional(),
  isConcurrencySafe: z.boolean(),
  isReadOnly: z.boolean(),
  isDestructive: z.boolean().optional(),
  handler: z.any(),
  validateInput: z.any().optional(),
  maxResultSizeChars: z.number().optional(),
});

export type LegacyToolDefinition = z.infer<typeof LegacyToolDefinitionSchema>;

export function adaptToolToPlugin(tool: LegacyToolDefinition): CapabilityPlugin {
  return {
    manifest: {
      name: tool.name,
      version: "1.0.0",
      type: "tool" as const,
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
