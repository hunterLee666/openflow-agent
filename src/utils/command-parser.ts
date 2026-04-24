export interface ParsedCommand {
  raw: string;
  cmd: string;
  args: string[];
  flags: Record<string, string | boolean>;
  subcommand?: string;
  pipeFrom?: string;
  redirect?: { type: ">" | ">>" | "2>" | "2>&1"; target: string };
  originalCommand?: string;
}

export interface CommandAST {
  type: "simple" | "pipeline" | "compound" | "subshell";
  nodes: ASTNode[];
  originalCommand: string;
}

export interface ASTNode {
  type: string;
  value: string;
  children?: ASTNode[];
  position: { start: number; end: number };
}

export class CommandParser {
  private static INSTANCE: CommandParser;

  static getInstance(): CommandParser {
    if (!CommandParser.INSTANCE) {
      CommandParser.INSTANCE = new CommandParser();
    }
    return CommandParser.INSTANCE;
  }

  parse(command: string): ParsedCommand {
    const trimmed = command.trim();
    if (!trimmed) {
      return { raw: "", cmd: "", args: [], flags: {} };
    }

    const result: ParsedCommand = {
      raw: trimmed,
      cmd: "",
      args: [],
      flags: {},
    };

    const tokens = this.tokenize(trimmed);
    if (tokens.length === 0) {
      return result;
    }

    result.cmd = tokens[0];
    result.args = tokens.slice(1);

    result.flags = this.extractFlags(result.args);

    if (result.cmd === "git") {
      result.subcommand = result.args[0] || undefined;
    }

    const pipeMatch = trimmed.match(/\|$/);
    if (pipeMatch) {
      result.pipeFrom = "pipe";
    }

    const redirectMatch = trimmed.match(/(?:>|\d>&|\d)>(\s*\S+)?/);
    if (redirectMatch) {
      const redirectType = redirectMatch[0].startsWith("2") ? "2>&1" : redirectMatch[0].startsWith(">>") ? ">>" : ">";
      result.redirect = { type: redirectType as ">" | ">>" | "2>" | "2>&1", target: (redirectMatch[1] || "").trim() };
    }

    return result;
  }

  parseAST(command: string): CommandAST {
    const trimmed = command.trim();

    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map(p => p.trim());
      return {
        type: "pipeline",
        nodes: parts.map(p => ({
          type: "command",
          value: p,
          children: this.parseASTNodes(p),
          position: { start: 0, end: p.length },
        })),
        originalCommand: trimmed,
      };
    }

    if (/^\(.*\)$/.test(trimmed)) {
      return {
        type: "subshell",
        nodes: [{
          type: "subshell_content",
          value: trimmed.slice(1, -1),
          children: this.parseASTNodes(trimmed.slice(1, -1)),
          position: { start: 1, end: trimmed.length - 1 },
        }],
        originalCommand: trimmed,
      };
    }

    if (/^(if|then|else|elif|fi|for|while|do|done|case|esac|function)\b/.test(trimmed)) {
      return {
        type: "compound",
        nodes: [{
          type: "compound_command",
          value: trimmed,
          children: this.parseASTNodes(trimmed),
          position: { start: 0, end: trimmed.length },
        }],
        originalCommand: trimmed,
      };
    }

