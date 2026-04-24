export interface SandboxProfile {
  name: string;
  readonlyDirs: string[];
  writableDirs: string[];
  allowedCommands: string[];
  blockedCommands: string[];
  networkAccess: boolean;
  maxFileSize: number;
  timeout: number;
}

export interface SandboxExecutor {
  execute(command: string[], profile: SandboxProfile): Promise<SandboxResult>;
  isAvailable(): boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export type SandboxType = "seatbelt" | "bubblewrap" | "none";
