import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFile, writeFile, rename, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export type Migration = {
  version: number;
  description: string;
  up: (raw: unknown) => unknown;
};

export const CURRENT_SCHEMA_VERSION = 3;

export const migrations: Migration[] = [
  {
    version: 2,
    description: "rename approvalMode -> approvalPolicy",
    up: (raw) => {
      const o = raw as Record<string, unknown>;
      if (typeof o.approvalMode === "string" && o.approvalPolicy == null) {
        o.approvalPolicy = o.approvalMode;
        delete o.approvalMode;
      }
      return o;
    },
  },
  {
    version: 3,
    description: "nest experimental flags under experimental{}",
    up: (raw) => {
      const o = raw as Record<string, unknown>;
      const legacy = o.experimental;
      if (legacy != null && typeof legacy === "object") return o;
      const flags = { ...o } as Record<string, unknown>;
      const experimental: Record<string, boolean> = {};
      for (const k of Object.keys(flags)) {
        if (k.startsWith("feat.")) {
          experimental[k.slice(5)] = Boolean(flags[k]);
          delete flags[k];
        }
      }
      flags.experimental = experimental;
      return flags;
    },
  },
];

export function runMigrations(
  raw: unknown,
  migrationsSorted: Migration[],
  targetVersion: number
): { value: unknown; from: number; to: number } {
  const obj =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  let from = Number(obj.schemaVersion ?? 1);
  if (!Number.isFinite(from)) from = 1;

  let cur = obj;
  for (const m of migrationsSorted) {
    if (m.version <= from) continue;
    if (m.version > targetVersion) break;
    cur = m.up(cur) as Record<string, unknown>;
    cur.schemaVersion = m.version;
    from = m.version;
  }
  return { value: cur, from, to: from };
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, filePath);
}

export async function migrateWithBackup(
  filePath: string,
  targetVersion: number,
  migrationList: Migration[] = migrations
): Promise<void> {
  if (!existsSync(filePath)) return;

  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const currentVersion = Number((raw as Record<string, unknown>).schemaVersion ?? 1);
  if (currentVersion >= targetVersion) return;

  const backup = `${filePath}.bak.${Date.now()}`;
  await copyFile(filePath, backup);

  const { value } = runMigrations(raw, migrationList, targetVersion);
  await atomicWriteJson(filePath, value);
}

export async function loadAndMigrateConfig(
  filePath: string,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
  migrationList: Migration[] = migrations
): Promise<Record<string, unknown>> {
  if (!existsSync(filePath)) {
    return { schemaVersion: targetVersion };
  }

  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const currentVersion = Number((raw as Record<string, unknown>).schemaVersion ?? 1);

  if (currentVersion < targetVersion) {
    const backup = `${filePath}.bak.${Date.now()}`;
    await copyFile(filePath, backup);
  }

  const { value } = runMigrations(raw, migrationList, targetVersion);

  if (currentVersion < targetVersion) {
    await atomicWriteJson(filePath, value);
  }

  return value as Record<string, unknown>;
}

export function getDefaultConfigPath(): string {
  return join(homedir(), ".openflow", "settings.json");
}
