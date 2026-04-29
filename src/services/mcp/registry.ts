import type { McpServerConfig } from '../../core/config/schema'

export interface McpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

export interface McpServerCapabilities {
  tools?: boolean
  resources?: boolean
  prompts?: boolean
  logging?: boolean
}

export interface McpServerInfo {
  name: string
  version: string
  capabilities: McpServerCapabilities
}

export interface McpServerConnection {
  name: string
  config: McpServerConfig
  info?: McpServerInfo
  tools: McpTool[]
  resources: McpResource[]
  prompts: McpPrompt[]
  connected: boolean
  lastError?: string
}

export interface MergedToolRegistry {
  tools: McpTool[]
  serverMap: Map<string, string>
  conflicts: Array<{ toolName: string; servers: string[] }>
}

const SEPARATOR = '__'

export function mergeToolNamespaces(
  servers: McpServerConnection[],
  options?: { separator?: string; prefixStrategy?: 'always' | 'on-conflict' | 'never' },
): MergedToolRegistry {
  const separator = options?.separator || SEPARATOR
  const strategy = options?.prefixStrategy || 'on-conflict'

  const tools: McpTool[] = []
  const serverMap = new Map<string, string>()
  const conflicts: Array<{ toolName: string; servers: string[] }> = []

  const toolToServers = new Map<string, string[]>()

  for (const server of servers) {
    if (!server.connected || !server.tools.length) continue

    for (const tool of server.tools) {
      const existing = toolToServers.get(tool.name) || []
      existing.push(server.name)
      toolToServers.set(tool.name, existing)
    }
  }

  for (const [toolName, serverNames] of Array.from(toolToServers.entries())) {
    if (serverNames.length > 1) {
      conflicts.push({ toolName, servers: serverNames })
    }
  }

  for (const server of servers) {
    if (!server.connected || !server.tools.length) continue

    for (const tool of server.tools) {
      const hasConflict = conflicts.some(c => c.toolName === tool.name)
      const needsPrefix = strategy === 'always' || (strategy === 'on-conflict' && hasConflict)

      const mergedName = needsPrefix
        ? `${sanitizePrefix(server.name)}${separator}${tool.name}`
        : tool.name

      tools.push({
        ...tool,
        name: mergedName,
      })

      serverMap.set(mergedName, server.name)
    }
  }

  return { tools, serverMap, conflicts }
}

export function mergeResources(
  servers: McpServerConnection[],
  options?: { prefixStrategy?: 'always' | 'on-conflict' | 'never' },
): McpResource[] {
  const strategy = options?.prefixStrategy || 'on-conflict'
  const resources: McpResource[] = []
  const resourceToServers = new Map<string, string[]>()

  for (const server of servers) {
    if (!server.connected || !server.resources.length) continue

    for (const resource of server.resources) {
      const existing = resourceToServers.get(resource.name) || []
      existing.push(server.name)
      resourceToServers.set(resource.name, existing)
    }
  }

  for (const server of servers) {
    if (!server.connected || !server.resources.length) continue

    for (const resource of server.resources) {
      const serverNames = resourceToServers.get(resource.name) || []
      const hasConflict = serverNames.length > 1
      const needsPrefix = strategy === 'always' || (strategy === 'on-conflict' && hasConflict)

      if (needsPrefix) {
        resources.push({
          ...resource,
          name: `${sanitizePrefix(server.name)}${SEPARATOR}${resource.name}`,
        })
      } else {
        resources.push(resource)
      }
    }
  }

  return resources
}

export function mergePrompts(
  servers: McpServerConnection[],
  options?: { prefixStrategy?: 'always' | 'on-conflict' | 'never' },
): McpPrompt[] {
  const strategy = options?.prefixStrategy || 'on-conflict'
  const prompts: McpPrompt[] = []
  const promptToServers = new Map<string, string[]>()

  for (const server of servers) {
    if (!server.connected || !server.prompts.length) continue

    for (const prompt of server.prompts) {
      const existing = promptToServers.get(prompt.name) || []
      existing.push(server.name)
      promptToServers.set(prompt.name, existing)
    }
  }

  for (const server of servers) {
    if (!server.connected || !server.prompts.length) continue

    for (const prompt of server.prompts) {
      const serverNames = promptToServers.get(prompt.name) || []
      const hasConflict = serverNames.length > 1
      const needsPrefix = strategy === 'always' || (strategy === 'on-conflict' && hasConflict)

      if (needsPrefix) {
        prompts.push({
          ...prompt,
          name: `${sanitizePrefix(server.name)}${SEPARATOR}${prompt.name}`,
        })
      } else {
        prompts.push(prompt)
      }
    }
  }

  return prompts
}

