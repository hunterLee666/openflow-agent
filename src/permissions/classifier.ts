import type {
  PermissionDecision,
  PermissionContext,
  RiskLevel,
} from "./types.js";

export type ClassifierResult = {
  decision: PermissionDecision;
  confidence: number;
  reasons: string[];
  metadata?: Record<string, unknown>;
};

export interface PermissionClassifier {
  classify(context: PermissionContext): Promise<ClassifierResult>;
  train?(examples: TrainingExample[]): Promise<void>;
  reset?(): void;
}

export interface TrainingExample {
  context: PermissionContext;
  expected: PermissionDecision;
  weight?: number;
}

export class BashCommandClassifier implements PermissionClassifier {
  private knownSafeCommands = new Set<string>([
    "ls",
    "pwd",
    "cd",
    "echo",
    "cat",
    "head",
    "tail",
    "grep",
    "find",
    "sort",
    "uniq",
    "wc",
    "mkdir",
    "rmdir",
    "touch",
    "cp",
    "mv",
    "date",
    "whoami",
    "id",
    "env",
    "printenv",
    "which",
    "type",
    "history",
  ]);

  private knownDangerousCommands = new Set<string>([
    "rm",
    "dd",
    "mkfs",
    "fdisk",
    "parted",
    ":(){:|:&};:",
    "chmod",
    "chown",
  ]);

  private networkCommands = new Set<string>([
    "curl",
    "wget",
    "ssh",
    "scp",
    "rsync",
    "ftp",
    "sftp",
    "nc",
    "netcat",
    "ping",
    "traceroute",
    "nslookup",
    "dig",
  ]);

  private editCommands = new Set<string>([
    "vim",
    "vi",
    "nano",
    "emacs",
    "sed",
    "awk",
    "tee",
  ]);

  async classify(context: PermissionContext): Promise<ClassifierResult> {
    const command = this.extractCommand(context.input);
    const reasons: string[] = [];
    let confidence = 0.5;

    if (!command) {
      return {
        decision: { type: "ask", prompt: "Unable to determine command", risk: "medium" },
        confidence: 0,
        reasons: ["Could not extract command from input"],
      };
    }

    const baseCommand = command.split(" ")[0];

    if (this.knownSafeCommands.has(baseCommand)) {
      reasons.push(`Command '${baseCommand}' is in the safe list`);
      confidence += 0.3;
    }

    if (this.knownDangerousCommands.has(baseCommand)) {
      reasons.push(`Command '${baseCommand}' is in the dangerous list`);
      confidence -= 0.3;

      if (this.hasDangerousFlags(command)) {
        reasons.push("Command has dangerous flags");
        confidence -= 0.2;
      }
    }

    if (this.networkCommands.has(baseCommand)) {
      reasons.push(`Command '${baseCommand}' is a network command`);
      confidence -= 0.1;
    }

    if (this.isReadOnlyOperation(command)) {
      reasons.push("Operation is read-only");
      confidence += 0.2;
    }

    if (context.isDestructive) {
      reasons.push("Operation is marked as destructive");
      confidence -= 0.3;
    }

    if (context.isNetworkCommand) {
      reasons.push("Operation involves network access");
      confidence -= 0.1;
    }

    confidence = Math.max(0, Math.min(1, confidence));

    if (confidence >= 0.8 && !context.isDestructive && !context.isNetworkCommand) {
      return {
        decision: { type: "allow", reason: `Auto-approved: ${reasons.join(", ")}` },
        confidence,
        reasons,
      };
    }

    if (confidence >= 0.7 && this.isReadOnlyOperation(command)) {
      return {
        decision: { type: "allow", reason: `Auto-approved read-only: ${reasons.join(", ")}` },
        confidence,
        reasons,
      };
    }

    if (confidence <= 0.2) {
      return {
        decision: {
          type: "deny",
          reason: `Auto-denied due to high risk: ${reasons.join(", ")}`,
        },
        confidence,
        reasons,
      };
    }

    const risk = this.calculateRisk(context, confidence);
    return {
      decision: {
        type: "ask",
        prompt: this.generatePrompt(command, context, risk),
        risk,
        suggestions: this.generateSuggestions(command, context),
      },
      confidence,
      reasons,
    };
  }

  private extractCommand(input: Record<string, unknown>): string | null {
    if (typeof input.command === "string") {
      return input.command;
    }
    if (typeof input.cmd === "string") {
      return input.cmd;
    }
    if (typeof input.script === "string") {
      return input.script;
    }
    return null;
  }

  private hasDangerousFlags(command: string): boolean {
    const dangerousFlags = [
      "-rf",
      "-r",
      "-f",
      "--force",
      "--recursive",
      "-x",
      "--delete",
      "--remove",
    ];
    const lowerCommand = command.toLowerCase();
    return dangerousFlags.some((flag) => lowerCommand.includes(flag));
  }

  private isReadOnlyOperation(command: string): boolean {
    const readOnlyIndicators = [
      "cat",
      "head",
      "tail",
      "less",
      "more",
      "grep",
      "find",
      "locate",
      "which",
      "whereis",
      "type",
      "file",
      "stat",
      "wc",
      "sort",
      "uniq",
    ];
    const baseCommand = command.split(" ")[0];
    return readOnlyIndicators.includes(baseCommand);
  }

