export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  help?: string;
  template: string;
  flags?: CommandFlag[];
  examples?: string[];
  permission?: "safe" | "confirm" | "deny";
  aliases?: string[];
}

export interface CommandFlag {
  name: string;
  short?: string;
  description: string;
  type: "boolean" | "string" | "number";
  default?: unknown;
}

export interface ParsedCommand {
  command: SlashCommand;
  args: string[];
  flags: Record<string, unknown>;
}

export interface SlashCommandRegistry {
  register(command: SlashCommand): void;
  unregister(name: string): void;
  resolve(input: string): ParsedCommand | null;
  list(): SlashCommand[];
  getHelp(name: string): string | null;
}

export function parseCommandLine(input: string): { cmd: string; args: string[]; flags: Record<string, unknown> } {
  const tokens = tokenize(input);
  if (tokens.length === 0 || !tokens[0].startsWith("/")) {
    return { cmd: "", args: [], flags: {} };
  }

  const cmd = tokens[0].slice(1);
  const args: string[] = [];
  const flags: Record<string, unknown> = {};

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      const flagName = token.slice(2);
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
        flags[flagName] = tokens[i + 1];
        i += 2;
      } else {
        flags[flagName] = true;
        i++;
      }
    } else if (token.startsWith("-")) {
      const flagName = token.slice(1);
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
        flags[flagName] = tokens[i + 1];
        i += 2;
      } else {
        flags[flagName] = true;
        i++;
      }
    } else {
      args.push(token);
      i++;
    }
  }

  return { cmd, args, flags };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === " " || char === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export class DefaultSlashCommandRegistry implements SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
  }

  unregister(name: string): void {
    this.commands.delete(name);
  }

  resolve(input: string): ParsedCommand | null {
    const { cmd, args, flags } = parseCommandLine(input);
    if (!cmd) return null;

    const command = this.commands.get(cmd);
    if (!command) {
      for (const [name, c] of this.commands.entries()) {
        if (name.startsWith(cmd) || c.aliases?.includes(cmd)) {
          return { command: c, args, flags };
        }
      }
      return null;
    }

    return { command, args, flags };
  }

  list(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  getHelp(name: string): string | null {
    const command = this.commands.get(name);
    if (!command) return null;

    const lines = [`# /${command.name}`, "", command.description];

    if (command.help) {
      lines.push("", command.help);
    }

    if (command.flags && command.flags.length > 0) {
      lines.push("", "## Flags:");
      for (const flag of command.flags) {
        const opt = flag.short ? `-${flag.short}, --${flag.name}` : `--${flag.name}`;
        lines.push(`  ${opt}: ${flag.description} (${flag.type})`);
      }
    }

    if (command.examples && command.examples.length > 0) {
      lines.push("", "## Examples:");
      for (const ex of command.examples) {
        lines.push(`  ${ex}`);
      }
    }

    return lines.join("\n");
  }
}

export function expandCommandTemplate(template: string, args: string[], flags: Record<string, unknown>): string {
  let result = template;

  result = result.replace(/\{\{\s*args\.\d+\s*\}\}/g, (match) => {
    const idx = parseInt(match.match(/\d+/)?.[0] || "0", 10);
    return args[idx] || "";
  });

  result = result.replace(/\{\{\s*flags\.(\w+)\s*\}\}/g, (match, flagName: string) => {
    return String(flags[flagName] ?? "");
  });

  result = result.replace(/\{\{\s*args\s*\}\}/g, args.join(" "));

  return result;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    id: "cmd_review",
    name: "review",
    description: "Run code review on changes",
    template: "Please review the recent code changes in this repository. Focus on:\n- Code quality and style\n- Potential bugs or security issues\n- Performance concerns\n- Test coverage",
    permission: "safe",
  },
  {
    id: "cmd_compact",
    name: "compact",
    description: "Manually trigger context compaction",
    template: "Please compact the conversation context by summarizing key decisions and preserving essential state.",
    permission: "safe",
  },
  {
    id: "cmd_dream",
    name: "dream",
    description: "Trigger KAIROS dreaming mode for memory distillation",
    template: "Please distill recent episodic memories into semantic facts using KAIROS dreaming mode.",
    permission: "safe",
  },
  {
    id: "cmd_help",
    name: "help",
    description: "Show available commands and help",
    template: "Please list all available commands and provide brief descriptions.",
    permission: "safe",
  },
];
