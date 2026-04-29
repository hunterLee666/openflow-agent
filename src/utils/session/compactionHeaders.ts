export const COMPACTION_PROTOCOL_VERSION = 'compact-2026-01-12'

export interface CompactionHeaders {
  'X-Compaction-Profile': string
  'X-Compaction-Strategy'?: 'tier1' | 'tier2' | 'tier3' | 'hybrid'
  'X-Compaction-Threshold'?: string
  'X-Compaction-Cache-Aware'?: 'true' | 'false'
}

export interface CompactionConfig {
  enabled: boolean
  strategy: 'tier1' | 'tier2' | 'tier3' | 'hybrid'
  threshold: number
  cacheAware: boolean
  preserveRecentCount: number
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  enabled: true,
  strategy: 'hybrid',
  threshold: 0.87,
  cacheAware: true,
  preserveRecentCount: 5,
}

export function buildCompactionHeaders(config: Partial<CompactionConfig> = {}): CompactionHeaders {
  const cfg = { ...DEFAULT_COMPACTION_CONFIG, ...config }
  
  if (!cfg.enabled) {
    return {
      'X-Compaction-Profile': 'disabled',
    }
  }
  
  const headers: CompactionHeaders = {
    'X-Compaction-Profile': COMPACTION_PROTOCOL_VERSION,
    'X-Compaction-Strategy': cfg.strategy,
    'X-Compaction-Threshold': cfg.threshold.toString(),
    'X-Compaction-Cache-Aware': cfg.cacheAware ? 'true' : 'false',
  }
  
  return headers
}

export function parseCompactionHeaders(headers: Record<string, string | undefined>): CompactionConfig {
  const profile = headers['x-compaction-profile']
  
  if (!profile || profile === 'disabled') {
    return { ...DEFAULT_COMPACTION_CONFIG, enabled: false }
  }
  
  return {
    enabled: true,
    strategy: (headers['x-compaction-strategy'] as CompactionConfig['strategy']) || 'hybrid',
    threshold: parseFloat(headers['x-compaction-threshold'] || '0.87'),
    cacheAware: headers['x-compaction-cache-aware'] !== 'false',
    preserveRecentCount: parseInt(headers['x-compaction-preserve-recent'] || '5', 10),
  }
}

export function mergeCompactionHeaders(
  existing: Record<string, string>,
  compaction: CompactionHeaders,
): Record<string, string> {
  return {
    ...existing,
    ...compaction,
  }
}

export interface CompactionNegotiationResult {
  agreed: boolean
  serverVersion?: string
  serverStrategy?: string
  message?: string
}

export function negotiateCompactionProtocol(
  clientVersion: string,
  serverVersion?: string,
): CompactionNegotiationResult {
  if (!serverVersion) {
    return {
      agreed: false,
      message: 'Server does not support compaction protocol',
    }
  }
  
  const clientParts = clientVersion.split('-')
  const serverParts = serverVersion.split('-')
  
  if (clientParts[0] !== serverParts[0]) {
    return {
      agreed: false,
      serverVersion,
      message: 'Protocol name mismatch',
    }
  }
  
  const clientDate = new Date(clientParts.slice(1).join('-'))
  const serverDate = new Date(serverParts.slice(1).join('-'))
  
  if (isNaN(clientDate.getTime()) || isNaN(serverDate.getTime())) {
    return {
      agreed: true,
      serverVersion,
      message: 'Version negotiation successful (non-standard format)',
    }
  }
  
  if (serverDate >= clientDate) {
    return {
      agreed: true,
      serverVersion,
      message: 'Server version is compatible or newer',
    }
  }
  
  return {
    agreed: true,
    serverVersion,
    message: 'Server version is older but compatible',
  }
}

export function getCompactionHeaderForProvider(
  provider: 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'openrouter',
  config: Partial<CompactionConfig> = {},
): Record<string, string> {
  const baseHeaders = buildCompactionHeaders(config) as unknown as Record<string, string>
  
  switch (provider) {
    case 'anthropic':
      return {
        'anthropic-beta': `compaction-${COMPACTION_PROTOCOL_VERSION}`,
        ...baseHeaders,
      }
    
    case 'openai':
      return {
        'OpenAI-Compaction': COMPACTION_PROTOCOL_VERSION,
        ...baseHeaders,
      }
    
    case 'gemini':
      return {
        'X-Google-Compaction': COMPACTION_PROTOCOL_VERSION,
        ...baseHeaders,
      }
    
    case 'deepseek':
      return {
        'X-DeepSeek-Compaction': COMPACTION_PROTOCOL_VERSION,
        ...baseHeaders,
      }
    
    case 'openrouter':
      return {
        'X-OpenRouter-Compaction': COMPACTION_PROTOCOL_VERSION,
        ...baseHeaders,
      }
    
    default:
      return baseHeaders
  }
}

export const COMPACTION_CONSTANTS = {
  VERSION: COMPACTION_PROTOCOL_VERSION,
  TIER1_THRESHOLD: 0.6,
  TIER2_THRESHOLD: 0.87,
  TIER3_THRESHOLD: 0.95,
  MIN_PRESERVE_COUNT: 3,
  MAX_PRESERVE_COUNT: 10,
  DEFAULT_CACHE_AWARE: true,
} as const
