import { z } from "zod";

export type SimpleCommand = {
  kind: "simple";
  argv: string[];
  assignments: Record<string, string>;
};

export type PipelineCommand = {
  kind: "pipeline";
  commands: BashNode[];
};

export type ListCommand = {
  kind: "list";
  op: "&&" | "||" | ";";
  left: BashNode;
  right: BashNode;
};

export type CommandSubstitution = {
  kind: "command_substitution";
  command: BashNode;
  style: "$()" | "backtick";
};

export type BashNode =
  | SimpleCommand
  | PipelineCommand
  | ListCommand
  | CommandSubstitution;

export const BashAnalysisResultSchema = z.object({
  isDangerous: z.boolean(),
  dangerousReason: z.string().optional(),
  requiresConfirmation: z.boolean(),
  confirmationPrompt: z.string().optional(),
  simpleCommands: z.array(z.string()),
  hasCommandSubstitution: z.boolean(),
  hasPipe: z.boolean(),
  hasNetworkAccess: z.boolean(),
});

export type BashAnalysisResult = z.infer<typeof BashAnalysisResultSchema>;

const DANGEROUS_COMMANDS = new Set([
  "rm", "dd", "mkfs", "fork", "exec", "eval",
]);

const NETWORK_COMMANDS = new Set([
  "curl", "wget", "nc", "nmap", "netcat", "ssh", "ftp", "telnet",
]);

const DANGEROUS_PIPE_PATTERNS = [
  /curl.*\|.*bash/i,
  /wget.*\|.*bash/i,
  /curl.*\|.*sh/i,
  /wget.*\|.*sh/i,
  /curl.*\|.*python/i,
  /wget.*\|.*python/i,
  /\|.*bash$/i,
  /\|.*sh$/i,
];

export function parseBash(command: string): BashNode {
  return parseList(command.trim());
}

function parseList(cmd: string): BashNode {
  if (cmd.includes("&&")) {
    const parts = cmd.split("&&");
    return {
      kind: "list",
      op: "&&",
      left: parseList(parts[0].trim()),
      right: parseList(parts.slice(1).join("&&").trim()),
    };
  }
  if (cmd.includes("||")) {
    const parts = cmd.split("||");
    return {
      kind: "list",
      op: "||",
      left: parseList(parts[0].trim()),
      right: parseList(parts.slice(1).join("||").trim()),
    };
  }
  if (cmd.includes("|")) {
    const parts = cmd.split("|");
    return {
      kind: "pipeline",
      commands: parts.map((p) => parseSimpleOrSubstitution(p.trim())),
    };
  }
  return parseSimpleOrSubstitution(cmd);
}

function parseSimpleOrSubstitution(cmd: string): BashNode {
  if (cmd.startsWith("$(") && cmd.endsWith(")")) {
    const inner = cmd.slice(2, -1).trim();
    return {
      kind: "command_substitution",
      command: parseList(inner),
      style: "$()",
    };
  }
  if (cmd.startsWith("`") && cmd.endsWith("`")) {
    const inner = cmd.slice(1, -1).trim();
    return {
      kind: "command_substitution",
      command: parseList(inner),
      style: "backtick",
    };
  }
  return parseSimpleCommand(cmd);
}

function parseSimpleCommand(cmd: string): SimpleCommand {
  const tokens = tokenize(cmd);
  const argv: string[] = [];
  const assignments: Record<string, string> = {};

  for (const token of tokens) {
    if (token.includes("=") && !token.includes(" ")) {
      const [key, ...valueParts] = token.split("=");
      assignments[key] = valueParts.join("=");
    } else {
      argv.push(token);
    }
  }

  return {
    kind: "simple",
    argv,
    assignments,
  };
}

function tokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      current += char;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
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

export function analyzeBash(command: string): BashAnalysisResult {
  const ast = parseBash(command);
  const simpleCommands: string[] = [];
  let hasCommandSubstitution = false;
  let hasPipe = false;
  let hasNetworkAccess = false;

  function walk(node: BashNode): void {
    switch (node.kind) {
      case "simple":
        simpleCommands.push(node.argv[0] || "");
        if (NETWORK_COMMANDS.has(node.argv[0]?.toLowerCase() || "")) {
          hasNetworkAccess = true;
        }
        break;
      case "pipeline":
        hasPipe = true;
        for (const cmd of node.commands) {
          walk(cmd);
        }
        break;
      case "list":
        walk(node.left);
        walk(node.right);
        break;
      case "command_substitution":
        hasCommandSubstitution = true;
        walk(node.command);
        break;
    }
  }

  walk(ast);

  for (const pattern of DANGEROUS_PIPE_PATTERNS) {
    if (pattern.test(command)) {
      return {
        isDangerous: true,
        dangerousReason: "Dangerous pipe pattern detected: download and execute",
        requiresConfirmation: false,
        confirmationPrompt: undefined,
        simpleCommands,
        hasCommandSubstitution,
        hasPipe,
        hasNetworkAccess,
      };
    }
  }

  if (hasCommandSubstitution && hasNetworkAccess) {
    return {
      isDangerous: true,
      dangerousReason: "Network command with command substitution",
      requiresConfirmation: true,
      confirmationPrompt: "Command substitution with network access detected, continue?",
      simpleCommands,
      hasCommandSubstitution,
      hasPipe,
      hasNetworkAccess,
    };
  }

  if (hasNetworkAccess && hasPipe) {
    return {
      isDangerous: false,
      requiresConfirmation: true,
      confirmationPrompt: "Network command with pipe detected, continue?",
      simpleCommands,
      hasCommandSubstitution,
      hasPipe,
      hasNetworkAccess,
    };
  }

  return {
    isDangerous: false,
    requiresConfirmation: hasCommandSubstitution,
    confirmationPrompt: hasCommandSubstitution ? "Command substitution detected, continue?" : undefined,
    simpleCommands,
    hasCommandSubstitution,
    hasPipe,
    hasNetworkAccess,
  };
}

export function isDangerousBash(command: string): { dangerous: boolean; reason?: string } {
  const analysis = analyzeBash(command);
  return {
    dangerous: analysis.isDangerous,
    reason: analysis.dangerousReason,
  };
}
