import { spawn } from "node:child_process";
import { platform } from "node:os";
import type { SandboxExecutor, SandboxProfile, SandboxResult } from "./types.js";

export class SeatbeltExecutor implements SandboxExecutor {
  isAvailable(): boolean {
    return platform() === "darwin" && commandExists("sandbox-exec");
  }

  async execute(command: string[], profile: SandboxProfile): Promise<SandboxResult> {
    const sandboxProfile = this.buildSeatbeltProfile(profile);
    const args = ["-p", sandboxProfile, ...command];
    return runCommand("sandbox-exec", args, profile.timeout);
  }

  private buildSeatbeltProfile(profile: SandboxProfile): string {
    const lines: string[] = ["(version 1)"];

    // Deny all by default
    lines.push("(deny default)");

    // Allow read-only directories
    for (const dir of profile.readonlyDirs) {
      lines.push(`(allow file-read* (subpath "${dir}"))`);
    }

    // Allow writable directories
    for (const dir of profile.writableDirs) {
      lines.push(`(allow file-read* file-write* (subpath "${dir}"))`);
    }

    // Allow network if needed
    if (profile.networkAccess) {
      lines.push("(allow network*)");
    }

    // Allow process execution
    lines.push("(allow process-exec (subpath \"/bin\") (subpath \"/usr/bin\") (subpath \"/usr/local/bin\"))");

    return lines.join("\n");
  }
}

export class BubblewrapExecutor implements SandboxExecutor {
  isAvailable(): boolean {
    return platform() === "linux" && commandExists("bwrap");
  }

  async execute(command: string[], profile: SandboxProfile): Promise<SandboxResult> {
    const args: string[] = [
      "--unshare-all",
      "--die-with-parent",
      "--proc", "/proc",
      "--dev", "/dev",
    ];

    // Bind read-only directories
    for (const dir of profile.readonlyDirs) {
      args.push("--ro-bind", dir, dir);
    }

    // Bind writable directories
    for (const dir of profile.writableDirs) {
      args.push("--bind", dir, dir);
    }

    // Network
    if (!profile.networkAccess) {
      args.push("--unshare-net");
    }

    // Command
    args.push("--", ...command);

    return runCommand("bwrap", args, profile.timeout);
  }
}

export class NoSandboxExecutor implements SandboxExecutor {
  isAvailable(): boolean {
    return true;
  }

  async execute(command: string[], profile: SandboxProfile): Promise<SandboxResult> {
    return runCommand(command[0], command.slice(1), profile.timeout);
  }
}

function runCommand(cmd: string, args: string[], timeout: number): Promise<SandboxResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Sandbox timeout after ${timeout}ms`));
    }, timeout);

    const startTime = Date.now();

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
        duration: Date.now() - startTime,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function commandExists(cmd: string): boolean {
  try {
    const { execSync } = require("node:child_process");
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
