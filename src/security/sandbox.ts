export type SandboxBackend = "bubblewrap" | "sandbox-exec" | "none";

export interface SandboxConfig {
  enabled: boolean;
  backend: SandboxBackend;
  allowedPaths: string[];
  deniedPaths: string[];
  allowedNetworks: string[];
  deniedNetworks: string[];
  maxProcesses?: number;
  maxMemory?: string;
  maxCpuTime?: string;
  readOnlyFs: boolean;
  noNewPrivs: boolean;
}

export interface SandboxViolation {
  type: "path" | "network" | "process" | "memory" | "cpu" | "unknown";
  message: string;
  timestamp: number;
  command?: string;
  details?: Record<string, unknown>;
}

export interface SandboxResult {
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  violations: SandboxViolation[];
  duration?: number;
}

export interface SandboxAdapter {
  execute(command: string, config: SandboxConfig): Promise<SandboxResult>;
  isAvailable(): boolean;
  getBackend(): SandboxBackend;
}

export const PLATFORM_SANDBOX_BACKENDS: Record<string, SandboxBackend> = {
  darwin: "sandbox-exec",
  linux: "bubblewrap",
  win32: "none",
  freebsd: "none",
  sunos: "none",
  netbsd: "bubblewrap",
  openbsd: "bubblewrap",
  cygwin: "none",
  android: "none",
};

export class BubblewrapAdapter implements SandboxAdapter {
  getBackend(): SandboxBackend {
    return "bubblewrap";
  }

  isAvailable(): boolean {
    try {
      const { execSync } = require("child_process");
      execSync("which bwrap", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async execute(command: string, config: SandboxConfig): Promise<SandboxResult> {
    const args = this.buildArgs(config);
    const fullCommand = `bwrap ${args.join(" ")} /bin/sh -c ${JSON.stringify(command)}`;

    return this.runCommand(fullCommand);
  }

  private buildArgs(config: SandboxConfig): string[] {
    const args: string[] = [];

    args.push("--unshare-user");
    args.push("--unshare-pid");
    args.push("--unshare-net");

    if (config.readOnlyFs) {
      args.push("--ro-bind / /");
    }

    for (const path of config.allowedPaths) {
      args.push("--bind", path, path);
    }

    for (const path of config.deniedPaths) {
      args.push("--proc", path);
    }

    if (config.allowedNetworks.length > 0) {
      for (const net of config.allowedNetworks) {
        args.push("--bind", net, net);
      }
    } else {
      args.push("--unshare-network");
    }

    if (config.noNewPrivs) {
      args.push("--seccomp");
    }

    if (config.maxProcesses) {
      args.push("--limit-namespace", `pid,max=${config.maxProcesses}`);
    }

    if (config.maxMemory) {
      args.push("--limit-as", config.maxMemory);
    }

    args.push("--die-with-parent");

    return args;
  }

  private async runCommand(command: string): Promise<SandboxResult> {
    const { execSync, exec } = require("child_process");
    const startTime = Date.now();
    const violations: SandboxViolation[] = [];

    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout: 30000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return {
        success: true,
        exitCode: 0,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        violations,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const execError = error as { status?: number; stdout?: string; stderr?: string; message?: string };

      if (execError.stderr?.includes("Permission denied")) {
        violations.push({
          type: "path",
          message: "Sandbox denied access to resource",
          timestamp: Date.now(),
          details: { stderr: execError.stderr },
        });
      }

      return {
        success: false,
        exitCode: execError.status || 1,
        stdout: execError.stdout || "",
        stderr: execError.stderr || execError.message || "",
        violations,
        duration: Date.now() - startTime,
      };
    }
  }
}

export class SandboxExecAdapter implements SandboxAdapter {
  getBackend(): SandboxBackend {
    return "sandbox-exec";
  }

  isAvailable(): boolean {
    if (process.platform !== "darwin") {
      return false;
    }

    try {
      const { execSync } = require("child_process");
      execSync("which sandbox-exec", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async execute(command: string, config: SandboxConfig): Promise<SandboxResult> {
    const profile = this.generateProfile(config);
    const fullCommand = `sandbox-exec -f ${JSON.stringify(profile)} /bin/sh -c ${JSON.stringify(command)}`;

    return this.runCommand(fullCommand);
  }

  private generateProfile(config: SandboxConfig): string {
    const rules: string[] = [
      "(version 1)",
      "(allow default)",
    ];

    for (const path of config.allowedPaths) {
      rules.push(`(allow file-read* (literal "${path}"))`);
    }

    for (const path of config.deniedPaths) {
      rules.push(`(deny file-read* (literal "${path}"))`);
    }

    if (config.readOnlyFs) {
      rules.push("(deny file-write*)");
    }

    if (config.allowedNetworks.length === 0) {
      rules.push("(deny network*)");
    }

    return rules.join("\\n");
  }

  private async runCommand(command: string): Promise<SandboxResult> {
    const { execSync } = require("child_process");
    const startTime = Date.now();
    const violations: SandboxViolation[] = [];

    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout: 30000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return {
        success: true,
        exitCode: 0,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        violations,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const execError = error as { status?: number; stdout?: string; stderr?: string; message?: string };

      return {
        success: false,
        exitCode: execError.status || 1,
        stdout: execError.stdout || "",
        stderr: execError.stderr || execError.message || "",
        violations,
        duration: Date.now() - startTime,
      };
    }
  }
}

export class NoSandboxAdapter implements SandboxAdapter {
  getBackend(): SandboxBackend {
    return "none";
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(command: string, _config: SandboxConfig): Promise<SandboxResult> {
    const { execSync } = require("child_process");
    const startTime = Date.now();

    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout: 30000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return {
        success: true,
        exitCode: 0,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        violations: [],
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const execError = error as { status?: number; stdout?: string; stderr?: string; message?: string };

      return {
        success: false,
        exitCode: execError.status || 1,
        stdout: execError.stdout || "",
        stderr: execError.stderr || execError.message || "",
        violations: [],
        duration: Date.now() - startTime,
      };
    }
  }
}

export function createSandboxAdapter(): SandboxAdapter {
  const platform = process.platform;
  const backend = PLATFORM_SANDBOX_BACKENDS[platform] || "none";

  switch (backend) {
    case "bubblewrap":
      const bubblewrap = new BubblewrapAdapter();
      if (bubblewrap.isAvailable()) {
        return bubblewrap;
      }
      break;

    case "sandbox-exec":
      const sandboxExec = new SandboxExecAdapter();
      if (sandboxExec.isAvailable()) {
        return sandboxExec;
      }
      break;
  }

  console.warn(`No sandbox backend available for platform ${platform}, using no-sandbox mode`);
  return new NoSandboxAdapter();
}

export function getDefaultSandboxConfig(): SandboxConfig {
  return {
    enabled: false,
    backend: PLATFORM_SANDBOX_BACKENDS[process.platform] || "none",
    allowedPaths: [process.cwd()],
    deniedPaths: [
      "/.git/",
      "/.ssh/",
      "/.aws/",
      "/etc/passwd",
      "/etc/shadow",
      "/proc/",
      "/sys/",
    ],
    allowedNetworks: [],
    deniedNetworks: [],
    readOnlyFs: false,
    noNewPrivs: true,
  };
}