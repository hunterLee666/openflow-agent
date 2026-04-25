import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool, createWriteTool } from "./tool-factory.js";
import type { InputValidator, ToolValidationContext, ValidationResult } from "./validation.js";
import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

const BashInputSchema = z.object({
  command: z.string().min(1, "command 不能为空"),
  description: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  run_in_background: z.boolean().optional(),
});

const BashOutputInputSchema = z.object({
  bash_id: z.string().min(1, "bash_id 不能为空"),
  filter: z.string().optional(),
});

const KillShellInputSchema = z.object({
  shell_id: z.string().min(1, "shell_id 不能为空"),
});

const BashOutputSchema = z.object({
  id: z.string(),
  output: z.string(),
  status: z.string(),
  exitCode: z.number().nullable(),
});

const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=",
  "> /dev/sda",
  ":(){ :|:& };:",
  "chmod -R 777 /",
  "chmod -R 000 /",
];

function createBashCommandValidator(): InputValidator<any> {
  return async (input: any, ctx: ToolValidationContext): Promise<ValidationResult<any>> => {
    const cmd = input.command?.toLowerCase() || "";

    for (const dangerous of DANGEROUS_COMMANDS) {
      if (cmd.includes(dangerous.toLowerCase())) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `拒绝执行危险命令: ${input.command}`,
            recoverable: true,
          },
        };
      }
    }

    return { ok: true, data: input };
  };
}

interface RunningShell {
  id: string;
  process: ChildProcess;
  output: string[];
  status: "running" | "done";
  exitCode: number | null;
  lastReadIndex: number;
}

class BashShellManager extends EventEmitter {
  private shells = new Map<string, RunningShell>();
  private counter = 0;

  createShell(command: string, timeout = 120000): RunningShell {
    const id = `shell_${++this.counter}`;
    const shell: RunningShell = {
      id,
      process: spawn(command, [], { shell: true, stdio: ["pipe", "pipe", "pipe"], timeout }),
      output: [],
      status: "running",
      exitCode: null,
      lastReadIndex: 0,
    };

    shell.process.stdout?.on("data", (data) => {
      shell.output.push(data.toString());
      this.emit("output", { shellId: id, data: data.toString(), type: "stdout" });
    });

    shell.process.stderr?.on("data", (data) => {
      shell.output.push(data.toString());
      this.emit("output", { shellId: id, data: data.toString(), type: "stderr" });
    });

    shell.process.on("close", (code) => {
      shell.status = "done";
      shell.exitCode = code;
      this.emit("close", { shellId: id, exitCode: code });
    });

    this.shells.set(id, shell);
    return shell;
  }

  getShell(id: string): RunningShell | undefined {
    return this.shells.get(id);
  }

  killShell(id: string): boolean {
    const shell = this.shells.get(id);
    if (!shell) return false;

    if (shell.status === "running") {
      shell.process.kill("SIGTERM");
      shell.status = "done";
      shell.exitCode = -1;
    }

    this.shells.delete(id);
    return true;
  }

  listShells(): Array<{ id: string; status: string }> {
    const result: Array<{ id: string; status: string }> = [];
    for (const [id, shell] of this.shells.entries()) {
      result.push({ id, status: shell.status });
    }
    return result;
  }
}

const shellManager = new BashShellManager();

export function createBashTools(): ToolDefinition[] {
  const bashValidator = createBashCommandValidator();

  const bashTool = createWriteTool({
    name: "Bash",
    description: "Execute shell commands in a persistent session. Use for terminal operations: git, npm, docker, pytest, etc. NEVER use for file reading (use Read), editing (use Edit), or writing (use Write).",
    inputSchema: BashInputSchema,
    outputSchema: BashOutputSchema,
    validateInput: bashValidator,
    handler: async (input) => {
      const shell = shellManager.createShell(input.command, input.timeout);

      if (input.run_in_background) {
        return {
          id: shell.id,
          output: "Command started in background",
          status: "running",
          exitCode: null,
        };
      }

      return new Promise((resolve, reject) => {
        shell.process.on("close", (code) => {
          resolve({
            id: shell.id,
            output: shell.output.join(""),
            status: shell.status,
            exitCode: shell.exitCode,
          });
        });

        shell.process.on("error", (err) => {
          reject(err);
        });
      });
    },
  });

  const bashOutputTool = defineTool({
    name: "BashOutput",
    description: "Get output from a running background shell.",
    inputSchema: BashOutputInputSchema,
    isReadOnly: true,
    isConcurrencySafe: true,
    handler: async (input) => {
      const shell = shellManager.getShell(input.bash_id);
      if (!shell) {
        throw new Error(`Shell not found: ${input.bash_id}`);
      }

      const newOutput = shell.output.slice(shell.lastReadIndex).join("");
      shell.lastReadIndex = shell.output.length;

      return {
        id: shell.id,
        output: newOutput,
        status: shell.status,
        exitCode: shell.exitCode,
      };
    },
  });

  const killShellTool = defineTool({
    name: "KillShell",
    description: "Kill a running background shell.",
    inputSchema: KillShellInputSchema,
    isReadOnly: false,
    isConcurrencySafe: false,
    handler: async (input) => {
      const killed = shellManager.killShell(input.shell_id);
      if (!killed) {
        throw new Error(`Shell not found: ${input.shell_id}`);
      }
      return {
        id: input.shell_id,
        output: "Shell killed",
        status: "killed",
        exitCode: -1,
      };
    },
  });

  return [bashTool, bashOutputTool, killShellTool];
}
