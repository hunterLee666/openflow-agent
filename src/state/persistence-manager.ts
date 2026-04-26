import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, readFile, writeFile, rename, rm, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface PersistenceConfig {
  rootDir: string;
  settingsPath: string;
  memdirPath: string;
  historyPath: string;
  cachePath: string;
  logsPath: string;
}

export function getDefaultPersistenceConfig(): PersistenceConfig {
  const root = join(homedir(), ".openflow");
  return {
    rootDir: root,
    settingsPath: join(root, "settings.json"),
    memdirPath: join(root, "mem"),
    historyPath: join(root, "history"),
    cachePath: join(root, "cache"),
    logsPath: join(root, "logs"),
  };
}

export async function ensurePersistenceDirs(config: PersistenceConfig): Promise<void> {
  await mkdir(config.rootDir, { recursive: true, mode: 0o700 });
  await mkdir(config.memdirPath, { recursive: true, mode: 0o700 });
  await mkdir(config.historyPath, { recursive: true, mode: 0o700 });
  await mkdir(config.cachePath, { recursive: true });
  await mkdir(config.logsPath, { recursive: true, mode: 0o700 });
}

export async function atomicWriteSettings(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, filePath);
  await chmod(filePath, 0o600);
}

export async function loadSettings(filePath: string): Promise<Record<string, unknown> | null> {
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function registerExitFlush(flush: () => Promise<void>): void {
  const run = () => {
    void flush().finally(() => process.exit(0));
  };
  process.on("SIGINT", run);
  process.on("SIGTERM", run);

  process.on("uncaughtException", (err) => {
    void flush().finally(() => {
      console.error("Uncaught exception:", err);
      process.exit(1);
    });
  });
}

export async function rotateLogs(logsDir: string, maxTotalBytes = 100 * 1024 * 1024): Promise<void> {
  const { readdir, stat: fsStat } = await import("node:fs/promises");

  if (!existsSync(logsDir)) return;

  const files = await readdir(logsDir);
  const fileStats = await Promise.all(
    files.map(async (f) => {
      const path = join(logsDir, f);
      const s = await fsStat(path);
      return { path, size: s.size, mtime: s.mtimeMs };
    })
  );

  let totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);

  if (totalSize > maxTotalBytes) {
    const sorted = fileStats.sort((a, b) => a.mtime - b.mtime);

    for (const f of sorted) {
      await rm(f.path, { force: true });
      totalSize -= f.size;
      if (totalSize <= maxTotalBytes) break;
    }
  }
}

export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}
