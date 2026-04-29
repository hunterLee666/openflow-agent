export type { WrappedClient } from './client'
export { getClients, getClientsForCliMcpConfig } from './client'

export type { ScopedMcpServerConfig } from './discovery'
export {
  addMcpServer,
  ensureConfigScope,
  getMcprcServerStatus,
  getMcpServer,
  listMCPServers,
  listPluginMCPServers,
  parseEnvVars,
  removeMcpServer,
} from './discovery'

export { getMCPCommands, getMCPTools, runCommand } from './tools-integration'

export type { McpCliTransport } from './cli-utils'
export {
  looksLikeMcpUrl,
  normalizeMcpScopeForCli,
  normalizeMcpTransport,
  parseMcpHeaders,
} from './cli-utils'

export {
  mergeToolNamespaces,
  mergeResources,
  mergePrompts,
  parseMergedToolName,
  buildMergedToolName,
  validateToolSchema,
  filterToolsByServer,
  getToolServer,
  McpRegistry,
  getMcpRegistry,
  resetMcpRegistry,
} from './registry'
export type {
  McpTool,
  McpResource,
  McpPrompt,
  McpServerCapabilities,
  McpServerInfo,
  McpServerConnection,
  MergedToolRegistry,
} from './registry'
