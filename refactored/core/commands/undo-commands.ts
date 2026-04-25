import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

export interface CheckpointInfo {
  id: string;
  timestamp: number;
  description: string;
  filesChanged: number;
  commitHash?: string;
}

export interface UndoResult {
  success: boolean;
  message: string;
  previousState?: string;
  currentState?: string;
}

const CHECKPOINT_DIR = ".openflow/checkpoints";

export async function createCheckpoint(
  workspaceRoot: string,
  description: string
): Promise<CheckpointInfo> {
  const checkpointDir = join(workspaceRoot, CHECKPOINT_DIR);
  await mkdir(checkpointDir, { recursive: true });

  const timestamp = Date.now();
  const id = `checkpoint-${timestamp}`;
  const checkpointPath = join(checkpointDir, id);
  await mkdir(checkpointPath, { recursive: true });

  let filesChanged = 0;
  let commitHash: string | undefined;

  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd: workspaceRoot });
    const changedFiles = stdout.split("\n").filter((line) => line.trim());
    filesChanged = changedFiles.length;

    if (changedFiles.length > 0) {
      await execAsync("git add -A", { cwd: workspaceRoot });
      const { stdout: hashOutput } = await execAsync(
        `git commit -m "OpenFlow checkpoint: ${description}"`,
        { cwd: workspaceRoot }
      );
      const match = hashOutput.match(/\[.*?(\w{7})\]/);
      commitHash = match?.[1];
    }
  } catch {
    // Not a git repo or no changes
  }

  const checkpoint: CheckpointInfo = {
    id,
    timestamp,
    description,
    filesChanged,
    commitHash,
  };

  await writeFile(
    join(checkpointPath, "metadata.json"),
    JSON.stringify(checkpoint, null, 2)
  );

  return checkpoint;
}

export async function listCheckpoints(workspaceRoot: string): Promise<CheckpointInfo[]> {
  const checkpointDir = join(workspaceRoot, CHECKPOINT_DIR);
  const checkpoints: CheckpointInfo[] = [];

  try {
    const entries = await readdir(checkpointDir);

    for (const entry of entries) {
      const metadataPath = join(checkpointDir, entry, "metadata.json");
      try {
        const content = await readFile(metadataPath, "utf-8");
        checkpoints.push(JSON.parse(content));
      } catch {
        // Skip invalid checkpoints
      }
    }
  } catch {
    // No checkpoints directory
  }

  return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
}

export async function undoToCheckpoint(
  workspaceRoot: string,
  checkpointId: string
): Promise<UndoResult> {
  const checkpointDir = join(workspaceRoot, CHECKPOINT_DIR);
  const checkpointPath = join(checkpointDir, checkpointId);

  try {
    const metadataPath = join(checkpointPath, "metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf-8")) as CheckpointInfo;

    if (metadata.commitHash) {
      await execAsync(`git reset --hard ${metadata.commitHash}`, { cwd: workspaceRoot });
      return {
        success: true,
        message: `Successfully restored to checkpoint: ${metadata.description}`,
        previousState: metadata.commitHash,
      };
    }

    return {
      success: false,
      message: "No commit hash found for this checkpoint",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to restore checkpoint: ${(error as Error).message}`,
    };
  }
}

export async function undoLastChange(workspaceRoot: string): Promise<UndoResult> {
  try {
    const { stdout: logOutput } = await execAsync("git log --oneline -1", {
      cwd: workspaceRoot,
    });

    if (!logOutput.trim()) {
      return {
        success: false,
        message: "No commits found to undo",
      };
    }

    const { stdout: previousHash } = await execAsync("git rev-parse HEAD~1", {
      cwd: workspaceRoot,
    });

    await execAsync("git reset --soft HEAD~1", { cwd: workspaceRoot });

    return {
      success: true,
      message: "Successfully undone last change",
      previousState: previousHash.trim(),
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to undo: ${(error as Error).message}`,
    };
  }
}

export async function getDiff(workspaceRoot: string, target?: string): Promise<string> {
  try {
    if (target) {
      const { stdout } = await execAsync(`git diff ${target}`, { cwd: workspaceRoot });
      return stdout || "No changes detected";
    }

    const { stdout } = await execAsync("git diff HEAD", { cwd: workspaceRoot });
    return stdout || "No changes detected";
  } catch {
    return "Unable to get diff. Make sure you're in a git repository.";
  }
}

export async function getStagedDiff(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git diff --cached", { cwd: workspaceRoot });
    return stdout || "No staged changes";
  } catch {
    return "Unable to get staged diff. Make sure you're in a git repository.";
  }
}

export function formatCheckpoints(checkpoints: CheckpointInfo[]): string {
  if (checkpoints.length === 0) {
    return "No checkpoints found.";
  }

  const lines = ["# Checkpoints", ""];

  for (const checkpoint of checkpoints) {
    const date = new Date(checkpoint.timestamp).toLocaleString();
    lines.push(`- **${checkpoint.id}**`);
    lines.push(`  - Time: ${date}`);
    lines.push(`  - Description: ${checkpoint.description}`);
    lines.push(`  - Files Changed: ${checkpoint.filesChanged}`);
    if (checkpoint.commitHash) {
      lines.push(`  - Commit: ${checkpoint.commitHash}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
