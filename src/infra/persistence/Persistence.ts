import * as fs from 'node:fs/promises'
import * as fsp from 'node:fs'
import * as path from 'node:path'
import { homedir } from 'node:os'
import type { AppState } from '../state/appState'
import {
  createPersistedState,
  type PersistedState,
  type PersistableConfig,
  type PersistableSessionMeta,
  type PersistableUi,
  PERSIST_DEBOUNCE_MS,
} from './policy'
import { getMemdir } from '../memdir'
import { getHistory } from '../history'

export interface PersistenceConfig {
  root?: string
  configFileName?: string
}

const DEFAULT_CONFIG_FILE = 'settings.json'

export class Persistence {
  private root: string
  private configFileName: string
  private configPath: string
  private flushTimers = new Map<string, NodeJS.Timeout>()
  private pendingFlushes = new Map<string, () => Promise<void>>()
  private exitHandlersRegistered = false

  constructor(config: PersistenceConfig = {}) {
    this.root = config.root ?? path.join(homedir(), '.agent')
    this.configFileName = config.configFileName ?? DEFAULT_CONFIG_FILE
    this.configPath = path.join(this.root, this.configFileName)
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    await fs.mkdir(path.join(this.root, 'mem'), { recursive: true })
    await fs.mkdir(path.join(this.root, 'history'), { recursive: true })
    this.registerExitHandlers()
  }

  async loadPersistedState(): Promise<PersistedState | null> {
    try {
      const content = await fs.readFile(this.configPath, 'utf8')
      const data = JSON.parse(content)
      return data as PersistedState
    } catch {
      return null
    }
  }

  async savePersistedState(state: AppState): Promise<void> {
    const persisted = createPersistedState(state)
    await this.atomicWriteJson(this.configPath, persisted)
  }

  async saveConfig(config: PersistableConfig): Promise<void> {
    await this.atomicWriteJson(path.join(this.root, 'config.json'), config)
  }

  async loadConfig(): Promise<PersistableConfig | null> {
    try {
      const content = await fs.readFile(path.join(this.root, 'config.json'), 'utf8')
      return JSON.parse(content) as PersistableConfig
    } catch {
      return null
    }
  }

  async saveSessionMeta(session: PersistableSessionMeta, sessionId: string): Promise<void> {
    const sessionPath = path.join(this.root, 'sessions', `${sessionId}.json`)
    await fs.mkdir(path.dirname(sessionPath), { recursive: true })
    await this.atomicWriteJson(sessionPath, session)
  }

  async loadSessionMeta(sessionId: string): Promise<PersistableSessionMeta | null> {
    try {
      const content = await fs.readFile(
        path.join(this.root, 'sessions', `${sessionId}.json`),
        'utf8'
      )
      return JSON.parse(content) as PersistableSessionMeta
    } catch {
      return null
    }
  }

  async saveUi(ui: PersistableUi): Promise<void> {
    const memdir = getMemdir()
    await memdir.writeJsonAtomic('preferences/ui.json', ui)
  }

  async loadUi(): Promise<PersistableUi | null> {
    const memdir = getMemdir()
    return memdir.readJson<PersistableUi>('preferences/ui.json')
  }

  scheduleFlush(key: string, flushFn: () => Promise<void>, debounceMs: number = PERSIST_DEBOUNCE_MS): void {
    const existing = this.flushTimers.get(key)
    if (existing) {
      clearTimeout(existing)
    }

    this.pendingFlushes.set(key, flushFn)

    const timer = setTimeout(async () => {
      const fn = this.pendingFlushes.get(key)
      if (fn) {
        this.pendingFlushes.delete(key)
        this.flushTimers.delete(key)
        try {
          await fn()
        } catch (e) {
          console.error(`[persistence] Flush failed for ${key}:`, e)
        }
      }
    }, debounceMs)

    this.flushTimers.set(key, timer)
  }

  async flushAll(): Promise<void> {
    const flushes = Array.from(this.pendingFlushes.entries())
    this.pendingFlushes.clear()

    for (const [key, fn] of flushes) {
      const timer = this.flushTimers.get(key)
      if (timer) {
        clearTimeout(timer)
        this.flushTimers.delete(key)
      }
      try {
        await fn()
      } catch (e) {
        console.error(`[persistence] Flush failed for ${key}:`, e)
      }
    }
  }

  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, filePath)
  }

  private registerExitHandlers(): void {
    if (this.exitHandlersRegistered) return
    this.exitHandlersRegistered = true

    const flushAndExit = async () => {
      await this.flushAll()
      process.exit(0)
    }

    process.on('SIGINT', () => {
      void flushAndExit()
    })

    process.on('SIGTERM', () => {
      void flushAndExit()
    })

    process.on('beforeExit', () => {
      void this.flushAll()
    })
  }

  async exportAll(): Promise<{
    config: PersistableConfig | null
    ui: PersistableUi | null
    sessions: PersistableSessionMeta[]
  }> {
    const config = await this.loadConfig()
    const ui = await this.loadUi()
    const sessions: PersistableSessionMeta[] = []

    try {
      const sessionsDir = path.join(this.root, 'sessions')
      const files = await fs.readdir(sessionsDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(sessionsDir, file), 'utf8')
          sessions.push(JSON.parse(content))
        }
      }
    } catch {}

    return { config, ui, sessions }
  }

  async importAll(data: {
    config?: PersistableConfig
    ui?: PersistableUi
    sessions?: PersistableSessionMeta[]
  }): Promise<void> {
    if (data.config) {
      await this.saveConfig(data.config)
    }
    if (data.ui) {
      await this.saveUi(data.ui)
    }
    if (data.sessions) {
      for (const session of data.sessions) {
        await this.saveSessionMeta(session, session.sessionId)
      }
    }
  }

  getRoot(): string {
    return this.root
  }
}

let defaultPersistence: Persistence | null = null

export function getPersistence(): Persistence {
  if (!defaultPersistence) {
    defaultPersistence = new Persistence()
  }
  return defaultPersistence
}

export function setPersistence(persistence: Persistence): void {
  defaultPersistence = persistence
}

export function resetPersistence(): void {
  defaultPersistence = null
}

export function registerExitFlush(flush: () => Promise<void>): void {
  const run = async () => {
    try {
      await flush()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', run)
  process.on('SIGTERM', run)
}
