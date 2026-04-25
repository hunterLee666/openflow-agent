export enum BashNodeKind {
  Simple = "simple",
  Pipeline = "pipeline",
  List = "list",
  Group = "group",
  Redirect = "redirect",
  CommandSubstitution = "command_substitution",
  VariableAssignment = "variable_assignment",
  HereDoc = "heredoc",
  If = "if",
  For = "for",
  While = "while",
  Function = "function",
  Case = "case",
}

export interface SimpleCommandNode {
  kind: BashNodeKind.Simple;
  argv: string[];
  assignments: Record<string, string>;
}

export interface PipelineNode {
  kind: BashNodeKind.Pipeline;
  cmds: BashNode[];
  negated: boolean;
}

export interface ListNode {
  kind: BashNodeKind.List;
  op: "&&" | "||" | ";";
  left: BashNode;
  right: BashNode;
}

export interface GroupNode {
  kind: BashNodeKind.Group;
  subshell: boolean;
  body: BashNode;
}

export interface RedirectNode {
  kind: BashNodeKind.Redirect;
  target: BashNode;
  op: ">" | ">>" | "<" | ">&" | "<&";
  file: string;
}

export interface CommandSubstitutionNode {
  kind: BashNodeKind.CommandSubstitution;
  inner: BashNode;
}

export interface VariableAssignmentNode {
  kind: BashNodeKind.VariableAssignment;
  name: string;
  value: string;
}

export interface HereDocNode {
  kind: BashNodeKind.HereDoc;
  delimiter: string;
  content: string;
}

export interface IfNode {
  kind: BashNodeKind.If;
  condition: BashNode;
  thenBody: BashNode;
  elseBody?: BashNode;
}

export interface ForNode {
  kind: BashNodeKind.For;
  variable: string;
  values: string[];
  body: BashNode;
}

export interface WhileNode {
  kind: BashNodeKind.While;
  condition: BashNode;
  body: BashNode;
}

export interface FunctionNode {
  kind: BashNodeKind.Function;
  name: string;
  body: BashNode;
}

export interface CaseNode {
  kind: BashNodeKind.Case;
  expression: string;
  cases: Array<{ pattern: string; body: BashNode }>;
}

export type BashNode =
  | SimpleCommandNode
  | PipelineNode
  | ListNode
  | GroupNode
  | RedirectNode
  | CommandSubstitutionNode
  | VariableAssignmentNode
  | HereDocNode
  | IfNode
  | ForNode
  | WhileNode
  | FunctionNode
  | CaseNode;

export interface BashAnalysisResult {
  simpleCommands: SimpleCommandNode[];
  hasPipeline: boolean;
  hasCommandSubstitution: boolean;
  hasRedirects: RedirectNode[];
  hasEval: boolean;
  hasDownloadPipeToShell: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskReasons: string[];
}

function tokenizeCommand(cmd: string): string[] {
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

function stripQuotes(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function findOperatorIndex(tokens: string[], ops: string[]): number {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "(" || token === "${" || token === "$(") {
      depth++;
      continue;
    }

    if (token === ")" || token === "}") {
      depth--;
      continue;
    }

    if (depth === 0 && ops.includes(token)) {
      return i;
    }
  }
  return -1;
}

function parseSimpleCommand(tokens: string[]): SimpleCommandNode {
  const argv: string[] = [];
  const assignments: Record<string, string> = {};

  for (const token of tokens) {
    const assignMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assignMatch && argv.length === 0) {
      assignments[assignMatch[1]] = stripQuotes(assignMatch[2]);
    } else {
      argv.push(stripQuotes(token));
    }
  }

  return {
    kind: BashNodeKind.Simple,
    argv,
    assignments,
  };
}

function parsePipeline(tokens: string[]): BashNode {
  const pipeIndex = findOperatorIndex(tokens, ["|"]);

  if (pipeIndex === -1) {
    return parseList(tokens);
  }

  const leftTokens = tokens.slice(0, pipeIndex);
  const rightTokens = tokens.slice(pipeIndex + 1);

  return {
    kind: BashNodeKind.Pipeline,
    cmds: [parsePipeline(leftTokens), parsePipeline(rightTokens)],
    negated: false,
  };
}

