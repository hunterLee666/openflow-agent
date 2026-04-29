import * as fs from 'node:fs/promises'
import * as fsp from 'node:fs'
import * as path from 'node:path'
import { runMigrations, createMigration, type Migration, type MigrationHook } from './runner'
import type { ConfigSlice } from '../state/slices/configSlice'

export const CURRENT_SCHEMA_VERSION = 2

export const configMigrations: Migration[] = [
  createMigration(2, 'Add experimental flags structure', (raw) => {
    const flags = { ...raw }
    const experimental: Record<string, boolean> = {}

    for (const key of Object.keys(flags)) {
      if (key.startsWith('feat.')) {
        experimental[key.slice(5)] = Boolean(flags[key])
        delete flags[key]
      }
    }

    if (Object.keys(experimental).length > 0 || !flags.experimental) {
      flags.experimental = experimental
    }

    return flags
  }),
  createMigration(3, 'Rename approvalMode to approvalPolicy', (raw) => {
    const flags = { ...raw }
    if (typeof flags.approvalMode === 'string' && flags.approvalPolicy == null) {
      flags.approvalPolicy = flags.approvalMode
      delete flags.approvalMode
    }
    return flags
  }),
  createMigration(4, 'Add default provider field', (raw) => {
    const flags = { ...raw }
    if (flags.defaultProvider == null) {
      flags.defaultProvider = ''
    }
    return flags
  }),
]

export interface MigrationOptions {
  backup?: boolean
  hook?: MigrationHook
}

export async function migrateConfig(
  filePath: string,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
  options: MigrationOptions = {}
): Promise<{ config: Record<string, unknown>; migrated: boolean; fromVersion: number }> {
  let raw: Record<string, unknown>

  try {
    const content = await fs.readFile(filePath, 'utf8')
    raw = JSON.parse(content)
  } catch {
    raw = {}
  }

  const currentVersion = Number(raw.schemaVersion ?? 1)
  if (currentVersion >= targetVersion) {
    return { config: raw, migrated: false, fromVersion: currentVersion }
  }

  if (options.backup) {
    const backup = `${filePath}.bak.${Date.now()}`
    await fs.copyFile(filePath, backup)
  }

  const result = runMigrations(raw, configMigrations, targetVersion, options.hook)
  const migratedConfig = result.value as Record<string, unknown>

  await atomicWriteJson(filePath, migratedConfig)

  return {
    config: migratedConfig,
    migrated: true,
    fromVersion: result.from,
  }
}

export async function migrateConfigInPlace(
  config: Record<string, unknown>,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
  hook?: MigrationHook
): Promise<{ config: Record<string, unknown>; migrated: boolean; fromVersion: number }> {
  const currentVersion = Number(config.schemaVersion ?? 1)
  if (currentVersion >= targetVersion) {
    return { config, migrated: false, fromVersion: currentVersion }
  }

  const result = runMigrations(config, configMigrations, targetVersion, hook)
  return {
    config: result.value as Record<string, unknown>,
    migrated: true,
    fromVersion: result.from,
  }
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.tmp.${process.pid}`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

export function needsMigration(config: Record<string, unknown>): boolean {
  const currentVersion = Number(config.schemaVersion ?? 1)
  return currentVersion < CURRENT_SCHEMA_VERSION
}

export function getMigrationVersion(config: Record<string, unknown>): number {
  return Number(config.schemaVersion ?? 1)
}

export function validateConfigShape(config: unknown): config is Partial<ConfigSlice> {
  if (!config || typeof config !== 'object') return false
  const c = config as Record<string, unknown>
  
  if (c.schemaVersion !== undefined && typeof c.schemaVersion !== 'number') return false
  if (c.permissionMode !== undefined && typeof c.permissionMode !== 'string') return false
  if (c.approvalPolicy !== undefined && typeof c.approvalPolicy !== 'string') return false
  if (c.maxTurns !== undefined && typeof c.maxTurns !== 'number') return false
  if (c.maxTokens !== undefined && typeof c.maxTokens !== 'number') return false
  
  return true
}