  private calculateRisk(context: PermissionContext, confidence: number): RiskLevel {
    if (context.isDestructive) {
      return "critical";
    }
    if (context.isNetworkCommand) {
      return "high";
    }
    if (confidence < 0.5) {
      return "high";
    }
    if (confidence < 0.7) {
      return "medium";
    }
    return "low";
  }

  private generatePrompt(
    command: string,
    context: PermissionContext,
    risk: RiskLevel
  ): string {
    return `Execute bash command?\n\nCommand: \`${command}\`\n\nRisk: ${risk}\nMode: ${context.mode}`;
  }

  private generateSuggestions(
    command: string,
    context: PermissionContext
  ): string[] | undefined {
    const suggestions: string[] = [];
    const baseCommand = command.split(" ")[0];

    if (this.knownSafeCommands.has(baseCommand)) {
      suggestions.push("Approve (safe command)");
    }

    if (this.hasDangerousFlags(command)) {
      suggestions.push("Deny (dangerous flags detected)");
    }

    suggestions.push("Approve once");
    suggestions.push("Deny");

    return suggestions;
  }
}

export class FileOperationClassifier implements PermissionClassifier {
  private safeExtensions = new Set<string>([
    ".txt",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".csv",
    ".log",
    ".ini",
    ".conf",
    ".config",
  ]);

  private dangerousExtensions = new Set<string>([
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".sh",
    ".bash",
    ".zsh",
    ".ps1",
    ".bat",
    ".cmd",
  ]);

  private sourceExtensions = new Set<string>([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
  ]);

  async classify(context: PermissionContext): Promise<ClassifierResult> {
    const reasons: string[] = [];
    let confidence = 0.5;

    const path = this.extractPath(context.input);
    if (!path) {
      return {
        decision: { type: "ask", prompt: "Unable to determine file path", risk: "medium" },
        confidence: 0,
        reasons: ["Could not extract file path from input"],
      };
    }

    const ext = this.getExtension(path);

    if (this.safeExtensions.has(ext)) {
      reasons.push(`File extension '${ext}' is typically safe`);
      confidence += 0.2;
    }

    if (this.dangerousExtensions.has(ext)) {
      reasons.push(`File extension '${ext}' may be executable/script`);
      confidence -= 0.3;
    }

    if (this.sourceExtensions.has(ext)) {
      reasons.push(`File extension '${ext}' is source code`);
      confidence += 0.1;
    }

    if (context.isDestructive) {
      reasons.push("Operation is destructive");
      confidence -= 0.3;
    }

    confidence = Math.max(0, Math.min(1, confidence));

    if (confidence >= 0.8 && !context.isDestructive) {
      return {
        decision: { type: "allow", reason: `Auto-approved: ${reasons.join(", ")}` },
        confidence,
        reasons,
      };
    }

    const risk = this.calculateRisk(context, confidence);
    return {
      decision: {
        type: "ask",
        prompt: `File operation?\n\nPath: ${path}\nTool: ${context.tool}\nRisk: ${risk}`,
        risk,
      },
      confidence,
      reasons,
    };
  }

  private extractPath(input: Record<string, unknown>): string | null {
    if (typeof input.path === "string") {
      return input.path;
    }
    if (typeof input.file === "string") {
      return input.file;
    }
    if (typeof input.dest === "string") {
      return input.dest;
    }
    if (typeof input.target === "string") {
      return input.target;
    }
    return null;
  }

  private getExtension(path: string): string {
    const lastDot = path.lastIndexOf(".");
    if (lastDot === -1 || lastDot === 0) {
      return "";
    }
    return path.slice(lastDot);
  }

  private calculateRisk(context: PermissionContext, confidence: number): RiskLevel {
    if (context.isDestructive) {
      return "critical";
    }
    if (confidence < 0.4) {
      return "high";
    }
    if (confidence < 0.7) {
      return "medium";
    }
    return "low";
  }
}

export class NetworkOperationClassifier implements PermissionClassifier {
  private safeDomains = new Set<string>([
    "api.github.com",
    "registry.npmjs.org",
    "pypi.org",
    "hub.docker.com",
  ]);

  private safeEndpoints = new Set<string>([
    "/repos/",
    "/packages/",
    "/users/",
    "/search/",
  ]);

  async classify(context: PermissionContext): Promise<ClassifierResult> {
    const reasons: string[] = [];
    let confidence = 0.5;

    const url = this.extractUrl(context.input);
    if (!url) {
      return {
        decision: { type: "ask", prompt: "Unable to determine URL", risk: "medium" },
        confidence: 0,
        reasons: ["Could not extract URL from input"],
      };
    }

    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname;

      if (this.safeDomains.has(host)) {
        reasons.push(`Domain '${host}' is in the safe list`);
        confidence += 0.3;
      }

      const path = urlObj.pathname;
      if (Array.from(this.safeEndpoints).some((endpoint) => path.startsWith(endpoint))) {
        reasons.push(`Endpoint '${path}' is typically safe`);
        confidence += 0.2;
      }

      if (url.startsWith("https://")) {
        reasons.push("Using HTTPS");
        confidence += 0.1;
      } else if (url.startsWith("http://")) {
        reasons.push("Using unencrypted HTTP");
        confidence -= 0.2;
      }
    } catch {
      reasons.push("Could not parse URL");
      confidence -= 0.2;
    }

