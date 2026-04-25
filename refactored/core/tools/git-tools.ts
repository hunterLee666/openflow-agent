import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool } from "./tool-factory.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const GitStatusInputSchema = z.object({});

const GitDiffInputSchema = z.object({
  staged: z.boolean().optional(),
});

const GitLogInputSchema = z.object({
  limit: z.number().int().positive().optional(),
});

const GitBranchInputSchema = z.object({
  remote: z.boolean().optional(),
});

const GitOutputSchema = z.object({
  output: z.string(),
});

export function createGitTools(): ToolDefinition[] {
  const gitStatusTool = createReadOnlyTool({
    name: "git_status",
    description: "Show the current git status",
    inputSchema: GitStatusInputSchema,
    outputSchema: GitOutputSchema,
    handler: async () => {
      const { stdout } = await execAsync("git status --short");
      return { output: stdout || "Working tree clean" };
    },
  });

  const gitDiffTool = createReadOnlyTool({
    name: "git_diff",
    description: "Show git diff for unstaged changes",
    inputSchema: GitDiffInputSchema,
    outputSchema: GitOutputSchema,
    handler: async (input) => {
      const flag = input.staged ? "--staged" : "";
      const { stdout } = await execAsync(`git diff ${flag}`);
      return { output: stdout || "No changes" };
    },
  });

  const gitLogTool = createReadOnlyTool({
    name: "git_log",
    description: "Show recent git commits",
    inputSchema: GitLogInputSchema,
    outputSchema: GitOutputSchema,
    handler: async (input) => {
      const limit = input.limit || 10;
      const { stdout } = await execAsync(`git log --oneline -${limit}`);
      return { output: stdout };
    },
  });

  const gitBranchTool = createReadOnlyTool({
    name: "git_branch",
    description: "List git branches",
    inputSchema: GitBranchInputSchema,
    outputSchema: GitOutputSchema,
    handler: async (input) => {
      const flag = input.remote ? "-r" : "";
      const { stdout } = await execAsync(`git branch ${flag}`);
      return { output: stdout };
    },
  });

  return [gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool];
}
