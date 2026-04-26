import type { CapabilityPlugin, CapabilityContext } from "../types/index.js";
import { z } from "zod";

export const LegacyCommandContextSchema = z.object({
  cwd: z.string().optional(),
  memory: z.unknown().optional(),
  config: z.unknown().optional(),
  sessionId: z.string().optional(),
});

export const LegacySlashCommandSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  hidden: z.boolean().optional(),
  handler: z.any(),
  template: z.string().optional(),
});

export type LegacySlashCommand = z.infer<typeof LegacySlashCommandSchema>;
export type LegacyCommandContext = z.infer<typeof LegacyCommandContextSchema>;

export function adaptCommandToPlugin(command: LegacySlashCommand): CapabilityPlugin {
  const allTriggers = [command.name, ...command.aliases];

  return {
    manifest: {
      name: command.name,
      version: "1.0.0",
      type: "command" as const,
      description: command.description,
      triggers: allTriggers,
      tags: command.hidden ? ["hidden"] : undefined,
    },

    async activate(ctx: CapabilityContext) {
      const commandTool: import("../types/index.js").ToolDefinition = {
        name: `cmd_${command.name}`,
        description: `Execute /${command.name} command: ${command.description}`,
        inputSchema: { args: "string" },
        isReadOnly: true,
        handler: async (input: unknown) => {
          const args = typeof input === "object" && input !== null && "args" in input
            ? (input as { args: string }).args
            : "";
          const legacyCtx: LegacyCommandContext = {
            cwd: process.cwd(),
          };
          return command.handler(args, legacyCtx);
        },
      };

      ctx.tools.register(commandTool);
      return { dispose: () => ctx.tools.unregister(`cmd_${command.name}`) };
    },

    async deactivate() {
      // Cleanup handled by dispose
    },
  };
}

export function adaptCommandsToPlugins(commands: LegacySlashCommand[]): CapabilityPlugin[] {
  return commands.map(adaptCommandToPlugin);
}
