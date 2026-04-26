import { spawn, ChildProcess } from "node:child_process";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdtemp, access, constants } from "node:fs/promises";
import { z } from "zod";

export const SandboxProfileSchema = z.object({
  allowedPaths: z.array(z.string()),
  readOnlyPaths: z.array(z.string()),
  deniedPaths: z.array(z.string()),
  allowNetwork: z.boolean(),
  allowedCommands: z.array(z.string()).optional(),
});

export type SandboxProfile = z.infer<typeof SandboxProfileSchema>;

export const SandboxResultSchema = z.object({
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  error: z.string().optional(),
});

export type SandboxResult = z.infer<typeof SandboxResultSchema>;

export const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  profile: SandboxProfileSchema,
  platform: z.enum(["macos", "linux"]).optional(),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

const DEFAULT_SANDBOX_PROFILE: SandboxProfile = {
  allowedPaths: [],
  readOnlyPaths: ["/usr/bin", "/usr/lib", "/bin", "/lib"],
  deniedPaths: ["/etc/shadow", "/etc/passwd", "/root", "/var/log"],
  allowNetwork: false,
};

export class SandboxExecutor {
  private config: SandboxConfig;
  private tempDir?: string;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      enabled: config?.enabled ?? false,
      profile: {
        ...DEFAULT_SANDBOX_PROFILE,
        ...config?.profile,
      },
      platform: config?.platform ?? (platform() === "darwin" ? "macos" : "linux"),
    };
  }

  async initialize(): Promise<void> {
    if (this.config.enabled) {
      this.tempDir = await mkdtemp(join(tmpdir(), "openflow-sandbox-"));
    }
  }

  async executeInSandbox(
    command: string,
    cwd?: string
  ): Promise<SandboxResult> {
    if (!this.config.enabled) {
      return this.executeNative(command, cwd);
    }

    try {
      if (this.config.platform === "macos") {
        return this.executeWithSeatbelt(command, cwd);
      } else {
        return this.executeWithBubblewrap(command, cwd);
      }
    } catch (error) {
      return {
        success: false,
        stdout: "",
        stderr: "",
        exitCode: -1,
        error: `沙箱执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  private async executeWithSeatbelt(
    command: string,
    cwd?: string
  ): Promise<SandboxResult> {
    const profile = this.generateSeatbeltProfile();
    const profilePath = join(this.tempDir || tmpdir(), `sandbox-${Date.now()}.sb`);

    const { writeFile } = await import("node:fs/promises");
    await writeFile(profilePath, profile);

    return new Promise((resolve) => {
      const args = [
        "-f", profilePath,
        "--",
        "bash", "-c", command,
      ];

      const child = spawn("sandbox-exec", args, {
        cwd: cwd || this.config.profile.allowedPaths[0] || process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000,
      });

      this.handleProcessOutput(child, resolve);
    });
  }

  private async executeWithBubblewrap(
    command: string,
    cwd?: string
  ): Promise<SandboxResult> {
    const projectDir = cwd || this.config.profile.allowedPaths[0] || process.cwd();

    const args = [
      "--ro-bind", "/", "/",
      "--bind", projectDir, projectDir,
      "--chdir", projectDir,
      "--unshare-pid",
      "--proc", "/proc",
      "--dev", "/dev",
      "--die-with-parent",
    ];

    if (!this.config.profile.allowNetwork) {
      args.push("--unshare-net");
    }

    for (const deniedPath of this.config.profile.deniedPaths) {
      try {
        await access(deniedPath, constants.F_OK);
        args.push("--tmpfs", deniedPath);
      } catch {
        // Path doesn't exist, skip
      }
    }

    args.push("--");
    args.push("bash", "-c", command);

    return new Promise((resolve) => {
      const child = spawn("bwrap", args, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000,
      });

      this.handleProcessOutput(child, resolve);
    });
  }

  private executeNative(command: string, cwd?: string): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const child = spawn(command, [], {
        shell: true,
        cwd: cwd || process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000,
      });

      this.handleProcessOutput(child, resolve);
    });
  }

  private handleProcessOutput(
    child: ChildProcess,
    resolve: (result: SandboxResult) => void
  ): void {
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        stdout,
        stderr,
        exitCode: -1,
        error: err.message,
      });
    });
  }

  private generateSeatbeltProfile(): string {
    const allowedPaths = this.config.profile.allowedPaths;
    const readOnlyPaths = this.config.profile.readOnlyPaths;
    const deniedPaths = this.config.profile.deniedPaths;

    let profile = `(version 1)\n\n`;

    profile += `(deny default)\n\n`;

    profile += `(allow process-exec)\n`;
    profile += `(allow file-read-metadata)\n`;

    for (const path of allowedPaths) {
      profile += `(allow file-read-data (subpath "${path}"))\n`;
      profile += `(allow file-write-data (subpath "${path}"))\n`;
    }

    for (const path of readOnlyPaths) {
      profile += `(allow file-read-data (subpath "${path}"))\n`;
    }

    for (const path of deniedPaths) {
      profile += `(deny file-read-data (subpath "${path}"))\n`;
      profile += `(deny file-write-data (subpath "${path}"))\n`;
    }

    if (this.config.profile.allowNetwork) {
      profile += `\n(allow network-outbound)\n`;
    } else {
      profile += `\n(deny network-outbound)\n`;
    }

    return profile;
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      const { rm } = await import("node:fs/promises");
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getProfile(): SandboxProfile {
    return { ...this.config.profile };
  }
}

export function createSandboxExecutor(config?: Partial<SandboxConfig>): SandboxExecutor {
  return new SandboxExecutor(config);
}

export function createDefaultSandboxProfile(projectRoot: string): SandboxProfile {
  return {
    allowedPaths: [projectRoot],
    readOnlyPaths: ["/usr/bin", "/usr/lib", "/bin", "/lib", "/usr/share"],
    deniedPaths: [
      "/etc/shadow",
      "/etc/passwd",
      "/root",
      "/var/log",
      "/tmp",
    ],
    allowNetwork: false,
  };
}
