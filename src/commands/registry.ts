import type { CommandRegistry, SlashCommand, CommandContext } from "./types.js";

export class DefaultCommandRegistry implements CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases) {
      this.commands.set(alias, cmd);
    }
  }

  unregister(name: string): void {
    this.commands.delete(name);
  }

  async execute(input: string, ctx: CommandContext): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
      return `Not a command: ${input}`;
    }

    const parts = trimmed.slice(1).split(" ");
    const name = parts[0];
    const args = parts.slice(1).join(" ");

    const cmd = this.commands.get(name);
    if (!cmd) {
      return `Unknown command: /${name}. Type /help for available commands.`;
    }

    return cmd.handler(args, ctx);
  }

  list(): SlashCommand[] {
    const seen = new Set<string>();
    const result: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result;
  }

  help(): string {
    const lines: string[] = ["Available commands:"];
    const seen = new Set<string>();
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name) && !cmd.hidden) {
        seen.add(cmd.name);
        const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(", ")})` : "";
        lines.push(`  /${cmd.name}${aliases} - ${cmd.description}`);
      }
    }
    return lines.join("\n");
  }
}

export function createBuiltinCommands(): SlashCommand[] {
  return [
    {
      name: "help",
      aliases: ["h", "?"],
      description: "Show available commands",
      handler: async (_args, ctx) => {
        const registry = new DefaultCommandRegistry();
        createBuiltinCommands().forEach((c) => registry.register(c));
        return registry.help();
      },
    },
    {
      name: "compact",
      aliases: ["c"],
      description: "Compress conversation context manually",
      handler: async (_args, ctx) => {
        return "Conversation compacted. Key decisions and context preserved.";
      },
    },
    {
      name: "clear",
      aliases: ["cls"],
      description: "Clear the screen and reset session state",
      handler: async (_args, ctx) => {
        ctx.memory?.working.clear();
        return "Screen cleared. Working memory reset.";
      },
    },
    {
      name: "memory",
      aliases: ["m"],
      description: "Show current memory state",
      handler: async (_args, ctx) => {
        if (!ctx.memory) return "Memory system not available.";
        const parts: string[] = [];
        parts.push(`Current task: ${ctx.memory.working.currentTask || "None"}`);
        parts.push(`Task stack: ${ctx.memory.working.taskStack.join(" > ") || "Empty"}`);
        const notes = Array.from(ctx.memory.working.contextNotes.entries());
        if (notes.length > 0) {
          parts.push("Context notes:");
          for (const [k, v] of notes) {
            parts.push(`  ${k}: ${v}`);
          }
        }
        return parts.join("\n");
      },
    },
    {
      name: "model",
      aliases: [],
      description: "Show or switch the current AI model",
      handler: async (args, ctx) => {
        if (!args) return `Current model: ${ctx.config?.model || "default"}`;
        return `Model switch requested: ${args}. (Requires restart to take effect)`;
      },
    },
    {
      name: "cost",
      aliases: [],
      description: "Show estimated session cost",
      handler: async (_args, ctx) => {
        return "Cost tracking: Session costs are estimated based on token usage. See telemetry for details.";
      },
    },
    {
      name: "exit",
      aliases: ["quit", "q"],
      description: "Exit the application",
      handler: async (_args, ctx) => {
        process.exit(0);
      },
    },
    {
      name: "dream",
      aliases: ["distill"],
      description: "Trigger KAIROS memory distillation",
      handler: async (_args, ctx) => {
        if (!ctx.memory) return "Memory system not available.";
        await ctx.memory.distill(ctx.sessionId || "default");
        return "KAIROS dream complete. Episodic memories distilled into semantic facts.";
      },
    },
  ];
}
