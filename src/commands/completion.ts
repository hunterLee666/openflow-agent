export interface CompletionCandidate {
  value: string;
  label: string;
  type: "command" | "option" | "argument" | "file" | "directory" | "custom";
  description?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface CompletionContext {
  input: string;
  cursorPosition: number;
  currentWord: string;
  currentWordStart: number;
  previousWord?: string;
  previousWordEnd?: number;
  fullCommand: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export interface CompletionConfig {
  maxCandidates: number;
  fuzzyMatch: boolean;
  caseSensitive: boolean;
  includeFiles: boolean;
  includeDirectories: boolean;
  sortByFrequency: boolean;
  historyWeight: number;
}

export const DEFAULT_COMPLETION_CONFIG: CompletionConfig = {
  maxCandidates: 20,
  fuzzyMatch: true,
  caseSensitive: false,
  includeFiles: true,
  includeDirectories: true,
  sortByFrequency: true,
  historyWeight: 0.3,
};

export interface CommandSpec {
  name: string;
  description?: string;
  options?: OptionSpec[];
  arguments?: ArgumentSpec[];
  subcommands?: CommandSpec[];
  aliases?: string[];
  examples?: string[];
}

export interface OptionSpec {
  name: string;
  short?: string;
  description?: string;
  type: "boolean" | "string" | "number";
  defaultValue?: unknown;
  required?: boolean;
}

export interface ArgumentSpec {
  name: string;
  description?: string;
  type: "string" | "number" | "path";
  required?: boolean;
  options?: string[];
}

export class CommandCompleter {
  private commands: Map<string, CommandSpec> = new Map();
  private aliases: Map<string, string> = new Map();
  private history: Map<string, number> = new Map();
  private customCompletions: Map<string, CompletionProvider> = new Map();
  private config: CompletionConfig;

  constructor(config: Partial<CompletionConfig> = {}) {
    this.config = { ...DEFAULT_COMPLETION_CONFIG, ...config };
  }

  registerCommand(spec: CommandSpec): void {
    this.commands.set(spec.name, spec);

    if (spec.aliases) {
      for (const alias of spec.aliases) {
        this.aliases.set(alias, spec.name);
      }
    }

    if (spec.subcommands) {
      for (const sub of spec.subcommands) {
        this.registerCommand({
          ...sub,
          name: `${spec.name} ${sub.name}`,
        });
      }
    }
  }

  unregisterCommand(name: string): void {
    this.commands.delete(name);
  }

  registerAlias(alias: string, command: string): void {
    this.aliases.set(alias, command);
  }

  registerCompletionProvider(
    name: string,
    provider: CompletionProvider
  ): void {
    this.customCompletions.set(name, provider);
  }

  recordUsage(candidate: string): void {
    const count = this.history.get(candidate) || 0;
    this.history.set(candidate, count + 1);
  }

  complete(context: CompletionContext): CompletionCandidate[] {
    const candidates: CompletionCandidate[] = [];

    if (context.args.length === 0 || (context.args.length === 1 && !context.currentWord.startsWith("-"))) {
      candidates.push(...this.completeCommand(context));
    } else if (context.currentWord.startsWith("-")) {
      candidates.push(...this.completeOption(context));
    } else {
      candidates.push(...this.completeArgument(context));
    }

    if (this.config.includeFiles || this.config.includeDirectories) {
      candidates.push(...this.completeFiles(context));
    }

    for (const [, provider] of this.customCompletions) {
      try {
        const custom = provider(context);
        candidates.push(...custom);
      } catch (e) {
        console.error("Completion provider error:", e);
      }
    }

    return this.filterAndSort(candidates, context);
  }

  private completeCommand(context: CompletionContext): CompletionCandidate[] {
    const candidates: CompletionCandidate[] = [];
    const input = context.currentWord.toLowerCase();

    for (const [name, spec] of this.commands) {
      const matches = this.matches(name, input);
      if (matches) {
        candidates.push({
          value: name,
          label: name,
          type: "command",
          description: spec.description,
          score: matches,
        });
      }
    }

    for (const [alias, command] of this.aliases) {
      const matches = this.matches(alias, input);
      if (matches) {
        const spec = this.commands.get(command);
        candidates.push({
          value: alias,
          label: `${alias} → ${command}`,
          type: "command",
          description: spec?.description,
          score: matches,
        });
      }
    }

    return candidates;
  }

  private completeOption(context: CompletionContext): CompletionCandidate[] {
    const candidates: CompletionCandidate[] = [];
    const input = context.currentWord.toLowerCase().replace(/^-+/, "");

    const optionsInUse = new Set<string>(Object.keys(context.flags));

    for (const [, spec] of this.commands) {
      if (spec.options) {
        for (const opt of spec.options) {
          if (optionsInUse.has(opt.name)) continue;

          const matchesName = this.matches(opt.name, input);
          const matchesShort = opt.short ? this.matches(opt.short, input) : 0;

          if (matchesName > 0 || matchesShort > 0) {
            const value = context.currentWord.startsWith("--")
              ? `--${opt.name}`
              : context.currentWord.startsWith("-")
                ? `-${opt.short || opt.name}`
                : `--${opt.name}`;

            candidates.push({
              value,
              label: opt.name,
              type: "option",
              description: opt.description,
              score: Math.max(matchesName, matchesShort),
            });
          }
        }
      }
    }

    return candidates;
  }

  private completeArgument(context: CompletionContext): CompletionCandidate[] {
    const candidates: CompletionCandidate[] = [];

    const lastArg = context.args[context.args.length - 1];
    if (!lastArg) return candidates;

    const parts = context.fullCommand.split(" ");
    const commandName = this.aliases.get(parts[1]) || parts[1];
    const spec = this.commands.get(commandName);

    if (spec?.arguments) {
      for (const arg of spec.arguments) {
        if (arg.options) {
          for (const option of arg.options) {
            if (this.matches(option, lastArg)) {
              candidates.push({
                value: option,
                label: option,
                type: "argument",
                description: arg.description,
              });
            }
          }
        }
      }
    }

    return candidates;
  }

  private completeFiles(context: CompletionContext): CompletionCandidate[] {
    const candidates: CompletionCandidate[] = [];
    const word = context.currentWord;

    if (!word.startsWith("./") && !word.startsWith("/") && !word.startsWith("~")) {
      return candidates;
    }

    const { StatWatcher } = require("fs");
    const { readdir, stat } = require("fs/promises");
    const { dirname, basename, join } = require("path");

    const dir = dirname(word);
    const prefix = basename(word);

    try {
      const entries = require("fs").readdirSync(dir === "." ? process.cwd() : dir);

      for (const entry of entries) {
        if (!entry.startsWith(prefix)) continue;

        const fullPath = join(dir === "." ? process.cwd() : dir, entry);

        try {
          const stats = require("fs").statSync(fullPath);
          const isDir = stats.isDirectory();

          if (isDir && this.config.includeDirectories) {
            candidates.push({
              value: `${dir === "." ? "" : dir}/`,
              label: `${entry}/`,
              type: "directory",
            });
          } else if (!isDir && this.config.includeFiles) {
            candidates.push({
              value: `${dir === "." ? "" : dir}/`,
              label: entry,
              type: "file",
            });
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Directory not accessible
    }

    return candidates;
  }

  private matches(text: string, pattern: string): number {
    if (!pattern) return 1;

    const textLower = this.config.caseSensitive ? text : text.toLowerCase();
    const patternLower = this.config.caseSensitive ? pattern : pattern.toLowerCase();

    if (textLower === patternLower) {
      return 100;
    }

    if (textLower.startsWith(patternLower)) {
      return 80;
    }

    if (textLower.includes(patternLower)) {
      return 50;
    }

    if (this.config.fuzzyMatch) {
      let patternIdx = 0;
      let consecutive = 0;
      let lastMatchIdx = -1;

      for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
        if (textLower[i] === patternLower[patternIdx]) {
          if (lastMatchIdx === i - 1) {
            consecutive++;
          } else {
            consecutive = 1;
          }
          lastMatchIdx = i;
          patternIdx++;
        }
      }

      if (patternIdx === patternLower.length) {
        return 30 + consecutive * 5;
      }
    }

    return 0;
  }

  private filterAndSort(
    candidates: CompletionCandidate[],
    context: CompletionContext
  ): CompletionCandidate[] {
    const filtered = candidates.filter((c) => c.score && c.score > 0);

    if (this.config.sortByFrequency) {
      filtered.sort((a, b) => {
        const freqA = this.history.get(a.value) || 0;
        const freqB = this.history.get(b.value) || 0;

        const freqScoreA = freqA * this.config.historyWeight;
        const freqScoreB = freqB * this.config.historyWeight;

        const totalA = (a.score || 0) + freqScoreA;
        const totalB = (b.score || 0) + freqScoreB;

        return totalB - totalA;
      });
    } else {
      filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    return filtered.slice(0, this.config.maxCandidates);
  }

  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  getAliases(): Map<string, string> {
    return new Map(this.aliases);
  }

  getStats(): { totalCommands: number; totalAliases: number; historyEntries: number } {
    return {
      totalCommands: this.commands.size,
      totalAliases: this.aliases.size,
      historyEntries: this.history.size,
    };
  }
}

export type CompletionProvider = (context: CompletionContext) => CompletionCandidate[];

export function createFilePathProvider(
  basePath: string = process.cwd()
): CompletionProvider {
  return (context: CompletionContext): CompletionCandidate[] => {
    const candidates: CompletionCandidate[] = [];
    const word = context.currentWord;

    if (!word.startsWith("./") && !word.startsWith("/") && !word.startsWith("~")) {
      return candidates;
    }

    return candidates;
  };
}

export function createHistoryProvider(
  history: string[]
): CompletionProvider {
  return (context: CompletionContext): CompletionCandidate[] => {
    const word = context.currentWord.toLowerCase();
    const candidates: CompletionCandidate[] = [];

    for (const cmd of history) {
      if (cmd.toLowerCase().startsWith(word)) {
        candidates.push({
          value: cmd,
          label: cmd,
          type: "command",
          description: "From history",
        });
      }
    }

    return candidates.slice(0, 10);
  };
}

export function createOptionValueProvider(
  optionName: string,
  values: string[]
): CompletionProvider {
  return (context: CompletionContext): CompletionCandidate[] => {
    const candidates: CompletionCandidate[] = [];
    const word = context.currentWord;

    if (!context.currentWord.startsWith("-")) {
      return candidates;
    }

    for (const value of values) {
      if (value.toLowerCase().startsWith(word.toLowerCase())) {
        candidates.push({
          value,
          label: value,
          type: "argument",
        });
      }
    }

    return candidates;
  };
}

export const defaultCompleter = new CommandCompleter();
