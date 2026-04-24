import { execFileNoThrow } from './exec.js';
import { findGitRoot } from './git.js';

const VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/;
const MAX_WORKTREE_SLUG_LENGTH = 64;

export interface WorktreeInfo {
  worktreePath: string;
  worktreeBranch: string;
  gitRoot: string;
  hookBased?: boolean;
}

export interface WorktreeConfig {
  basePath?: string;
  prefix?: string;
}

export class WorktreeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorktreeValidationError';
  }
}

export function validateWorktreeSlug(slug: string): void {
  if (slug.length > MAX_WORKTREE_SLUG_LENGTH) {
    throw new WorktreeValidationError(
      `Invalid worktree name: must be ${MAX_WORKTREE_SLUG_LENGTH} characters or fewer (got ${slug.length})`
    );
  }

  for (const segment of slug.split('/')) {
    if (segment === '.' || segment === '..') {
      throw new WorktreeValidationError(
        `Invalid worktree name "${slug}": must not contain "." or ".." path segments`
      );
    }
    if (!VALID_WORKTREE_SLUG_SEGMENT.test(segment)) {
      throw new WorktreeValidationError(
        `Invalid worktree name "${slug}": each "/"-separated segment must be non-empty and contain only letters, digits, dots, underscores, and dashes`
      );
    }
  }
}

export async function createWorktree(
  slug: string,
  cwd?: string
): Promise<WorktreeInfo> {
  validateWorktreeSlug(slug);

  const gitRoot = await findGitRoot(cwd || process.cwd());
  if (!gitRoot) {
    throw new WorktreeValidationError('Not in a git repository');
  }

  const worktreePath = `${gitRoot}/.claude/worktrees/${slug}`;
  const branchName = `worktree/${slug}`;

  const { error } = await execFileNoThrow(
    'git',
    ['worktree', 'add', '-b', branchName, worktreePath],
    { cwd: gitRoot }
  );

  if (error) {
    throw new WorktreeValidationError(`Failed to create worktree: ${error.message}`);
  }

  return {
    worktreePath,
    worktreeBranch: branchName,
    gitRoot,
  };
}

export async function removeWorktree(
  worktreePath: string,
  worktreeBranch?: string,
  gitRoot?: string
): Promise<void> {
  const root = gitRoot || await findGitRoot(process.cwd());
  if (!root) {
    throw new WorktreeValidationError('Not in a git repository');
  }

  await execFileNoThrow('git', ['worktree', 'remove', worktreePath, '--force'], {
    cwd: root,
  });

  if (worktreeBranch && worktreeBranch.startsWith('worktree/')) {
    await execFileNoThrow('git', ['branch', '-d', worktreeBranch], {
      cwd: root,
    }).catch(() => {});
  }
}

export async function listWorktrees(): Promise<WorktreeInfo[]> {
  const gitRoot = await findGitRoot(process.cwd());
  if (!gitRoot) {
    return [];
  }

  const { stdout } = await execFileNoThrow('git', ['worktree', 'list', '--porcelain'], {
    cwd: gitRoot,
  });

  if (!stdout) {
    return [];
  }

  const worktrees: WorktreeInfo[] = [];
  const entries = stdout.split('\n\n').filter(Boolean);

  for (const entry of entries) {
    const lines = entry.split('\n');
    let path = '';
    let branch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice(9);
      } else if (line.startsWith('branch ')) {
        branch = line.slice(7).replace(/^refs\/heads\//, '');
      }
    }

    if (path && path.includes('.claude/worktrees/')) {
      worktrees.push({
        worktreePath: path,
        worktreeBranch: branch,
        gitRoot,
      });
    }
  }

  return worktrees;
}

export async function getOrCreateWorktree(
  slug: string,
  cwd?: string
): Promise<WorktreeInfo> {
  const existing = await listWorktrees();
  const found = existing.find((w) => w.worktreePath.includes(`/${slug}`));

  if (found) {
    return found;
  }

  return createWorktree(slug, cwd);
}
