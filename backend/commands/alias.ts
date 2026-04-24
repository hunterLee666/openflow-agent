export interface CommandAlias {
  name: string;
  expansion: string;
  description?: string;
  flags?: Record<string, string | boolean>;
  environment?: Record<string, string>;
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  exitCode?: number;
  duration?: number;
  workingDirectory: string;
  tags?: string[];
}

export interface CommandHistoryQuery {
  limit?: number;
  offset?: number;
  startTime?: number;
  endTime?: number;
  workingDirectory?: string;
  tags?: string[];
  searchText?: string;
}

export class CommandAliasManager {
  private aliases: Map<string, CommandAlias> = new Map();
  private history: CommandHistoryEntry[] = [];
  private maxHistorySize: number = 1000;

  constructor(initialAliases?: CommandAlias[]) {
    if (initialAliases) {
      for (const alias of initialAliases) {
        this.register(alias);
      }
    }
  }

  register(alias: CommandAlias): void {
    if (!alias.name || !alias.expansion) {
      throw new Error("Alias must have name and expansion");
    }
    this.aliases.set(alias.name, { ...alias });
  }

  unregister(name: string): boolean {
    return this.aliases.delete(name);
  }

  get(name: string): CommandAlias | undefined {
    return this.aliases.get(name);
  }

  has(name: string): boolean {
    return this.aliases.has(name);
  }

  expand(command: string): string {
    const parsed = this.parseAliasCommand(command);

    if (this.aliases.has(parsed.cmd)) {
      const alias = this.aliases.get(parsed.cmd)!;

      let expanded = alias.expansion;

      if (alias.flags) {
        for (const [key, value] of Object.entries(alias.flags)) {
          if (!parsed.flags[key]) {
            parsed.flags[key] = value;
          }
        }
      }

      for (const [key, value] of Object.entries(parsed.flags)) {
        expanded = expanded.replace(new RegExp(`\\$${key}\\b`, "g"), String(value));
        expanded = expanded.replace(/\$(\d+)/g, (_, num) => parsed.args[parseInt(num) - 1] || "");
      }

      if (parsed.args.length > 0) {
        expanded += " " + parsed.args.join(" ");
      }

      return expanded;
    }

    return command;
  }

  private parseAliasCommand(command: string): { cmd: string; args: string[]; flags: Record<string, string | boolean> } {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0] || "";
    const args = parts.slice(1);

    const flags: Record<string, string | boolean> = {};
    const remainingArgs: string[] = [];

    for (const arg of args) {
      if (arg.startsWith("-")) {
        const flagParts = arg.slice(1).split("=");
        if (flagParts.length === 2) {
          flags[flagParts[0]] = flagParts[1];
        } else {
          flags[arg] = true;
        }
      } else {
        remainingArgs.push(arg);
      }
    }

    return { cmd, args: remainingArgs, flags };
  }

  getAll(): CommandAlias[] {
    return Array.from(this.aliases.values());
  }

  getAliasesByPrefix(prefix: string): CommandAlias[] {
    return Array.from(this.aliases.values()).filter(a =>
      a.name.startsWith(prefix)
    );
  }

  addToHistory(entry: Omit<CommandHistoryEntry, "id">): void {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.history.unshift({ ...entry, id });

    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }

  queryHistory(query: CommandHistoryQuery): CommandHistoryEntry[] {
    let results = [...this.history];

    if (query.startTime) {
      results = results.filter(e => e.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      results = results.filter(e => e.timestamp <= query.endTime!);
    }

    if (query.workingDirectory) {
      results = results.filter(e => e.workingDirectory === query.workingDirectory);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(e =>
        e.tags && query.tags!.some(tag => e.tags!.includes(tag))
      );
    }

    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase();
      results = results.filter(e =>
        e.command.toLowerCase().includes(searchLower)
      );
    }

    const offset = query.offset || 0;
    const limit = query.limit || results.length;

    return results.slice(offset, offset + limit);
  }

  getRecentCommands(limit: number = 10): CommandHistoryEntry[] {
    return this.history.slice(0, limit);
  }

  searchHistory(query: string, limit: number = 20): CommandHistoryEntry[] {
    const queryLower = query.toLowerCase();
    return this.history
      .filter(e => e.command.toLowerCase().includes(queryLower))
      .slice(0, limit);
  }

  addTag(commandId: string, tag: string): boolean {
    const entry = this.history.find(e => e.id === commandId);
    if (!entry) {
      return false;
    }
    if (!entry.tags) {
      entry.tags = [];
    }
    if (!entry.tags.includes(tag)) {
      entry.tags.push(tag);
    }
    return true;
  }

  removeTag(commandId: string, tag: string): boolean {
    const entry = this.history.find(e => e.id === commandId);
    if (!entry || !entry.tags) {
      return false;
    }
    const index = entry.tags.indexOf(tag);
    if (index !== -1) {
      entry.tags.splice(index, 1);
      return true;
    }
    return false;
  }

  clearHistory(): void {
    this.history = [];
  }

  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    if (this.history.length > size) {
      this.history = this.history.slice(0, size);
    }
  }

  exportAliases(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  importAliases(json: string): void {
    try {
      const aliases = JSON.parse(json) as CommandAlias[];
      for (const alias of aliases) {
        this.register(alias);
      }
    } catch (error) {
      throw new Error(`Failed to import aliases: ${error}`);
    }
  }
}

export const defaultAliasManager = new CommandAliasManager([
  { name: "ll", expansion: "ls -la", description: "List all files with details" },
  { name: "la", expansion: "ls -a", description: "List all files" },
  { name: "l", expansion: "ls -CF", description: "List files with indicators" },
  { name: "..", expansion: "cd ..", description: "Go up one directory" },
  { name: "...", expansion: "cd ../..", description: "Go up two directories" },
  { name: "grep", expansion: "grep --color=auto", description: "Grep with color" },
]);
