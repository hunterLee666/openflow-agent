import { stat, realpath } from "node:fs/promises";
import { join, resolve, normalize, isAbsolute } from "node:path";

export interface SecurityPolicy {
  allowedPaths: string[];
  blockedPaths: string[];
  blockedCommands: string[];
  allowedCommands: string[];
  maxFileSize: number;
  maxDirectoryDepth: number;
  maxEntriesPerDirectory: number;
  allowSymlinks: boolean;
  allowHiddenFiles: boolean;
  allowNetworkAccess: boolean;
  allowElevatedExec: boolean;
  requirePathValidation: boolean;
  requireCommandValidation: boolean;
}

export interface SecurityViolation {
  type: "path" | "command" | "file" | "symlink" | "network" | "elevated";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  blocked: boolean;
}

export interface ValidationResult {
  allowed: boolean;
  violations: SecurityViolation[];
}

const DEFAULT_BLOCKED_PATHS = [
  "/etc/passwd",
  "/etc/shadow",
  "/etc/sudoers",
  "/root/.ssh",
  "/var/log",
  "/proc",
  "/sys",
  "/dev",
];

const DEFAULT_BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=/dev/zero",
  "chmod 777",
  "chown -R",
  "sudo",
  "su ",
  "curl",
  "wget",
  "nc ",
  "netcat",
  "ssh ",
  "scp ",
  "eval",
  "exec(",
  "base64 -d",
  "openssl",
];

const DEFAULT_POLICY: SecurityPolicy = {
  allowedPaths: [],
  blockedPaths: DEFAULT_BLOCKED_PATHS,
  blockedCommands: DEFAULT_BLOCKED_COMMANDS,
  allowedCommands: ["ls", "cat", "head", "tail", "grep", "find", "git", "uname", "node", "npm", "python", "python3"],
  maxFileSize: 10 * 1024 * 1024,
  maxDirectoryDepth: 5,
  maxEntriesPerDirectory: 100,
  allowSymlinks: false,
  allowHiddenFiles: false,
  allowNetworkAccess: false,
  allowElevatedExec: false,
  requirePathValidation: true,
  requireCommandValidation: true,
};

export class ExplorationSecurity {
  private policy: SecurityPolicy;
  private workspaceRoot: string;
  private violationLog: SecurityViolation[];