    return {
      type: "simple",
      nodes: [{
        type: "command",
        value: trimmed,
        children: this.parseASTNodes(trimmed),
        position: { start: 0, end: trimmed.length },
      }],
      originalCommand: trimmed,
    };
  }

  private parseASTNodes(command: string): ASTNode[] {
    const tokens = this.tokenize(command);
    const nodes: ASTNode[] = [];

    let position = 0;
    for (const token of tokens) {
      const start = command.indexOf(token, position);
      const end = start + token.length;

      if (token.startsWith("-")) {
        if (nodes.length > 0 && nodes[nodes.length - 1].type === "flag") {
          const flagNode = nodes[nodes.length - 1];
          if (typeof flagNode.value === "string" && !flagNode.value.includes("=")) {
            flagNode.value = `${flagNode.value}=${token.slice(1)}`;
            position = end;
            continue;
          }
        }
        nodes.push({
          type: "flag",
          value: token,
          position: { start, end },
        });
      } else if (/^['"]/.test(token)) {
        nodes.push({
          type: "quoted_argument",
          value: token.slice(1, -1),
          position: { start, end },
        });
      } else {
        nodes.push({
          type: "argument",
          value: token,
          position: { start, end },
        });
      }

      position = end;
    }

    return nodes;
  }

  private tokenize(command: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escapeNext = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (char === " " && !inSingleQuote && !inDoubleQuote) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  private extractFlags(args: string[]): Record<string, string | boolean> {
    const flags: Record<string, string | boolean> = {};
    const flagPatterns = [
      /^--(.+)/,
      /^-([a-zA-Z])$/,
      /^-([a-zA-Z]+)$/,
    ];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith("--")) {
        const parts = arg.split("=");
        if (parts.length === 2) {
          flags[parts[0]] = parts[1];
        } else {
          flags[arg] = true;
        }
        continue;
      }

      if (arg.startsWith("-") && arg.length > 1) {
        const shortFlags = arg.slice(1);
        for (const flag of shortFlags) {
          if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
            flags[`-${flag}`] = args[i + 1];
            i++;
          } else {
            flags[`-${flag}`] = true;
          }
        }
      }
    }

    return flags;
  }

  extractPaths(command: string): string[] {
    const paths: string[] = [];
    const pathPattern = /['"]?(\/(?:[^\s'"]+\/)*[^\s'"]*)/g;

    let match;
    while ((match = pathPattern.exec(command)) !== null) {
      paths.push(match[1]);
    }

    return paths;
  }

  extractFirstCommand(command: string): string {
    const parsed = this.parse(command);
    return parsed.cmd;
  }

  isReadOnlyCommand(command: string): boolean {
    const readonlyCommands = [
      "cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep",
      "find", "locate", "which", "whereis", "type", "file", "stat",
      "ls", "dir", "pwd", "echo", "printf", "date", "cal", "whoami",
      "id", "uname", "arch", "version", "help",
    ];

    const firstCmd = this.extractFirstCommand(command);
    return readonlyCommands.includes(firstCmd);
  }

  isNetworkCommand(command: string): boolean {
    const networkCommands = [
      "curl", "wget", "ssh", "scp", "sftp", "rsync",
      "ftp", "telnet", "nc", "netcat", "nmap",
      "ping", "traceroute", "tracepath", "nslookup", "dig",
      "curl", "wget", "lynx", "w3m",
      "npm", "yarn", "pip", "gem", "cargo",
    ];

    const firstCmd = this.extractFirstCommand(command);
    return networkCommands.includes(firstCmd);
  }

  isGitCommand(command: string): boolean {
    const gitCommands = [
      "git", "gh", "glab",
      "clone", "init", "add", "rm", "mv", "commit",
      "push", "pull", "fetch", "merge", "rebase",
      "branch", "checkout", "switch", "restore",
      "status", "log", "diff", "show", "stash",
      "tag", "release", "cherry-pick",
    ];

    const firstCmd = this.extractFirstCommand(command);
    return gitCommands.includes(firstCmd);
  }

  isDestructiveCommand(command: string): boolean {
    const destructiveCommands = [
      "rm", "rmdir", "dd", "mkfs", "fdisk", "parted",
      "shutdown", "reboot", "halt", "poweroff",
      "kill", "killall", "pkill",
      "mv" // when moving to /dev/null or similar
    ];

    const firstCmd = this.extractFirstCommand(command);
    if (destructiveCommands.includes(firstCmd)) {
      return true;
    }

    if (/rm\s+-rf/i.test(command)) {
      return true;
    }

    return false;
  }
}

export function parseCommandLine(command: string): ParsedCommand {
  return CommandParser.getInstance().parse(command);
}

export function extractCommandPaths(command: string): string[] {
  return CommandParser.getInstance().extractPaths(command);
}

export function getCommandCategory(command: string): "read" | "write" | "network" | "git" | "system" | "unknown" {
  const parser = CommandParser.getInstance();

  if (parser.isReadOnlyCommand(command)) return "read";
  if (parser.isNetworkCommand(command)) return "network";
  if (parser.isGitCommand(command)) return "git";
  if (parser.isDestructiveCommand(command)) return "write";
  if (/^(sudo|chmod|chown|passwd|cat|tee)/.test(command)) return "system";

  return "unknown";
}