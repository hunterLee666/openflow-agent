import type { FlagMap, FlagValue } from './definitions'
import { DEFAULT_FLAGS, validateFlagValue, getFlagDefinition } from './definitions'

export interface FlagSource {
  name: string
  priority: number
  flags: FlagMap
  readonly?: boolean
}

export const SOURCE_PRIORITY = {
  DEFAULT: 0,
  REMOTE: 10,
  USER_SETTINGS: 20,
  ENVIRONMENT: 30,
  RUNTIME: 40,
} as const

export function mergeFlags(layers: FlagSource[]): FlagMap {
  const sorted = [...layers].sort((a, b) => a.priority - b.priority)
  const out: FlagMap = {}

  for (const layer of sorted) {
    for (const [k, v] of Object.entries(layer.flags)) {
      if (v === undefined) continue
      if (validateFlagValue(k, v)) {
        out[k] = v
      }
    }
  }

  return out
}

export function envOverridePrefix(prefix: string = 'AGENT_FLAG_'): FlagMap {
  const out: FlagMap = {}

  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith(prefix) || v == null) continue
    const name = k.slice(prefix.length).replace(/__/g, '.')
    out[name] = parseEnvValue(v)
  }

  return out
}

function parseEnvValue(v: string): FlagValue {
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

export class FeatureFlags {
  private sources: Map<string, FlagSource> = new Map()
  private effectiveFlags: FlagMap = {}
  private listeners: Set<(flags: FlagMap) => void> = new Set()
  private remoteCache: FlagMap = {}
  private remoteCacheTime: number = 0
  private remoteTtl: number = 300000

  constructor() {
    this.addSource({
      name: 'default',
      priority: SOURCE_PRIORITY.DEFAULT,
      flags: DEFAULT_FLAGS,
      readonly: true,
    })

    this.addSource({
      name: 'environment',
      priority: SOURCE_PRIORITY.ENVIRONMENT,
      flags: envOverridePrefix(),
      readonly: true,
    })

    this.recompute()
  }

  addSource(source: FlagSource): void {
    if (this.sources.has(source.name) && this.sources.get(source.name)?.readonly) {
      return
    }
    this.sources.set(source.name, source)
    this.recompute()
  }

  removeSource(name: string): void {
    if (this.sources.get(name)?.readonly) return
    this.sources.delete(name)
    this.recompute()
  }

  updateSource(name: string, flags: FlagMap): void {
    const existing = this.sources.get(name)
    if (!existing || existing.readonly) return
    this.sources.set(name, { ...existing, flags })
    this.recompute()
  }

  setRuntimeFlag(key: string, value: FlagValue): void {
    const runtimeSource = this.sources.get('runtime')
    if (runtimeSource) {
      runtimeSource.flags[key] = value
    } else {
      this.addSource({
        name: 'runtime',
        priority: SOURCE_PRIORITY.RUNTIME,
        flags: { [key]: value },
      })
    }
    this.recompute()
  }

  async fetchRemoteFlags(url: string, headers?: Record<string, string>): Promise<void> {
    try {
      const res = await fetch(url, {
        headers: {
          'cache-control': 'no-store',
          ...headers,
        },
      })

      if (!res.ok) {
        console.warn('[FeatureFlags] Remote fetch failed:', res.status)
        return
      }

      const flags = await res.json() as FlagMap
      this.remoteCache = flags
      this.remoteCacheTime = Date.now()

      this.addSource({
        name: 'remote',
        priority: SOURCE_PRIORITY.REMOTE,
        flags,
        readonly: true,
      })
    } catch (error) {
      console.warn('[FeatureFlags] Remote fetch error:', error)
    }
  }

  shouldRefreshRemote(): boolean {
    return Date.now() - this.remoteCacheTime > this.remoteTtl
  }

  get(key: string): FlagValue | undefined {
    return this.effectiveFlags[key]
  }

  getBoolean(key: string): boolean {
    const value = this.get(key)
    return typeof value === 'boolean' ? value : false
  }

  getNumber(key: string): number {
    const value = this.get(key)
    return typeof value === 'number' ? value : 0
  }

  getString(key: string): string {
    const value = this.get(key)
    return typeof value === 'string' ? value : ''
  }

  getAll(): FlagMap {
    return { ...this.effectiveFlags }
  }

  getSource(name: string): FlagSource | undefined {
    return this.sources.get(name)
  }

  getSourceForFlag(key: string): string | undefined {
    const sorted = Array.from(this.sources.values()).sort((a, b) => b.priority - a.priority)
    for (const source of sorted) {
      if (key in source.flags) {
        return source.name
      }
    }
    return undefined
  }

  isLocked(key: string): boolean {
    const sourceName = this.getSourceForFlag(key)
    if (!sourceName) return false
    return this.sources.get(sourceName)?.readonly === true
  }

  subscribe(listener: (flags: FlagMap) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private recompute(): void {
    this.effectiveFlags = mergeFlags(Array.from(this.sources.values()))
    this.notify()
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(this.effectiveFlags)
      } catch (error) {
        console.error('[FeatureFlags] Listener error:', error)
      }
    }
  }
}

let instance: FeatureFlags | null = null

export function getFeatureFlags(): FeatureFlags {
  if (!instance) {
    instance = new FeatureFlags()
  }
  return instance
}

export function resetFeatureFlags(): void {
  instance = null
}

export function isFeatureEnabled(key: string): boolean {
  return getFeatureFlags().getBoolean(key)
}

export function getFeatureValue(key: string): FlagValue | undefined {
  return getFeatureFlags().get(key)
}

export function getUserBucket(userId: string, percentage: number = 100): 'A' | 'B' {
  const hash = hashUserId(userId)
  const bucket = hash % 100
  return bucket < percentage ? 'B' : 'A'
}

function hashUserId(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export function isInExperiment(userId: string, experimentKey: string, percentage: number): boolean {
  const hash = hashUserId(userId + experimentKey)
  return (hash % 100) < percentage
}

export function getExperimentVariant<T>(userId: string, experimentKey: string, variants: T[], distribution: number[]): T {
  const hash = hashUserId(userId + experimentKey)
  const bucket = hash % 100

  let cumulative = 0
  for (let i = 0; i < distribution.length; i++) {
    cumulative += distribution[i]
    if (bucket < cumulative) {
      return variants[i]
    }
  }

  return variants[variants.length - 1]
}
