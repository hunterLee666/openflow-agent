import { CheckpointSystem } from "./checkpoint-system.js";

const DEFAULT_EXCLUDES = [
  "node_modules/",
  "dist/",
  "build/",
  ".env",
  ".env.*",
  ".env.*.local",
  "__pycache__/",
  "*.pyc",
  "*.pyo",
  ".DS_Store",
  "*.log",
  ".cache/",
  ".next/",
  ".nuxt/",
  "coverage/",
  ".pytest_cache/",
  ".venv/",
  "venv/",
  ".git/",
];

const MAX_FILES = 50_000;
const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CheckpointManagerConfig {
  enabled: boolean;
  maxCheckpoints: number;
  maxAgeMs: number;
  excludePatterns?: string[];
}

/**
 * CheckpointManager - 透明文件快照保护层
 *
 * 功能：自动为文件修改操作创建快照，防止意外损坏
 * 位置：~/.openflow/checkpoints/
 *
 * 使用方式：
 * 1. OpenFlowCore 自动调用 - LLM执行 Write/Edit/Bash 等工具前自动创建快照
 * 2. 手动调用 - newCheckpointTurn() 每轮开始时清空去重集合
 *
 * 特性：
 * - 每轮最多一次快照（同一目录）
 * - 自动清理：7天过期，最多50个快照
 * - 排除规则：node_modules, .git, dist, .env 等
 * - Git不可用时优雅降级
 */
export class CheckpointManager {
  private checkpointSystem: CheckpointSystem;
  private config: CheckpointManagerConfig;
  private checkpointedDirs: Set<string> = new Set();
  private gitAvailable: boolean | null = null;

  constructor(
    workspaceRoot: string,
    config?: Partial<CheckpointManagerConfig>
  ) {
    this.checkpointSystem = new CheckpointSystem(workspaceRoot, {
      maxCheckpoints: config?.maxCheckpoints ?? 50,
      maxAge: config?.maxAgeMs ?? PRUNE_AGE_MS,
      includePatterns: [],
      excludePatterns: config?.excludePatterns ?? DEFAULT_EXCLUDES,
    });
    this.config = {
      enabled: config?.enabled ?? true,
      maxCheckpoints: config?.maxCheckpoints ?? 50,
      maxAgeMs: config?.maxAgeMs ?? PRUNE_AGE_MS,
      excludePatterns: config?.excludePatterns ?? DEFAULT_EXCLUDES,
    };
  }

  async initialize(): Promise<void> {
    await this.checkpointSystem.initialize();
  }

  /**
   * 开始新的一轮对话 - 清空去重集合
   * 应在每轮LLM交互开始时调用
   */
  newTurn(): void {
    this.checkpointedDirs.clear();
  }

  /**
   * 确保目录已创建快照（如果尚未创建）
   * @param sessionId 会话ID
   * @param workingDir 工作目录
   * @param reason 创建原因
   * @returns 是否成功创建快照
   */
  async ensureCheckpoint(
    sessionId: string,
    workingDir: string,
    reason: string = "auto"
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const absDir = this.normalizePath(workingDir);

    if (this.isExcludedDirectory(absDir)) {
      return false;
    }

    if (this.checkpointedDirs.has(absDir)) {
      return false;
    }

    const fileCount = await this.countFiles(absDir);
    if (fileCount > MAX_FILES) {
      console.debug(`[CheckpointManager] Skipped: too many files (${fileCount})`);
      return false;
    }

    this.checkpointedDirs.add(absDir);

    try {
      await this.checkpointSystem.createCheckpoint(
        sessionId,
        [absDir],
        `Checkpoint: ${reason}`,
        { reason }
      );
      return true;
    } catch (error) {
      console.debug(`[CheckpointManager] Checkpoint failed: ${error}`);
      return false;
    }
  }

  async listCheckpoints(sessionId?: string): Promise<Array<{
    id: string;
    timestamp: number;
    label?: string;
    filesChanged: number;
  }>> {
    const checkpoints = await this.checkpointSystem.listCheckpoints(sessionId);
    return checkpoints.map((cp) => ({
      id: cp.id,
      timestamp: cp.timestamp,
      label: cp.label,
      filesChanged: cp.snapshots.length,
    }));
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<{
    success: boolean;
    restored: string[];
    failed: string[];
    errors: string[];
  }> {
    return this.checkpointSystem.rollbackToCheckpoint(checkpointId);
  }

  getCheckpointSystem(): CheckpointSystem {
    return this.checkpointSystem;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  private normalizePath(pathValue: string): string {
    const { resolve } = require("path");
    return resolve(pathValue);
  }

  private isExcludedDirectory(path: string): boolean {
    const excluded = ["/", require("os").homedir()];
    return excluded.includes(path);
  }

  private async countFiles(path: string): Promise<number> {
    const { stat } = require("fs/promises");
    const { readdir } = require("fs/promises");
    const { join } = require("path");
    let count = 0;

    try {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        count++;
        if (count > MAX_FILES) break;

        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const subCount = await this.countFiles(join(path, entry.name));
          count += subCount;
          if (count > MAX_FILES) break;
        }
      }
    } catch {
      // Ignore permission errors
    }

    return count;
  }
}

export function createCheckpointManager(
  workspaceRoot: string,
  config?: Partial<CheckpointManagerConfig>
): CheckpointManager {
  return new CheckpointManager(workspaceRoot, config);
}
