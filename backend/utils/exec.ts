import { execFile as execFileSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFileSync);

export interface ExecResult {
  stdout: string;
  stderr: string;
  error?: Error;
}

export async function execFileNoThrow(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd || process.cwd(),
      timeout: 30000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      error: err,
    };
  }
}