  constructor(workspaceRoot: string, policy?: Partial<SecurityPolicy>) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.violationLog = [];
  }

  async validatePath(path: string): Promise<ValidationResult> {
    const violations: SecurityViolation[] = [];

    if (!this.policy.requirePathValidation) {
      return { allowed: true, violations: [] };
    }

    const normalizedPath = normalize(path);
    const resolvedPath = isAbsolute(normalizedPath) ? normalizedPath : join(this.workspaceRoot, normalizedPath);

    const isBlocked = this.isPathBlocked(resolvedPath);
    if (isBlocked) {
      violations.push({
        type: "path",
        severity: "critical",
        message: `路径被阻止: ${resolvedPath}`,
        blocked: true,
      });
    }

    const isOutsideWorkspace = !resolvedPath.startsWith(this.workspaceRoot);
    if (isOutsideWorkspace && this.policy.allowedPaths.length === 0) {
      violations.push({
        type: "path",
        severity: "high",
        message: `路径在工作区外: ${resolvedPath}`,
        blocked: true,
      });
    }

    const isAllowed = this.isPathAllowed(resolvedPath);
    if (!isAllowed && this.policy.allowedPaths.length > 0) {
      violations.push({
        type: "path",
        severity: "medium",
        message: `路径不在允许列表中: ${resolvedPath}`,
        blocked: true,
      });
    }

    if (!this.policy.allowHiddenFiles) {
      const basename = resolvedPath.split("/").pop() || "";
      if (basename.startsWith(".") && basename !== "." && basename !== "..") {
        violations.push({
          type: "path",
          severity: "low",
          message: `隐藏文件被阻止: ${basename}`,
          blocked: true,
        });
      }
    }

    try {
      const fileStat = await stat(resolvedPath);
      if (fileStat.size > this.policy.maxFileSize) {
        violations.push({
          type: "file",
          severity: "medium",
          message: `文件过大: ${fileStat.size} bytes (限制: ${this.policy.maxFileSize})`,
          blocked: true,
        });
      }
    } catch {
      // File doesn't exist or not accessible
    }

    if (!this.policy.allowSymlinks) {
      try {
        const realPath = await realpath(resolvedPath);
        if (realPath !== resolvedPath) {
          violations.push({
            type: "symlink",
            severity: "high",
            message: `符号链接被阻止: ${resolvedPath} -> ${realPath}`,
            blocked: true,
          });
        }
      } catch {
        // Not a symlink or doesn't exist
      }
    }

    const result: ValidationResult = {
      allowed: violations.length === 0,
      violations,
    };

    if (violations.length > 0) {
      this.violationLog.push(...violations);
    }

    return result;
  }

  validateCommand(command: string): ValidationResult {
    const violations: SecurityViolation[] = [];

    if (!this.policy.requireCommandValidation) {
      return { allowed: true, violations: [] };
    }

    const trimmedCommand = command.trim().toLowerCase();

    for (const blocked of this.policy.blockedCommands) {
      if (trimmedCommand.includes(blocked.toLowerCase())) {
        violations.push({
          type: "command",
          severity: "critical",
          message: `命令被阻止: ${command} (包含: ${blocked})`,
          blocked: true,
        });
      }
    }

    if (!this.policy.allowElevatedExec) {
      if (trimmedCommand.startsWith("sudo") || trimmedCommand.startsWith("su ")) {
        violations.push({
          type: "elevated",
          severity: "critical",
          message: `提权命令被阻止: ${command}`,
          blocked: true,
        });
      }
    }

    if (!this.policy.allowNetworkAccess) {
      const networkCommands = ["curl", "wget", "nc ", "netcat", "ssh ", "scp ", "ftp"];
      for (const netCmd of networkCommands) {
        if (trimmedCommand.includes(netCmd)) {
          violations.push({
            type: "network",
            severity: "high",
            message: `网络访问被阻止: ${command}`,
            blocked: true,
          });
        }
      }
    }

    const baseCommand = trimmedCommand.split(" ")[0];
    if (this.policy.allowedCommands.length > 0) {
      const isAllowed = this.policy.allowedCommands.some(
        (allowed) => baseCommand === allowed || baseCommand.endsWith("/" + allowed)
      );
      if (!isAllowed) {
        violations.push({
          type: "command",
          severity: "medium",
          message: `命令不在允许列表中: ${command}`,
          blocked: true,
        });
      }
    }

    const result: ValidationResult = {
      allowed: violations.length === 0,
      violations,
    };

    if (violations.length > 0) {
      this.violationLog.push(...violations);
    }

    return result;
  }

  validateDirectoryDepth(depth: number): ValidationResult {
    const violations: SecurityViolation[] = [];

    if (depth > this.policy.maxDirectoryDepth) {
      violations.push({
        type: "path",
        severity: "medium",
        message: `目录深度超过限制: ${depth} > ${this.policy.maxDirectoryDepth}`,
        blocked: true,
      });
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  validateEntryCount(count: number): ValidationResult {
    const violations: SecurityViolation[] = [];

    if (count > this.policy.maxEntriesPerDirectory) {
      violations.push({
        type: "path",
        severity: "low",
        message: `目录条目数超过限制: ${count} > ${this.policy.maxEntriesPerDirectory}`,
        blocked: false,
      });
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  getViolationLog(): SecurityViolation[] {
    return [...this.violationLog];
  }

  clearViolationLog(): void {
    this.violationLog = [];
  }

  updatePolicy(updates: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...updates };
  }

  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }

  private isPathBlocked(path: string): boolean {
    return this.policy.blockedPaths.some((blocked) => path.startsWith(blocked));
  }

  private isPathAllowed(path: string): boolean {
    if (this.policy.allowedPaths.length === 0) {
      return true;
    }
    return this.policy.allowedPaths.some((allowed) => path.startsWith(allowed));
  }
}

export function createExplorationSecurity(workspaceRoot: string, policy?: Partial<SecurityPolicy>): ExplorationSecurity {
  return new ExplorationSecurity(workspaceRoot, policy);
}
