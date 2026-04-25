export type CommandHandler = (args: string) => Promise<string>;

export interface CommandDefinition {
  name: string;
  description: string;
  handler: CommandHandler;
  aliases?: string[];
}

export class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();

  register(command: CommandDefinition): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, {
          ...command,
          name: alias,
        });
      }
    }
  }

  unregister(name: string): void {
    this.commands.delete(name);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  getNames(): string[] {
    return Array.from(this.commands.keys());
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  async execute(name: string, args: string): Promise<string> {
    const command = this.commands.get(name);
    if (!command) {
      return `Unknown command: ${name}\nAvailable commands: ${this.getNames().join(", ")}`;
    }

    try {
      return await command.handler(args);
    } catch (error) {
      return `Error executing /${name}: ${(error as Error).message}`;
    }
  }
}

export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry();
}
