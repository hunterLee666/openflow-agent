import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool } from "./tool-factory.js";
import type { InputValidator, ToolValidationContext, ValidationResult } from "./validation.js";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const GlobInputSchema = z.object({
  pattern: z.string().min(1, "pattern 不能为空"),
  path: z.string().optional(),
});

const GrepInputSchema = z.object({
  pattern: z.string().min(1, "pattern 不能为空"),
  path: z.string().optional(),
  output_mode: z.enum(["content", "files_with_matches", "count"]).optional(),
  glob: z.string().optional(),
  type: z.string().optional(),
  "-A": z.number().int().nonnegative().optional(),
  "-B": z.number().int().nonnegative().optional(),
  "-C": z.number().int().nonnegative().optional(),
  "-i": z.boolean().optional(),
  "-n": z.boolean().optional(),
  multiline: z.boolean().optional(),
  head_limit: z.number().int().positive().optional(),
});

const GlobOutputSchema = z.object({
  matches: z.string(),
  count: z.number().int().nonnegative(),
});

const GrepOutputSchema = z.object({
  matches: z.string(),
  count: z.number().int().nonnegative(),
  mode: z.string(),
});

function createSearchPathValidator(workspaceRoot: string): InputValidator<any> {
  return async (input: any, ctx: ToolValidationContext): Promise<ValidationResult<any>> => {
    if (input.path) {
      const resolved = resolve(workspaceRoot, input.path);
      if (!resolved.startsWith(workspaceRoot)) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `路径必须在 workspace 内: ${input.path}`,
            recoverable: true,
          },
        };
      }
    }
    return { ok: true, data: input };
  };
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

  const pathValidator = createSearchPathValidator(workspaceRoot);

  const globTool = createReadOnlyTool({
    name: "Glob",
    description: "Fast file pattern matching tool that works with any codebase size. Supports glob patterns like '**/*.js' or 'src/**/*.ts'. Returns matching file paths sorted by modification time.",
    inputSchema: GlobInputSchema,
    outputSchema: GlobOutputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const searchPath = safePath(input.path);
      const args = ["--files", "--glob", input.pattern, searchPath];
      const result = await runRipgrep(args, workspaceRoot);
      const lines = result.split("\n").filter((l) => l.trim());
      return {
        matches: result,
        count: lines.length,
      };
    },
  });

  const grepTool = createReadOnlyTool({
    name: "Grep",
    description: "A powerful search tool built on ripgrep. Supports full regex syntax, file type filtering, and context lines. NEVER invoke `grep` or `rg` as a Bash command.",
    inputSchema: GrepInputSchema,
    outputSchema: GrepOutputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const searchPath = safePath(input.path);
      const args: string[] = [];

      if (input.output_mode === "files_with_matches") {
        args.push("-l");
      } else if (input.output_mode === "count") {
        args.push("--count");
      }

      if (input["-A"]) args.push("-A", String(input["-A"]));
      if (input["-B"]) args.push("-B", String(input["-B"]));
      if (input["-C"]) args.push("-C", String(input["-C"]));
      if (input["-i"]) args.push("-i");
      if (input["-n"] || input.output_mode === "content") args.push("-n");
      if (input.multiline) args.push("-U", "--multiline-dotall");
      if (input.glob) args.push("--glob", input.glob);
      if (input.type) args.push("--type", input.type);
      if (input.head_limit) args.push("-m", String(input.head_limit));

      args.push(input.pattern, searchPath);

      const result = await runRipgrep(args, workspaceRoot);
      const lines = result.split("\n").filter((l) => l.trim());
      return {
        matches: result,
        count: lines.length,
        mode: input.output_mode || "content",
      };
    },
  });

  return [globTool, grepTool];
}
