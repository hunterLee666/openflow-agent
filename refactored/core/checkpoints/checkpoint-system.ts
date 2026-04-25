import { readFile, writeFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { createHash } from "node:crypto";

export interface FileSnapshot {
  filePath: string;
  content: string;
  hash: string;
  timestamp: number;
  size: number;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  timestamp: number;
  label?: string;
  snapshots: FileSnapshot[];
  metadata: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  restored: string[];
  failed: string[];
  errors: string[];
}

export interface CheckpointConfig {
  maxCheckpoints: number;
  maxAge: number;
  includePatterns: string[];
  excludePatterns: string[];
}

const DEFAULT_CONFIG: CheckpointConfig = {
  maxCheckpoints: 50,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  includePatterns: ["**/*.ts", "**/*.js", "**/*.py", "**/*.md", "**/*.json", "**/*.tsx", "**/*.jsx"],
  excludePatterns: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
};

export class CheckpointSystem {
  private checkpointDir: string;
  private config: CheckpointConfig;
  private currentCheckpointId: string | null = null;

  constructor(baseDir: string, config?: Partial<CheckpointConfig>) {
    this.checkpointDir = join(baseDir, ".openflow", "checkpoints");
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await mkdir(this.checkpointDir, { recursive: true });
  }

  async createCheckpoint(
    sessionId: string,
    filePaths: string[],
    label?: string,
    metadata?: Record<string, unknown>
  ): Promise<Checkpoint> {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const snapshots: FileSnapshot[] = [];

    for (const filePath of filePaths) {
      if (this.shouldExclude(filePath)) continue;

      try {
        const content = await readFile(filePath, "utf-8");
        const hash = this.computeHash(content);
        const fileStat = await stat(filePath);

        snapshots.push({
          filePath: resolve(filePath),
          content,
          hash,
          timestamp: Date.now(),
          size: fileStat.size,
        });
      } catch {
        // Skip files that can't be read
      }
    }

    const checkpoint: Checkpoint = {
      id,
      sessionId,
      timestamp: Date.now(),
      label,
      snapshots,
      metadata: metadata || {},
    };

    const checkpointPath = join(this.checkpointDir, `${id}.json`);
    await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

    this.currentCheckpointId = id;

    await this.cleanupOldCheckpoints();

    return checkpoint;
  }

  async createSnapshotBeforeWrite(filePath: string): Promise<FileSnapshot | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      const hash = this.computeHash(content);
      const fileStat = await stat(filePath);

      const snapshot: FileSnapshot = {
        filePath: resolve(filePath),
        content,
        hash,
        timestamp: Date.now(),
        size: fileStat.size,
      };

      const snapshotDir = join(this.checkpointDir, "pending");
      await mkdir(snapshotDir, { recursive: true });

      const snapshotPath = join(snapshotDir, `${this.computeHash(filePath)}.snap`);
      await writeFile(snapshotPath, JSON.stringify(snapshot));

      return snapshot;
    } catch {
      return null;
    }
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult> {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    if (!checkpoint) {
      return {
        success: false,
        restored: [],
        failed: [],
        errors: [`Checkpoint not found: ${checkpointId}`],
      };
    }

    const result: RollbackResult = {
      success: true,
      restored: [],
      failed: [],
      errors: [],
    };

    for (const snapshot of checkpoint.snapshots) {
      try {
        await writeFile(snapshot.filePath, snapshot.content);
        result.restored.push(snapshot.filePath);
      } catch (error) {
        result.failed.push(snapshot.filePath);
        result.errors.push(`Failed to restore ${snapshot.filePath}: ${(error as Error).message}`);
      }
    }

    if (result.failed.length > 0) {
      result.success = false;
    }

    return result;
  }

  async rollbackToLastCheckpoint(): Promise<RollbackResult | null> {
    if (!this.currentCheckpointId) {
      const checkpoints = await this.listCheckpoints();
      if (checkpoints.length === 0) return null;
      this.currentCheckpointId = checkpoints[0].id;
    }

    if (!this.currentCheckpointId) return null;

    return this.rollbackToCheckpoint(this.currentCheckpointId);
  }

  async listCheckpoints(sessionId?: string): Promise<Checkpoint[]> {
    const checkpoints: Checkpoint[] = [];

    try {
      const entries = await readdir(this.checkpointDir);

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;

        const checkpointPath = join(this.checkpointDir, entry);
        const checkpoint = await this.loadCheckpointFile(checkpointPath);

        if (checkpoint) {
          if (!sessionId || checkpoint.sessionId === sessionId) {
            checkpoints.push(checkpoint);
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
  }

  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const checkpointPath = join(this.checkpointDir, `${checkpointId}.json`);

    try {
      await unlink(checkpointPath);
      if (this.currentCheckpointId === checkpointId) {
        this.currentCheckpointId = null;
      }
      return true;
    } catch {
      return false;
    }
  }

  async getCheckpointDiff(checkpointId: string): Promise<Array<{ filePath: string; currentHash: string; snapshotHash: string; changed: boolean }>> {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    if (!checkpoint) return [];

    const diff: Array<{ filePath: string; currentHash: string; snapshotHash: string; changed: boolean }> = [];

    for (const snapshot of checkpoint.snapshots) {
      try {
        const currentContent = await readFile(snapshot.filePath, "utf-8");
        const currentHash = this.computeHash(currentContent);

        diff.push({
          filePath: snapshot.filePath,
          currentHash,
          snapshotHash: snapshot.hash,
          changed: currentHash !== snapshot.hash,
        });
      } catch {
        diff.push({
          filePath: snapshot.filePath,
          currentHash: "file_not_found",
          snapshotHash: snapshot.hash,
          changed: true,
        });
      }
    }

    return diff;
  }

  private async loadCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    const checkpointPath = join(this.checkpointDir, `${checkpointId}.json`);
    return this.loadCheckpointFile(checkpointPath);
  }

  private async loadCheckpointFile(checkpointPath: string): Promise<Checkpoint | null> {
    try {
      const content = await readFile(checkpointPath, "utf-8");
      return JSON.parse(content) as Checkpoint;
    } catch {
      return null;
    }
  }

  private async cleanupOldCheckpoints(): Promise<void> {
    const checkpoints = await this.listCheckpoints();

    const now = Date.now();
    const toDelete: string[] = [];

    if (checkpoints.length > this.config.maxCheckpoints) {
      for (const cp of checkpoints.slice(this.config.maxCheckpoints)) {
        toDelete.push(cp.id);
      }
    }

    for (const cp of checkpoints) {
      if (now - cp.timestamp > this.config.maxAge) {
        toDelete.push(cp.id);
      }
    }

    for (const id of toDelete) {
      await this.deleteCheckpoint(id);
    }
  }

  private shouldExclude(filePath: string): boolean {
    const resolved = resolve(filePath);

    for (const pattern of this.config.excludePatterns) {
      if (this.matchGlob(pattern, resolved)) {
        return true;
      }
    }

    if (this.config.includePatterns.length > 0) {
      let included = false;
      for (const pattern of this.config.includePatterns) {
        if (this.matchGlob(pattern, resolved)) {
          included = true;
          break;
        }
      }
      return !included;
    }

    return false;
  }

  private matchGlob(pattern: string, path: string): boolean {
    const regex = pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, ".");
    return new RegExp(`^${regex}$`).test(path);
  }

  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }
}

export function createCheckpointSystem(baseDir: string, config?: Partial<CheckpointConfig>): CheckpointSystem {
  const system = new CheckpointSystem(baseDir, config);
  return system;
}
