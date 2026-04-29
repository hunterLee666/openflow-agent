export interface Migration {
  version: number
  description: string
  up: (raw: unknown) => unknown
}

export interface MigrationResult {
  value: unknown
  from: number
  to: number
  appliedMigrations: number[]
}

export type MigrationHook = (version: number, description: string) => void

export function runMigrations(
  raw: unknown,
  migrationsSorted: Migration[],
  targetVersion: number,
  hook?: MigrationHook
): MigrationResult {
  const obj =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>)

  let from = Number(obj.schemaVersion ?? 1)
  if (!Number.isFinite(from) || from < 1) {
    from = 1
  }

  const appliedMigrations: number[] = []
  let cur = obj

  for (const m of migrationsSorted) {
    if (m.version <= from) continue
    if (m.version > targetVersion) break

    try {
      cur = m.up(cur) as Record<string, unknown>
      cur.schemaVersion = m.version
      appliedMigrations.push(m.version)
      hook?.(m.version, m.description)
    } catch (e) {
      console.error(`[migration] Failed at version ${m.version}:`, e)
      throw new Error(`Migration failed at version ${m.version}: ${e}`)
    }
  }

  return {
    value: cur,
    from,
    to: targetVersion,
    appliedMigrations,
  }
}

export function createMigration(
  version: number,
  description: string,
  transform: (raw: Record<string, unknown>) => Record<string, unknown>
): Migration {
  return {
    version,
    description,
    up: (raw: unknown) => transform(raw as Record<string, unknown>),
  }
}

export function validateMigrationOrder(migrations: Migration[]): boolean {
  const versions = migrations.map((m) => m.version)
  const sorted = [...versions].sort((a, b) => a - b)
  return versions.every((v, i) => v === sorted[i])
}

export function getMissingMigrations(
  currentVersion: number,
  migrations: Migration[]
): Migration[] {
  return migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version)
}
