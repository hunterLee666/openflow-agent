export interface ToolSchema {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface ToolRegistration {
  name: string
  kind: 'builtin' | 'mcp' | 'plugin'
  loader?: () => Promise<ToolSchema>
  schema?: ToolSchema
  loaded: boolean
  loading: boolean
  error?: string
  priority: number
  dependencies?: string[]
}

export interface DeferredToolRegistryOptions {
  maxCacheSize?: number
  preloadStrategy?: 'none' | 'critical' | 'all'
  cacheTtlMs?: number
}

export interface CacheEntry<T> {
  value: T
  fetchedAt: number
  etag?: string
}

const DEFAULT_CACHE_TTL_MS = 300000

export class DeferredToolRegistry {
  private tools: Map<string, ToolRegistration> = new Map()
  private cache: Map<string, CacheEntry<ToolSchema>> = new Map()
  private inflight: Map<string, Promise<ToolSchema>> = new Map()
  private options: DeferredToolRegistryOptions

  constructor(options?: DeferredToolRegistryOptions) {
    this.options = {
      maxCacheSize: 100,
      preloadStrategy: 'critical',
      cacheTtlMs: DEFAULT_CACHE_TTL_MS,
      ...options,
    }
  }

  registerStub(
    name: string,
    kind: 'builtin' | 'mcp' | 'plugin',
    loader?: () => Promise<ToolSchema>,
    options?: { priority?: number; dependencies?: string[] },
  ): void {
    this.tools.set(name, {
      name,
      kind,
      loader,
      loaded: false,
      loading: false,
      priority: options?.priority || 50,
      dependencies: options?.dependencies,
    })
  }

  registerBuiltin(name: string, loader?: () => Promise<ToolSchema>): void {
    this.registerStub(name, 'builtin', loader, { priority: 100 })
  }

  registerMcp(
    serverId: string,
    toolName: string,
    loader: () => Promise<ToolSchema>,
  ): void {
    const fullName = `mcp__${serverId}__${toolName}`
    this.registerStub(fullName, 'mcp', loader, { priority: 30 })
  }

  registerPlugin(
    pluginName: string,
    toolName: string,
    loader: () => Promise<ToolSchema>,
  ): void {
    const fullName = `plugin__${pluginName}__${toolName}`
    this.registerStub(fullName, 'plugin', loader, { priority: 40 })
  }

  async ensureHydrated(name: string): Promise<ToolSchema> {
    const registration = this.tools.get(name)
    if (!registration) {
      throw new Error(`Tool not found: ${name}`)
    }

    if (registration.schema) {
      return registration.schema
    }

    const inflight = this.inflight.get(name)
    if (inflight) {
      return inflight
    }

    if (!registration.loader) {
      throw new Error(`No loader for tool: ${name}`)
    }

    const promise = this.loadWithDependencies(registration)
    this.inflight.set(name, promise)

    try {
      const schema = await promise
      registration.schema = schema
      registration.loaded = true
      registration.loading = false
      return schema
    } catch (error) {
      registration.error = error instanceof Error ? error.message : String(error)
      registration.loading = false
      throw error
    } finally {
      this.inflight.delete(name)
    }
  }

  private async loadWithDependencies(registration: ToolRegistration): Promise<ToolSchema> {
    if (registration.dependencies && registration.dependencies.length > 0) {
      await Promise.all(
        registration.dependencies.map((dep) => this.ensureHydrated(dep)),
      )
    }

    registration.loading = true
    return registration.loader!()
  }

  async ensureHydratedCoalesced(name: string): Promise<ToolSchema> {
    const inflight = this.inflight.get(name)
    if (inflight) return inflight

    return this.ensureHydrated(name)
  }

  async preloadCritical(): Promise<void> {
    const critical = Array.from(this.tools.values())
      .filter((t) => t.priority >= 80)
      .sort((a, b) => b.priority - a.priority)

    await Promise.all(critical.map((t) => this.ensureHydrated(t.name)))
  }

  async preloadAll(): Promise<void> {
    const all = Array.from(this.tools.values())
      .filter((t) => t.loader)
      .sort((a, b) => b.priority - a.priority)

    for (const tool of all) {
      try {
        await this.ensureHydrated(tool.name)
      } catch (error) {
        console.error(`[DeferredToolRegistry] Failed to preload ${tool.name}:`, error)
      }
    }
  }

  getSchema(name: string): ToolSchema | undefined {
    return this.tools.get(name)?.schema
  }

  isLoaded(name: string): boolean {
    const reg = this.tools.get(name)
    return reg?.loaded ?? false
  }

  isLoading(name: string): boolean {
    const reg = this.tools.get(name)
    return reg?.loading ?? false
  }

  getError(name: string): string | undefined {
    return this.tools.get(name)?.error
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  getLoadedTools(): ToolSchema[] {
    return Array.from(this.tools.values())
      .filter((t) => t.schema)
      .map((t) => t.schema!)
  }

  getStubInfo(name: string): Omit<ToolRegistration, 'loader'> | undefined {
    const reg = this.tools.get(name)
    if (!reg) return undefined
    return {
      name: reg.name,
      kind: reg.kind,
      schema: reg.schema,
      loaded: reg.loaded,
      loading: reg.loading,
      error: reg.error,
      priority: reg.priority,
      dependencies: reg.dependencies,
    }
  }

  invalidate(name: string): void {
    const reg = this.tools.get(name)
    if (reg) {
      reg.schema = undefined
      reg.loaded = false
      reg.error = undefined
    }
    this.cache.delete(name)
  }

  invalidateByKind(kind: 'builtin' | 'mcp' | 'plugin'): void {
    for (const [name, reg] of this.tools) {
      if (reg.kind === kind) {
        this.invalidate(name)
      }
    }
  }

  invalidateAll(): void {
    for (const name of this.tools.keys()) {
      this.invalidate(name)
    }
  }

  unregister(name: string): boolean {
    this.cache.delete(name)
    return this.tools.delete(name)
  }

  clear(): void {
    this.tools.clear()
    this.cache.clear()
    this.inflight.clear()
  }

  getStats(): {
    total: number
    loaded: number
    loading: number
    errors: number
    byKind: Record<string, number>
  } {
    let loaded = 0
    let loading = 0
    let errors = 0
    const byKind: Record<string, number> = {}

    for (const reg of this.tools.values()) {
      if (reg.loaded) loaded++
      if (reg.loading) loading++
      if (reg.error) errors++
      byKind[reg.kind] = (byKind[reg.kind] || 0) + 1
    }

    return {
      total: this.tools.size,
      loaded,
      loading,
      errors,
      byKind,
    }
  }

  private getCacheKey(name: string): string {
    return `tool:${name}`
  }

  private getFromCache(key: string): CacheEntry<ToolSchema> | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const ttl = this.options.cacheTtlMs || DEFAULT_CACHE_TTL_MS
    if (Date.now() - entry.fetchedAt > ttl) {
      this.cache.delete(key)
      return undefined
    }

    return entry
  }

  private setCache(key: string, value: ToolSchema, etag?: string): void {
    if (this.cache.size >= (this.options.maxCacheSize || 100)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      fetchedAt: Date.now(),
      etag,
    })
  }
}

let registryInstance: DeferredToolRegistry | null = null

export function getDeferredToolRegistry(
  options?: DeferredToolRegistryOptions,
): DeferredToolRegistry {
  if (!registryInstance) {
    registryInstance = new DeferredToolRegistry(options)
  }
  return registryInstance
}

export function resetDeferredToolRegistry(): void {
  registryInstance?.clear()
  registryInstance = null
}

export async function hydrateTool(name: string): Promise<ToolSchema> {
  const registry = getDeferredToolRegistry()
  return registry.ensureHydrated(name)
}