export function parseMergedToolName(
  mergedName: string,
  separator: string = SEPARATOR,
): { serverName: string | null; toolName: string } {
  const idx = mergedName.indexOf(separator)
  if (idx === -1) {
    return { serverName: null, toolName: mergedName }
  }
  return {
    serverName: mergedName.slice(0, idx),
    toolName: mergedName.slice(idx + separator.length),
  }
}

export function buildMergedToolName(
  serverName: string,
  toolName: string,
  separator: string = SEPARATOR,
): string {
  return `${sanitizePrefix(serverName)}${separator}${toolName}`
}

function sanitizePrefix(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export function validateToolSchema(tool: McpTool): boolean {
  if (!tool.name || typeof tool.name !== 'string') return false
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') return false

  const schema = tool.inputSchema as Record<string, unknown>
  if (schema.type !== 'object') return false

  return true
}

export function filterToolsByServer(
  tools: McpTool[],
  serverName: string,
  separator: string = SEPARATOR,
): McpTool[] {
  const prefix = `${sanitizePrefix(serverName)}${separator}`
  return tools.filter(t => t.name.startsWith(prefix))
}

export function getToolServer(
  toolName: string,
  serverMap: Map<string, string>,
): string | undefined {
  return serverMap.get(toolName)
}

export class McpRegistry {
  private connections: Map<string, McpServerConnection> = new Map()
  private mergedRegistry: MergedToolRegistry | null = null

  addConnection(connection: McpServerConnection): void {
    this.connections.set(connection.name, connection)
    this.mergedRegistry = null
  }

  removeConnection(name: string): void {
    this.connections.delete(name)
    this.mergedRegistry = null
  }

  updateConnection(name: string, updates: Partial<McpServerConnection>): void {
    const existing = this.connections.get(name)
    if (existing) {
      this.connections.set(name, { ...existing, ...updates })
      this.mergedRegistry = null
    }
  }

  getConnection(name: string): McpServerConnection | undefined {
    return this.connections.get(name)
  }

  getAllConnections(): McpServerConnection[] {
    return Array.from(this.connections.values())
  }

  getConnectedConnections(): McpServerConnection[] {
    return this.getAllConnections().filter(c => c.connected)
  }

  getMergedRegistry(options?: { separator?: string; prefixStrategy?: 'always' | 'on-conflict' | 'never' }): MergedToolRegistry {
    if (!this.mergedRegistry || options) {
      this.mergedRegistry = mergeToolNamespaces(this.getConnectedConnections(), options)
    }
    return this.mergedRegistry
  }

  getTools(options?: { separator?: string; prefixStrategy?: 'always' | 'on-conflict' | 'never' }): McpTool[] {
    return this.getMergedRegistry(options).tools
  }

  getResources(): McpResource[] {
    return mergeResources(this.getConnectedConnections())
  }

  getPrompts(): McpPrompt[] {
    return mergePrompts(this.getConnectedConnections())
  }

  getConflicts(): Array<{ toolName: string; servers: string[] }> {
    return this.getMergedRegistry().conflicts
  }

  resolveTool(toolName: string): { server: McpServerConnection; tool: McpTool } | null {
    const { serverName, toolName: originalName } = parseMergedToolName(toolName)

    if (serverName) {
      const connection = this.connections.get(serverName)
      if (connection && connection.connected) {
        const tool = connection.tools.find(t => t.name === originalName)
        if (tool) {
          return { server: connection, tool }
        }
      }
      return null
    }

    for (const connection of this.getConnectedConnections()) {
      const tool = connection.tools.find(t => t.name === toolName)
      if (tool) {
        return { server: connection, tool }
      }
    }

    return null
  }

  clear(): void {
    this.connections.clear()
    this.mergedRegistry = null
  }
}

let registryInstance: McpRegistry | null = null

export function getMcpRegistry(): McpRegistry {
  if (!registryInstance) {
    registryInstance = new McpRegistry()
  }
  return registryInstance
}

export function resetMcpRegistry(): void {
  registryInstance = null
}
