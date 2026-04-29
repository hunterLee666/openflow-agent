export type FlagValue = boolean | string | number

export interface FlagDefinition {
  key: string
  type: 'boolean' | 'string' | 'number' | 'enum'
  default: FlagValue
  description: string
  enumValues?: string[]
  deprecated?: boolean
  deprecatedMessage?: string
  min?: number
  max?: number
}

export type FlagMap = Record<string, FlagValue>

export const FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    key: 'mcp.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable MCP (Model Context Protocol) support',
  },
  {
    key: 'mcp.v2Transport',
    type: 'boolean',
    default: false,
    description: 'Use new MCP transport implementation',
  },
  {
    key: 'mcp.connectionBatchSize',
    type: 'number',
    default: 3,
    description: 'Number of MCP servers to connect in parallel',
    min: 1,
    max: 50,
  },
  {
    key: 'lsp.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable LSP (Language Server Protocol) support',
  },
  {
    key: 'lsp.autoStart',
    type: 'boolean',
    default: true,
    description: 'Automatically start LSP servers for detected languages',
  },
  {
    key: 'lsp.timeout',
    type: 'number',
    default: 30000,
    description: 'LSP server startup timeout in milliseconds',
    min: 5000,
    max: 120000,
  },
  {
    key: 'telemetry.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable anonymous telemetry collection',
  },
  {
    key: 'telemetry.sampleRate',
    type: 'number',
    default: 0.1,
    description: 'Telemetry sampling rate (0-1)',
    min: 0,
    max: 1,
  },
  {
    key: 'telemetry.batchSize',
    type: 'number',
    default: 100,
    description: 'Number of events to batch before sending',
    min: 10,
    max: 1000,
  },
  {
    key: 'ui.compactMode',
    type: 'boolean',
    default: false,
    description: 'Use compact UI mode',
  },
  {
    key: 'ui.showTokenCount',
    type: 'boolean',
    default: true,
    description: 'Show token count in status bar',
  },
  {
    key: 'model.routing.variant',
    type: 'string',
    default: 'default',
    description: 'Model routing variant for A/B testing',
  },
  {
    key: 'model.streaming.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable streaming responses',
  },
  {
    key: 'model.cache.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable prompt caching',
  },
  {
    key: 'model.cache.minTokens',
    type: 'number',
    default: 1024,
    description: 'Minimum tokens for cache eligibility',
    min: 256,
    max: 8192,
  },
  {
    key: 'context.compaction.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable automatic context compaction',
  },
  {
    key: 'context.compaction.threshold',
    type: 'number',
    default: 0.8,
    description: 'Context usage threshold to trigger compaction',
    min: 0.5,
    max: 1.0,
  },
  {
    key: 'tools.parallel.maxConcurrency',
    type: 'number',
    default: 5,
    description: 'Maximum parallel tool executions',
    min: 1,
    max: 20,
  },
  {
    key: 'tools.bash.timeout',
    type: 'number',
    default: 120000,
    description: 'Default bash command timeout in milliseconds',
    min: 1000,
    max: 600000,
  },
  {
    key: 'auth.tokenRefresh.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable proactive token refresh',
  },
  {
    key: 'auth.tokenRefresh.bufferMs',
    type: 'number',
    default: 300000,
    description: 'Refresh token this many ms before expiry',
    min: 60000,
    max: 3600000,
  },
  {
    key: 'experimental.multiAgent',
    type: 'boolean',
    default: false,
    description: 'Enable experimental multi-agent mode',
    deprecated: true,
    deprecatedMessage: 'Multi-agent is now stable, this flag will be removed',
  },
  {
    key: 'experimental.verificationAgent',
    type: 'boolean',
    default: true,
    description: 'Enable verification agent for tool results',
  },
  {
    key: 'experimental.deepPlanning',
    type: 'boolean',
    default: false,
    description: 'Enable deep planning mode',
  },
]

export const DEFAULT_FLAGS: FlagMap = Object.fromEntries(
  FLAG_DEFINITIONS.map(f => [f.key, f.default])
)

export function getFlagDefinition(key: string): FlagDefinition | undefined {
  return FLAG_DEFINITIONS.find(f => f.key === key)
}

export function validateFlagValue(key: string, value: FlagValue): boolean {
  const def = getFlagDefinition(key)
  if (!def) return false

  if (def.type === 'boolean' && typeof value !== 'boolean') return false
  if (def.type === 'string' && typeof value !== 'string') return false
  if (def.type === 'number' && typeof value !== 'number') return false
  if (def.type === 'enum' && def.enumValues && !def.enumValues.includes(String(value))) return false

  if (typeof value === 'number') {
    if (def.min !== undefined && value < def.min) return false
    if (def.max !== undefined && value > def.max) return false
  }

  return true
}