function parseList(tokens: string[]): BashNode {
  const andIndex = findOperatorIndex(tokens, ["&&"]);
  const orIndex = findOperatorIndex(tokens, ["||"]);
  const semiIndex = findOperatorIndex(tokens, [";"]);

  let opIndex = -1;
  let op: "&&" | "||" | ";" = ";";

  if (andIndex !== -1) {
    opIndex = andIndex;
    op = "&&";
  } else if (orIndex !== -1) {
    opIndex = orIndex;
    op = "||";
  } else if (semiIndex !== -1) {
    opIndex = semiIndex;
    op = ";";
  }

  if (opIndex === -1) {
    return parseGroup(tokens);
  }

  const leftTokens = tokens.slice(0, opIndex);
  const rightTokens = tokens.slice(opIndex + 1);

  return {
    kind: BashNodeKind.List,
    op,
    left: parseList(leftTokens),
    right: parseList(rightTokens),
  };
}

function parseGroup(tokens: string[]): BashNode {
  if (tokens.length === 0) {
    return parseSimpleCommand([]);
  }

  if (tokens[0] === "(" && tokens[tokens.length - 1] === ")") {
    return {
      kind: BashNodeKind.Group,
      subshell: true,
      body: parsePipeline(tokens.slice(1, -1)),
    };
  }

  if (tokens[0] === "{" && tokens[tokens.length - 1] === "}") {
    return {
      kind: BashNodeKind.Group,
      subshell: false,
      body: parsePipeline(tokens.slice(1, -1)),
    };
  }

  const redirectOps = [">", ">>", "<", ">&", "<&"];
  for (let i = 0; i < tokens.length; i++) {
    if (redirectOps.includes(tokens[i]) && i + 1 < tokens.length) {
      const targetTokens = [...tokens.slice(0, i), ...tokens.slice(i + 2)];
      return {
        kind: BashNodeKind.Redirect,
        target: parsePipeline(targetTokens.length > 0 ? targetTokens : tokens.slice(0, i)),
        op: tokens[i] as RedirectNode["op"],
        file: stripQuotes(tokens[i + 1]),
      };
    }
  }

  return parseSimpleCommand(tokens);
}

