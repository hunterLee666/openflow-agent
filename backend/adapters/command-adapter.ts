import type { CapabilityPlugin, CapabilityContext } from "../types/index.js";
import { CapabilityType } from "../types/index.js";

export interface LegacySlashCommand {
  name: string;
  aliases: string[];
  description: string;
  hidden?: boolean;
  handler: (args: string, ctx: unknown) => Promise<string>;
  template?: string;
}

export interface LegacyCommandContext {
  cwd?: string;
  memory?: unknown;
  config?: unknown;
  sessionId?: string;
}

export function adaptCommandToPlugin(command: LegacySlashCommand): CapabilityPlugin {
  const allTriggers = [command.name, ...command.aliases];

  return {
    manifest: {
      name: command.name,
      version: "1.0.0",
      type: CapabilityType.COMMAND,
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
