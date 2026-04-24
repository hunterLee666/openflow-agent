export interface SlashCommand {
  name: string;
  aliases: string[];
  description: string;
  handler: (args: string, ctx: CommandContext) => Promise<string>;
  hidden?: boolean;
}

export interface CommandContext {
  cwd: string;
  sessionId?: string;
  memory?: import("../memory/types.js").MemorySystem;
  config?: import("../types/index.js").AgentConfig;
}

export interface CommandRegistry {
  register(cmd: SlashCommand): void;
  unregister(name: string): void;
  execute(input: string, ctx: CommandContext): Promise<string>;
  list(): SlashCommand[];
  help(): string;
}
