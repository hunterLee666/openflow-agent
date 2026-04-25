import type { ToolDefinition } from "../types/index.js";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

export interface GlobToolInput {
  pattern: string;
  path?: string;
}

export interface GrepToolInput {
  pattern: string;
  path?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  glob?: string;
  type?: string;
  "-A"?: number;
  "-B"?: number;
  "-C"?: number;
  "-i"?: boolean;
  "-n"?: boolean;
  multiline?: boolean;
  head_limit?: number;
}

function runRipgrep(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rg = spawn("rg", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    rg.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    rg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    rg.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout || "No matches found");
      } else {
        reject(new Error(`ripgrep failed (exit code ${code}): ${stderr}`));
      }
    });

    rg.on("error", () => {
      reject(new Error("ripgrep (rg) is not installed. Please install it: brew install ripgrep"));
    });
  });
}

export function createSearchTools(workspaceRoot: string): ToolDefinition[] {
  const safePath = (inputPath?: string): string => {
    if (!inputPath) return workspaceRoot;
    const resolved = resolve(workspaceRoot, inputPath);
    if (!resolved.startsWith(workspaceRoot)) {
      throw new Error(`Path traversal detected: ${inputPath}`);
    }
    return resolved;
  };

  return [
    {
      name: "Glob",
      description: "Fast file pattern matching tool that works with any codebase size. Supports glob patterns like '**/*.js' or 'src/**/*.ts'. Returns matching file paths sorted by modification time.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The glob pattern to match files against" },
          path: { type: "string", description: "The directory to search in (defaults to current working directory)" },
        },
        required: ["pattern"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as GlobToolInput;
        const searchPath = safePath(typed.path);
        const args = ["--files", "--glob", typed.pattern, searchPath];
        return runRipgrep(args, workspaceRoot);
      },
    },
    {
      name: "Grep",
      description: "A powerful search tool built on ripgrep. Supports full regex syntax, file type filtering, and context lines. NEVER invoke `grep` or `rg` as a Bash command.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The regular expression pattern to search for" },
          path: { type: "string", description: "File or directory to search in" },
          output_mode: { type: "string", enum: ["content", "files_with_matches", "count"], description: "Output mode" },
          glob: { type: "string", description: "Glob pattern to filter files (e.g. '*.js')" },
          type: { type: "string", description: "File type to search (e.g. 'js', 'py', 'rust')" },
          "-A": { type: "number", description: "Lines to show after each match" },
          "-B": { type: "number", description: "Lines to show before each match" },
          "-C": { type: "number", description: "Lines to show before and after each match" },
          "-i": { type: "boolean", description: "Case insensitive search" },
          "-n": { type: "boolean", description: "Show line numbers" },
          multiline: { type: "boolean", description: "Enable multiline matching" },
          head_limit: { type: "number", description: "Limit output to first N results" },
        },
        required: ["pattern"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as GrepToolInput;
        const searchPath = safePath(typed.path);
        const args: string[] = [];

        if (typed.output_mode === "files_with_matches") {
          args.push("-l");
        } else if (typed.output_mode === "count") {
          args.push("--count");
        }

        if (typed["-A"]) args.push("-A", String(typed["-A"]));
        if (typed["-B"]) args.push("-B", String(typed["-B"]));
        if (typed["-C"]) args.push("-C", String(typed["-C"]));
        if (typed["-i"]) args.push("-i");
        if (typed["-n"] || typed.output_mode === "content") args.push("-n");
        if (typed.multiline) args.push("-U", "--multiline-dotall");
        if (typed.glob) args.push("--glob", typed.glob);
        if (typed.type) args.push("--type", typed.type);
        if (typed.head_limit) args.push("-m", String(typed.head_limit));

        args.push(typed.pattern, searchPath);

        return runRipgrep(args, workspaceRoot);
      },
    },
  ];
}