function extractCommandSubstitutions(cmd: string): string[] {
  const subs: string[] = [];
  const patterns = [
    /\$\(([^)]+)\)/g,
    /`([^`]+)`/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(cmd)) !== null) {
      subs.push(match[1]);
    }
  }

  return subs;
}

function containsEval(cmd: string): boolean {
  const evalPatterns = [
    /\beval\b/,
    /\bexec\b/,
    /\bsource\b\s+~\/?\./,
  ];

  return evalPatterns.some(p => p.test(cmd));
}

function containsDownloadPipeToShell(ast: BashNode): boolean {
  const downloadCommands = ["curl", "wget"];
  const shellCommands = ["bash", "sh", "zsh", "fish", "dash"];

  function checkNode(node: BashNode): boolean {
    if (node.kind === BashNodeKind.Pipeline) {
      const leftCmds = collectSimpleCommands(node.cmds[0]);
      const rightCmds = collectSimpleCommands(node.cmds[1]);

      const hasDownload = leftCmds.some(c =>
        downloadCommands.includes(c.argv[0]?.toLowerCase())
      );
      const hasShell = rightCmds.some(c =>
        shellCommands.includes(c.argv[0]?.toLowerCase())
      );

      if (hasDownload && hasShell) {
        return true;
      }
    }

    if (node.kind === BashNodeKind.List) {
      return checkNode(node.left) || checkNode(node.right);
    }

    if (node.kind === BashNodeKind.Group) {
      return checkNode(node.body);
    }

    return false;
  }

  return checkNode(ast);
}

function collectSimpleCommands(node: BashNode): SimpleCommandNode[] {
  const result: SimpleCommandNode[] = [];

  function walk(n: BashNode): void {
    if (n.kind === BashNodeKind.Simple) {
      result.push(n);
    } else if (n.kind === BashNodeKind.Pipeline) {
      n.cmds.forEach(walk);
    } else if (n.kind === BashNodeKind.List) {
      walk(n.left);
      walk(n.right);
    } else if (n.kind === BashNodeKind.Group) {
      walk(n.body);
    } else if (n.kind === BashNodeKind.Redirect) {
      walk(n.target);
    } else if (n.kind === BashNodeKind.CommandSubstitution) {
      walk(n.inner);
    }
  }

  walk(node);
  return result;
}

function assessRisk(
  simpleCommands: SimpleCommandNode[],
  hasPipeline: boolean,
  hasCommandSubstitution: boolean,
  hasDownloadPipeToShell: boolean,
  hasEval: boolean,
  redirects: RedirectNode[]
): { riskLevel: "low" | "medium" | "high" | "critical"; riskReasons: string[] } {
  const riskReasons: string[] = [];
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";

  const dangerousCommands = ["rm", "mkfs", "dd", "chmod", "chown", "sudo", "kill"];
  const destructiveCommands = ["rm", "mkfs", "dd", "format"];

  for (const cmd of simpleCommands) {
    const cmdName = cmd.argv[0]?.toLowerCase() || "";

    if (destructiveCommands.includes(cmdName)) {
      if (cmd.argv.includes("-rf") || cmd.argv.includes("-r") || cmd.argv.includes("-f")) {
        riskReasons.push(`destructive command: ${cmd.argv.join(" ")}`);
        riskLevel = "critical";
      } else {
        riskReasons.push(`potentially destructive: ${cmd.argv.join(" ")}`);
        if (riskLevel !== "critical") {
          riskLevel = "high";
        }
      }
    }

    if (dangerousCommands.includes(cmdName) && riskLevel === "low") {
      riskLevel = "medium";
      riskReasons.push(`sensitive command: ${cmdName}`);
    }

    if (cmdName === "sudo") {
      riskReasons.push("privilege escalation");
      riskLevel = "high";
    }

    if (cmdName === "curl" || cmdName === "wget") {
      riskReasons.push("network download");
      if (riskLevel === "low") {
        riskLevel = "medium";
      }
    }
  }

  if (hasDownloadPipeToShell) {
    riskReasons.push("download piped to shell execution");
    riskLevel = "critical";
  }

  if (hasEval) {
    riskReasons.push("eval/exec detected");
    riskLevel = "high";
  }

  if (hasCommandSubstitution) {
    riskReasons.push("command substitution");
    if (riskLevel === "low") {
      riskLevel = "medium";
    }
  }

  for (const redirect of redirects) {
    if (redirect.file.startsWith("/") || redirect.file.includes("..")) {
      riskReasons.push(`sensitive redirect target: ${redirect.file}`);
      if (riskLevel === "low") {
        riskLevel = "medium";
      }
    }
  }

  return { riskLevel, riskReasons };
}

export function parseBashCommand(cmd: string): BashNode {
  const trimmed = cmd.trim();

  if (!trimmed) {
    return {
      kind: BashNodeKind.Simple,
      argv: [],
      assignments: {},
    };
  }

  const tokens = tokenizeCommand(trimmed);

  if (tokens.length === 0) {
    return {
      kind: BashNodeKind.Simple,
      argv: [],
      assignments: {},
    };
  }

  return parsePipeline(tokens);
}

export function analyzeBashCommand(cmd: string): BashAnalysisResult {
  const ast = parseBashCommand(cmd);
  const simpleCommands = collectSimpleCommands(ast);
  const redirects: RedirectNode[] = [];

  function collectRedirects(node: BashNode): void {
    if (node.kind === BashNodeKind.Redirect) {
      redirects.push(node);
    } else if (node.kind === BashNodeKind.Pipeline) {
      node.cmds.forEach(collectRedirects);
    } else if (node.kind === BashNodeKind.List) {
      collectRedirects(node.left);
      collectRedirects(node.right);
    } else if (node.kind === BashNodeKind.Group) {
      collectRedirects(node.body);
    }
  }

  collectRedirects(ast);

  const hasPipeline = ast.kind === BashNodeKind.Pipeline;
  const hasCommandSubstitution = extractCommandSubstitutions(cmd).length > 0;
  const hasEval = containsEval(cmd);
  const hasDownloadPipeToShell = containsDownloadPipeToShell(ast);

  const risk = assessRisk(
    simpleCommands,
    hasPipeline,
    hasCommandSubstitution,
    hasDownloadPipeToShell,
    hasEval,
    redirects
  );

  return {
    simpleCommands,
    hasPipeline,
    hasCommandSubstitution,
    hasRedirects: redirects,
    hasEval,
    hasDownloadPipeToShell,
    riskLevel: risk.riskLevel,
    riskReasons: risk.riskReasons,
  };
}

export function flattenSimpleCommands(root: BashNode): SimpleCommandNode[] {
  return collectSimpleCommands(root);
}
