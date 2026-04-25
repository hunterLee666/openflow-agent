import type { ToolDefinition } from "../types/index.js";
import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface BashToolInput {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
}

export interface BashOutputInput {
  bash_id: string;
  filter?: string;
}

export interface KillShellInput {
  shell_id: string;
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
  return [
    {
      name: "Bash",
      description: "Execute shell commands in a persistent session. Use for terminal operations: git, npm, docker, pytest, etc. NEVER use for file reading (use Read), editing (use Edit), or writing (use Write).",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
          description: { type: "string", description: "Clear 5-10 word description of the command" },
          timeout: { type: "number", description: "Milliseconds before timeout (default: 120000ms, max: 600000ms)" },
          run_in_background: { type: "boolean", description: "Run command in background" },
        },
        required: ["command"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as BashToolInput;
        const timeout = Math.min(typed.timeout || 120000, 600000);

        if (typed.run_in_background) {
          const shell = shellManager.createShell(typed.command, timeout);
          return `Background shell started: ${shell.id}\nUse BashOutput to check progress, KillShell to terminate.`;
        }

        return new Promise((resolve) => {
          const shell = shellManager.createShell(typed.command, timeout);

          shell.process.on("close", () => {
            const output = shell.output.join("");
            const result = output || "Command executed successfully";
            shellManager.killShell(shell.id);
            resolve(result);
          });
        });
      },
    },
    {
      name: "BashOutput",
      description: "Retrieve output from running or completed background bash shells. Returns only new output since last check.",
      inputSchema: {
        type: "object",
        properties: {
          bash_id: { type: "string", description: "ID of the background shell" },
          filter: { type: "string", description: "Regular expression to filter output lines" },
        },
        required: ["bash_id"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as BashOutputInput;
        const shell = shellManager.getShell(typed.bash_id);

        if (!shell) {
          return `Shell not found: ${typed.bash_id}`;
        }

        const newOutput = shell.output.slice(shell.lastReadIndex);
        shell.lastReadIndex = shell.output.length;

        let filteredOutput = newOutput.join("");

        if (typed.filter) {
          const regex = new RegExp(typed.filter);
          filteredOutput = filteredOutput
            .split("\n")
            .filter((line) => regex.test(line))
            .join("\n");
        }

        return filteredOutput || "No new output";
      },
    },
    {
      name: "KillShell",
      description: "Terminate a running background bash shell.",
      inputSchema: {
        type: "object",
        properties: {
          shell_id: { type: "string", description: "ID of shell to terminate" },
        },
        required: ["shell_id"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as KillShellInput;
        const killed = shellManager.killShell(typed.shell_id);
        return killed ? `Shell ${typed.shell_id} terminated` : `Shell not found: ${typed.shell_id}`;
      },
    },
  ];
}

export { shellManager };