    confidence = Math.max(0, Math.min(1, confidence));

    if (confidence >= 0.8) {
      return {
        decision: { type: "allow", reason: `Auto-approved: ${reasons.join(", ")}` },
        confidence,
        reasons,
      };
    }

    const risk = confidence < 0.5 ? "high" : confidence < 0.7 ? "medium" : "low";
    return {
      decision: {
        type: "ask",
        prompt: `Network request?\n\nURL: ${url}\nTool: ${context.tool}\nRisk: ${risk}`,
        risk,
      },
      confidence,
      reasons,
    };
  }

  private extractUrl(input: Record<string, unknown>): string | null {
    if (typeof input.url === "string") {
      return input.url;
    }
    if (typeof input.uri === "string") {
      return input.uri;
    }
    if (typeof input.endpoint === "string") {
      return input.endpoint;
    }
    return null;
  }
}

export class CompositeClassifier implements PermissionClassifier {
  private classifiers: Map<string, PermissionClassifier> = new Map();

  register(name: string, classifier: PermissionClassifier): void {
    this.classifiers.set(name, classifier);
  }

  async classify(context: PermissionContext): Promise<ClassifierResult> {
    const applicableClassifiers = this.getApplicableClassifiers(context);

    if (applicableClassifiers.length === 0) {
      return {
        decision: { type: "ask", prompt: "No applicable classifier", risk: "medium" },
        confidence: 0,
        reasons: ["No classifier found for this tool type"],
      };
    }

    const results: ClassifierResult[] = [];
    for (const classifier of applicableClassifiers) {
      try {
        const result = await classifier.classify(context);
        results.push(result);
      } catch (error) {
        console.error("Classifier error:", error);
      }
    }

    return this.aggregateResults(results);
  }

  private getApplicableClassifiers(context: PermissionContext): PermissionClassifier[] {
    const applicable: PermissionClassifier[] = [];

    if (context.tool === "bash" || context.tool === "shell" || context.tool === "exec") {
      const bashClassifier = this.classifiers.get("bash");
      if (bashClassifier) {
        applicable.push(bashClassifier);
      }
    }

    if (
      context.tool === "file_read" ||
      context.tool === "file_write" ||
      context.tool === "file_edit" ||
      context.tool === "edit"
    ) {
      const fileClassifier = this.classifiers.get("file");
      if (fileClassifier) {
        applicable.push(fileClassifier);
      }
    }

    if (
      context.tool === "http_request" ||
      context.tool === "web_fetch" ||
      context.tool === "web_search" ||
      context.isNetworkCommand
    ) {
      const networkClassifier = this.classifiers.get("network");
      if (networkClassifier) {
        applicable.push(networkClassifier);
      }
    }

    return applicable;
  }

  private aggregateResults(results: ClassifierResult[]): ClassifierResult {
    if (results.length === 0) {
      return {
        decision: { type: "ask", prompt: "No results to aggregate", risk: "medium" },
        confidence: 0,
        reasons: [],
      };
    }

    if (results.length === 1) {
      return results[0];
    }

    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const avgConfidence = totalConfidence / results.length;

    const allReasons = results.flatMap((r) => r.reasons);

    const anyAllow = results.some((r) => r.decision.type === "allow");
    const anyDeny = results.some((r) => r.decision.type === "deny");
    const allAsk = results.every((r) => r.decision.type === "ask");

    if (anyDeny && !anyAllow) {
      return {
        decision: {
          type: "deny",
          reason: "Multiple classifiers voted to deny",
        },
        confidence: avgConfidence,
        reasons: allReasons,
      };
    }

    if (anyAllow && !anyDeny && avgConfidence >= 0.7) {
      return {
        decision: {
          type: "allow",
          reason: "Multiple classifiers voted to allow",
        },
        confidence: avgConfidence,
        reasons: allReasons,
      };
    }

    const maxConfidence = Math.max(...results.map((r) => r.confidence));
    const bestResult = results.find((r) => r.confidence === maxConfidence) || results[0];

    return {
      ...bestResult,
      confidence: avgConfidence,
      reasons: allReasons,
    };
  }
}

export function createDefaultClassifier(): CompositeClassifier {
  const composite = new CompositeClassifier();
  composite.register("bash", new BashCommandClassifier());
  composite.register("file", new FileOperationClassifier());
  composite.register("network", new NetworkOperationClassifier());
  return composite;
}

export type SpeculativeClassifier = PermissionClassifier;

export interface RiskScore {
  level: RiskLevel;
  confidence: number;
  factors: string[];
}

export const DefaultSpeculativeClassifier = CompositeClassifier;
