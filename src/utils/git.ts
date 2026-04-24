import { execFileNoThrow } from './exec.js';

export async function findGitRoot(cwd: string): Promise<string | null> {
  const { stdout, error } = await execFileNoThrow(
    'git',
    ['rev-parse', '--show-toplevel'],
    { cwd }
  );

  if (error || !stdout) {
    return null;
  }

  return stdout.trim();
}

export async function getBranch(cwd?: string): Promise<string | null> {
  const { stdout, error } = await execFileNoThrow(
    'git',
    ['branch', '--show-current'],
    { cwd }
  );

  if (error || !stdout) {
    return null;
  }

  return stdout.trim();
}

export async function getDefaultBranch(cwd?: string): Promise<string | null> {
  const { stdout, error } = await execFileNoThrow(
    'git',
    ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
    { cwd }
  );

  if (error || !stdout) {
    return 'main';
  }

  return stdout.trim().replace('origin/', '');
}
