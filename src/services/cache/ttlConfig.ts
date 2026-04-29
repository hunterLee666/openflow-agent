export type CacheTTL = '5m' | '1h'

export interface CacheBreakpoint {
  position: 'system' | 'tools' | 'history_prefix' | 'last_message'
  minTokens: number
  ttl: CacheTTL
}

export interface CacheConfig {
  enabled: boolean
  defaultTtl: CacheTTL
  maxBreakpoints: number
  breakpoints: CacheBreakpoint[]
  extendedTtlEnabled: boolean
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  defaultTtl: '5m',
  maxBreakpoints: 4,
  breakpoints: [
    { position: 'system', minTokens: 1000, ttl: '1h' },
    { position: 'tools', minTokens: 2000, ttl: '5m' },
    { position: 'history_prefix', minTokens: 2000, ttl: '5m' },
    { position: 'last_message', minTokens: 500, ttl: '5m' },
  ],
  extendedTtlEnabled: true,
}

export function parseTTL(ttl: CacheTTL): number {
  switch (ttl) {
    case '5m':
      return 5 * 60 * 1000
    case '1h':
      return 60 * 60 * 1000
    default:
      return 5 * 60 * 1000
  }
}

export function formatTTL(ms: number): CacheTTL {
  if (ms >= 60 * 60 * 1000) {
    return '1h'
  }
  return '5m'
}

export interface CacheControlBlock {
  type: 'ephemeral'
  ttl?: CacheTTL
}

export function createCacheControl(ttl?: CacheTTL): CacheControlBlock {
  return {
    type: 'ephemeral',
    ...(ttl && { ttl }),
  }
}

export interface CacheableBlock {
  text: string
  cacheControl?: CacheControlBlock
  estimatedTokens: number
}

export function shouldAddCacheControl(
  block: CacheableBlock,
  config: CacheConfig,
  usedBreakpoints: number,
): boolean {
  if (!config.enabled) return false
  if (usedBreakpoints >= config.maxBreakpoints) return false
  if (block.estimatedTokens < 500) return false
  return true
}

export function selectBreakpointTTL(
  position: CacheBreakpoint['position'],
  config: CacheConfig,
): CacheTTL {
  const breakpoint = config.breakpoints.find(bp => bp.position === position)
  return breakpoint?.ttl ?? config.defaultTtl
}

export interface CacheStrategy {
  name: string
  description: string
  breakpoints: CacheBreakpoint[]
  recommended: boolean
}

export const CACHE_STRATEGIES: Record<string, CacheStrategy> = {
  aggressive: {
    name: 'aggressive',
    description: 'Maximum caching for long sessions',
    breakpoints: [
      { position: 'system', minTokens: 500, ttl: '1h' },
      { position: 'tools', minTokens: 1000, ttl: '1h' },
      { position: 'history_prefix', minTokens: 1000, ttl: '5m' },
      { position: 'last_message', minTokens: 200, ttl: '5m' },
    ],
    recommended: true,
  },
  balanced: {
    name: 'balanced',
    description: 'Default caching strategy',
    breakpoints: [
      { position: 'system', minTokens: 1000, ttl: '5m' },
      { position: 'tools', minTokens: 2000, ttl: '5m' },
      { position: 'last_message', minTokens: 500, ttl: '5m' },
    ],
    recommended: true,
  },
  minimal: {
    name: 'minimal',
    description: 'Minimal caching for short sessions',
    breakpoints: [
      { position: 'system', minTokens: 2000, ttl: '5m' },
    ],
    recommended: false,
  },
  disabled: {
    name: 'disabled',
    description: 'No caching',
    breakpoints: [],
    recommended: false,
  },
}

export function getCacheStrategy(name: string): CacheStrategy {
  return CACHE_STRATEGIES[name] ?? CACHE_STRATEGIES.balanced
}

export function selectCacheStrategy(
  estimatedTokens: number,
  sessionLength: 'short' | 'medium' | 'long',
): CacheStrategy {
  if (sessionLength === 'short' || estimatedTokens < 50000) {
    return CACHE_STRATEGIES.minimal
  }
  if (sessionLength === 'long' || estimatedTokens > 200000) {
    return CACHE_STRATEGIES.aggressive
  }
  return CACHE_STRATEGIES.balanced
}

export interface CacheMetrics {
  cacheCreationTokens: number
  cacheReadTokens: number
  cacheHitRate: number
  estimatedSavings: number
}

export function calculateCacheSavings(
  metrics: CacheMetrics,
  inputCostPerToken: number,
  cacheReadCostPerToken: number,
): number {
  const normalCost = metrics.cacheReadTokens * inputCostPerToken
  const cachedCost = metrics.cacheReadTokens * cacheReadCostPerToken
  return normalCost - cachedCost
}

export function calculateCacheHitRate(
  cacheReadTokens: number,
  totalInputTokens: number,
): number {
  if (totalInputTokens === 0) return 0
  return cacheReadTokens / totalInputTokens
}

export interface CacheAuditResult {
  isValid: boolean
  issues: string[]
  warnings: string[]
  suggestions: string[]
}

export function auditCachePrefix(prefix: string): CacheAuditResult {
  const issues: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(prefix)) {
    issues.push('ISO timestamp detected - will break cache prefix')
  }

  if (/Date\.now\(\)|new Date\(\)/.test(prefix)) {
    issues.push('Dynamic date detected - will break cache prefix')
  }

  if (/random|uuid|nanoid|crypto\.random/i.test(prefix)) {
    issues.push('Random/UUID detected - will break cache prefix')
  }

  if (/session[_-]?id/i.test(prefix)) {
    warnings.push('Session ID detected - verify if truly static')
  }

  if (/process\.env|import\.meta\.env/i.test(prefix)) {
    warnings.push('Environment variable reference - verify stability')
  }

  if (prefix.length < 1000) {
    suggestions.push('Consider adding more stable content to increase cache benefit')
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    suggestions,
  }
}

export function mergeCacheConfigs(
  base: CacheConfig,
  override: Partial<CacheConfig>,
): CacheConfig {
  return {
    ...base,
    ...override,
    breakpoints: override.breakpoints ?? base.breakpoints,
  }
}

export function createOptimalCacheConfig(
  systemPromptTokens: number,
  toolsTokens: number,
  historyTokens: number,
  sessionType: 'new' | 'continuation' | 'long_running',
): CacheConfig {
  const breakpoints: CacheBreakpoint[] = []
  let usedBreakpoints = 0

  if (systemPromptTokens >= 1000 && usedBreakpoints < 4) {
    breakpoints.push({
      position: 'system',
      minTokens: systemPromptTokens,
      ttl: sessionType === 'long_running' ? '1h' : '5m',
    })
    usedBreakpoints++
  }

  if (toolsTokens >= 2000 && usedBreakpoints < 4) {
    breakpoints.push({
      position: 'tools',
      minTokens: toolsTokens,
      ttl: '5m',
    })
    usedBreakpoints++
  }

  if (historyTokens >= 2000 && usedBreakpoints < 4) {
    breakpoints.push({
      position: 'history_prefix',
      minTokens: Math.min(historyTokens, 50000),
      ttl: '5m',
    })
    usedBreakpoints++
  }

  return {
    enabled: true,
    defaultTtl: '5m',
    maxBreakpoints: 4,
    breakpoints,
    extendedTtlEnabled: sessionType === 'long_running',
  }
}
