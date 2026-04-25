import type { ToolDefinition } from "../types/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export function createGitTools(): ToolDefinition[] {
  return [
    {
      name: "git_status",
      description: "Show the current git status",
      inputSchema: { type: "object", properties: {} },
      isReadOnly: true,
      handler: async () => {
        const { stdout } = await execAsync("git status --short");
        return stdout || "Working tree clean";
      },
    },
    {
      name: "git_diff",
      description: "Show git diff for unstaged changes",
      inputSchema: { type: "object", properties: { staged: { type: "boolean" } } },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { staged?: boolean };
        const flag = typed.staged ? "--staged" : "";
        const { stdout } = await execAsync(`git diff ${flag}`);
        return stdout || "No changes";
      },
    },
    {
      name: "git_log",
      description: "Show recent git commits",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { limit?: number };
        const limit = typed.limit || 10;
        const { stdout } = await execAsync(`git log --oneline -${limit}`);
        return stdout;
      },
    },
    {
      name: "git_branch",
      description: "List git branches",
      inputSchema: { type: "object", properties: { remote: { type: "boolean" } } },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { remote?: boolean };
        const flag = typed.remote ? "-r" : "";
        const { stdout } = await execAsync(`git branch ${flag}`);
        return stdout;
      },
    },
  ];
}
