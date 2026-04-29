export interface MCPConnection {
  id: string
  name: string
  client: unknown
  close: () => Promise<void>
  lastUsed: number
  refCount: number
  status: 'connected' | 'disconnecting' | 'disconnected'
  connectTime: number
  totalRequests: number
}

export interface MCPIdleConfig {
  idleTimeoutMs: number
  checkIntervalMs: number
  maxConnections: number
  minKeepAlive: number
}

const DEFAULT_IDLE_CONFIG: MCPIdleConfig = {
  idleTimeoutMs: 60000,
  checkIntervalMs: 10000,
  maxConnections: 20,
  minKeepAlive: 2,
}

class MCPConnectionManager {
  private connections: Map<string, MCPConnection> = new Map()
  private config: MCPIdleConfig
  private checkInterval: NodeJS.Timeout | null = null
  private onDisconnect?: (id: string, name: string) => void

  constructor(config: Partial<MCPIdleConfig> = {}) {
    this.config = { ...DEFAULT_IDLE_CONFIG, ...config }
  }

  register(
    id: string,
    name: string,
    client: unknown,
    closeFn: () => Promise<void>,
  ): MCPConnection {
    const existing = this.connections.get(id)
    if (existing) {
      this.touch(id)
      return existing
    }

    if (this.connections.size >= this.config.maxConnections) {
      this.evictOldest()
    }

    const conn: MCPConnection = {
      id,
      name,
      client,
      close: closeFn,
      lastUsed: Date.now(),
      refCount: 0,
      status: 'connected',
      connectTime: Date.now(),
      totalRequests: 0,
    }

    this.connections.set(id, conn)
    return conn
  }

  touch(id: string): void {
    const conn = this.connections.get(id)
    if (conn) {
      conn.lastUsed = Date.now()
      conn.totalRequests++
    }
  }

  acquire(id: string): MCPConnection | undefined {
    const conn = this.connections.get(id)
    if (conn && conn.status === 'connected') {
      conn.refCount++
      conn.lastUsed = Date.now()
      return conn
    }
    return undefined
  }

  release(id: string): void {
    const conn = this.connections.get(id)
    if (conn && conn.refCount > 0) {
      conn.refCount--
    }
  }

  async disconnect(id: string): Promise<boolean> {
    const conn = this.connections.get(id)
    if (!conn || conn.status !== 'connected') {
      return false
    }

    if (conn.refCount > 0) {
      return false
    }

    try {
      conn.status = 'disconnecting'
      await conn.close()
      conn.status = 'disconnected'
      this.connections.delete(id)
      this.onDisconnect?.(id, conn.name)
      return true
    } catch (error) {
      console.error(`Failed to disconnect MCP ${id}:`, error)
      conn.status = 'disconnected'
      this.connections.delete(id)
      return false
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<boolean>[] = []

    for (const [id] of Array.from(this.connections)) {
      disconnectPromises.push(this.disconnect(id))
    }

    await Promise.allSettled(disconnectPromises)
  }

  private evictOldest(): boolean {
    let oldest: MCPConnection | null = null

    for (const conn of Array.from(this.connections.values())) {
      if (conn.refCount === 0 && conn.status === 'connected') {
        if (!oldest || conn.lastUsed < oldest.lastUsed) {
          oldest = conn
        }
      }
    }

    if (oldest) {
      this.disconnect(oldest.id)
      return true
    }

    return false
  }

  private checkIdleConnections(): void {
    const now = Date.now()
    const toDisconnect: string[] = []

    for (const [id, conn] of Array.from(this.connections)) {
      if (
        conn.status === 'connected' &&
        conn.refCount === 0 &&
        now - conn.lastUsed > this.config.idleTimeoutMs
      ) {
        if (this.connections.size - toDisconnect.length > this.config.minKeepAlive) {
          toDisconnect.push(id)
        }
      }
    }

    for (const id of toDisconnect) {
      this.disconnect(id)
    }
  }

  startIdleCheck(): void {
    if (this.checkInterval) return

    this.checkInterval = setInterval(() => {
      this.checkIdleConnections()
    }, this.config.checkIntervalMs).unref()
  }

  stopIdleCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  setOnDisconnect(callback: (id: string, name: string) => void): void {
    this.onDisconnect = callback
  }

  getConnection(id: string): MCPConnection | undefined {
    return this.connections.get(id)
  }

  getAllConnections(): MCPConnection[] {
    return Array.from(this.connections.values())
  }

  getActiveConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).filter(
      c => c.status === 'connected' && c.refCount > 0,
    )
  }

  getIdleConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).filter(
      c => c.status === 'connected' && c.refCount === 0,
    )
  }

  getStats(): {
    total: number
    connected: number
    active: number
    idle: number
    totalRequests: number
  } {
    let connected = 0
    let active = 0
    let idle = 0
    let totalRequests = 0

    for (const conn of Array.from(this.connections.values())) {
      totalRequests += conn.totalRequests
      if (conn.status === 'connected') {
        connected++
        if (conn.refCount > 0) {
          active++
        } else {
          idle++
        }
      }
    }

    return {
      total: this.connections.size,
      connected,
      active,
      idle,
      totalRequests,
    }
  }

  updateConfig(config: Partial<MCPIdleConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

let managerInstance: MCPConnectionManager | null = null

export function getMCPConnectionManager(): MCPConnectionManager {
  if (!managerInstance) {
    managerInstance = new MCPConnectionManager()
    managerInstance.startIdleCheck()
  }
  return managerInstance
}

export function registerMCPConnection(
  id: string,
  name: string,
  client: unknown,
  closeFn: () => Promise<void>,
): MCPConnection {
  return getMCPConnectionManager().register(id, name, client, closeFn)
}

export function touchMCPConnection(id: string): void {
  getMCPConnectionManager().touch(id)
}

export function acquireMCPConnection(id: string): MCPConnection | undefined {
  return getMCPConnectionManager().acquire(id)
}

export function releaseMCPConnection(id: string): void {
  getMCPConnectionManager().release(id)
}

export function disconnectMCPConnection(id: string): Promise<boolean> {
  return getMCPConnectionManager().disconnect(id)
}

export function disconnectAllMCPConnections(): Promise<void> {
  return getMCPConnectionManager().disconnectAll()
}

export function getMCPConnectionStats(): ReturnType<MCPConnectionManager['getStats']> {
  return getMCPConnectionManager().getStats()
}

export function withMCPConnection<T>(
  id: string,
  fn: (conn: MCPConnection) => Promise<T>,
): Promise<T | undefined> {
  const conn = acquireMCPConnection(id)
  if (!conn) {
    return Promise.resolve(undefined)
  }

  return fn(conn).finally(() => {
    releaseMCPConnection(id)
  })
}
