export interface CacheHitMetric {
  timestamp: number
  requestId: string
  provider: string
  model: string
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cacheHit: boolean
  estimatedSavings: number
}

export interface CacheHitAggregate {
  period: 'hour' | 'day' | 'week' | 'month'
  startTime: number
  endTime: number
  totalRequests: number
  totalInputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  hitRate: number
  missRate: number
  estimatedSavings: number
  potentialSavings: number
  efficiency: number
}

export interface CacheDashboardData {
  current: {
    hitRate: number
    totalSavings: number
    avgSavingsPerRequest: number
  }
  trend: {
    hitRateTrend: number
    savingsTrend: number
  }
  breakdown: {
    byProvider: Map<string, ProviderCacheStats>
    byModel: Map<string, ModelCacheStats>
  }
  recommendations: CacheRecommendation[]
  alerts: CacheAlert[]
}

export interface ProviderCacheStats {
  provider: string
  requests: number
  hitRate: number
  avgCacheReadTokens: number
  totalSavings: number
}

export interface ModelCacheStats {
  model: string
  requests: number
  hitRate: number
  avgCacheReadTokens: number
  totalSavings: number
}

export interface CacheRecommendation {
  id: string
  type: 'increase_prefix' | 'stabilize_tools' | 'enable_cache' | 'adjust_ttl'
  priority: 'high' | 'medium' | 'low'
  message: string
  potentialSavings: number
  action: string
}

export interface CacheAlert {
  id: string
  type: 'low_hit_rate' | 'high_miss_rate' | 'cache_disabled' | 'prefix_unstable'
  severity: 'warning' | 'critical'
  message: string
  timestamp: number
}

class CacheDashboard {
  private metrics: CacheHitMetric[] = []
  private maxMetrics: number
  private inputCostPerToken: number
  private cacheReadCostPerToken: number

  constructor(
    maxMetrics: number = 10000,
    inputCostPerToken: number = 3 / 1_000_000,
    cacheReadCostPerToken: number = 0.375 / 1_000_000,
  ) {
    this.maxMetrics = maxMetrics
    this.inputCostPerToken = inputCostPerToken
    this.cacheReadCostPerToken = cacheReadCostPerToken
  }

  recordMetric(metric: Omit<CacheHitMetric, 'estimatedSavings'>): CacheHitMetric {
    const estimatedSavings = this.calculateSavings(
      metric.cacheReadTokens,
      metric.inputTokens,
    )

    const fullMetric: CacheHitMetric = {
      ...metric,
      estimatedSavings,
    }

    this.metrics.push(fullMetric)
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }

    return fullMetric
  }

  private calculateSavings(cacheReadTokens: number, inputTokens: number): number {
    const normalCost = cacheReadTokens * this.inputCostPerToken
    const cachedCost = cacheReadTokens * this.cacheReadCostPerToken
    return normalCost - cachedCost
  }

  getMetrics(since?: number): CacheHitMetric[] {
    if (since) {
      return this.metrics.filter(m => m.timestamp >= since)
    }
    return [...this.metrics]
  }

  calculateAggregate(period: 'hour' | 'day' | 'week' | 'month'): CacheHitAggregate {
    const now = Date.now()
    const periodMs: Record<string, number> = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }

    const startTime = now - periodMs[period]
    const periodMetrics = this.metrics.filter(m => m.timestamp >= startTime)

    const totalRequests = periodMetrics.length
    const totalInputTokens = periodMetrics.reduce((sum, m) => sum + m.inputTokens, 0)
    const totalCacheCreationTokens = periodMetrics.reduce((sum, m) => sum + m.cacheCreationTokens, 0)
    const totalCacheReadTokens = periodMetrics.reduce((sum, m) => sum + m.cacheReadTokens, 0)
    const estimatedSavings = periodMetrics.reduce((sum, m) => sum + m.estimatedSavings, 0)

    const hitCount = periodMetrics.filter(m => m.cacheHit).length
    const hitRate = totalRequests > 0 ? hitCount / totalRequests : 0
    const missRate = 1 - hitRate

    const potentialSavings = this.calculateSavings(totalInputTokens, totalInputTokens)
    const efficiency = potentialSavings > 0 ? estimatedSavings / potentialSavings : 0

    return {
      period,
      startTime,
      endTime: now,
      totalRequests,
      totalInputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens,
      hitRate,
      missRate,
      estimatedSavings,
      potentialSavings,
      efficiency,
    }
  }

  getDashboardData(): CacheDashboardData {
    const recentMetrics = this.metrics.slice(-100)
    const olderMetrics = this.metrics.slice(-200, -100)

    const currentHitRate = this.calculateHitRate(recentMetrics)
    const olderHitRate = this.calculateHitRate(olderMetrics)
    const hitRateTrend = currentHitRate - olderHitRate

    const currentSavings = recentMetrics.reduce((sum, m) => sum + m.estimatedSavings, 0)
    const olderSavings = olderMetrics.reduce((sum, m) => sum + m.estimatedSavings, 0)
    const savingsTrend = olderSavings > 0 ? (currentSavings - olderSavings) / olderSavings : 0

    const avgSavingsPerRequest = recentMetrics.length > 0
      ? currentSavings / recentMetrics.length
      : 0

    const byProvider = this.aggregateByProvider(recentMetrics)
    const byModel = this.aggregateByModel(recentMetrics)

    const recommendations = this.generateRecommendations(recentMetrics)
    const alerts = this.generateAlerts(recentMetrics)

    return {
      current: {
        hitRate: currentHitRate,
        totalSavings: currentSavings,
        avgSavingsPerRequest,
      },
      trend: {
        hitRateTrend,
        savingsTrend,
      },
      breakdown: {
        byProvider,
        byModel,
      },
      recommendations,
      alerts,
    }
  }

  private calculateHitRate(metrics: CacheHitMetric[]): number {
    if (metrics.length === 0) return 0
    const hits = metrics.filter(m => m.cacheHit).length
    return hits / metrics.length
  }

  private aggregateByProvider(metrics: CacheHitMetric[]): Map<string, ProviderCacheStats> {
    const result = new Map<string, ProviderCacheStats & { _hits: number; _totalCacheRead: number }>()

    for (const metric of metrics) {
      const existing = result.get(metric.provider) || {
        provider: metric.provider,
        requests: 0,
        hitRate: 0,
        avgCacheReadTokens: 0,
        totalSavings: 0,
        _hits: 0,
        _totalCacheRead: 0,
      }

      existing.requests++
      if (metric.cacheHit) existing._hits++
      existing._totalCacheRead += metric.cacheReadTokens
      existing.totalSavings += metric.estimatedSavings

      result.set(metric.provider, existing)
    }

    const finalResult = new Map<string, ProviderCacheStats>()
    for (const [key, stats] of Array.from(result)) {
      const finalStats: ProviderCacheStats = {
        provider: stats.provider,
        requests: stats.requests,
        hitRate: stats.requests > 0 ? stats._hits / stats.requests : 0,
        avgCacheReadTokens: stats.requests > 0 ? stats._totalCacheRead / stats.requests : 0,
        totalSavings: stats.totalSavings,
      }
      finalResult.set(key, finalStats)
    }

    return finalResult
  }

  private aggregateByModel(metrics: CacheHitMetric[]): Map<string, ModelCacheStats> {
    const result = new Map<string, ModelCacheStats & { _hits: number; _totalCacheRead: number }>()

    for (const metric of metrics) {
      const existing = result.get(metric.model) || {
        model: metric.model,
        requests: 0,
        hitRate: 0,
        avgCacheReadTokens: 0,
        totalSavings: 0,
        _hits: 0,
        _totalCacheRead: 0,
      }

      existing.requests++
      if (metric.cacheHit) existing._hits++
      existing._totalCacheRead += metric.cacheReadTokens
      existing.totalSavings += metric.estimatedSavings

      result.set(metric.model, existing)
    }

    const finalResult = new Map<string, ModelCacheStats>()
    for (const [key, stats] of Array.from(result)) {
      const finalStats: ModelCacheStats = {
        model: stats.model,
        requests: stats.requests,
        hitRate: stats.requests > 0 ? stats._hits / stats.requests : 0,
        avgCacheReadTokens: stats.requests > 0 ? stats._totalCacheRead / stats.requests : 0,
        totalSavings: stats.totalSavings,
      }
      finalResult.set(key, finalStats)
    }

    return finalResult
  }

  private generateRecommendations(metrics: CacheHitMetric[]): CacheRecommendation[] {
    const recommendations: CacheRecommendation[] = []
    const hitRate = this.calculateHitRate(metrics)

    if (hitRate < 0.3) {
      recommendations.push({
        id: 'rec_low_hit_rate',
        type: 'increase_prefix',
        priority: 'high',
        message: 'Cache hit rate is low. Consider increasing stable prefix length.',
        potentialSavings: metrics.length * 0.5 * this.inputCostPerToken * 10000,
        action: 'Review system prompt and tool order for stability',
      })
    }

    const noCacheMetrics = metrics.filter(m => m.cacheCreationTokens === 0 && m.cacheReadTokens === 0)
    if (noCacheMetrics.length > metrics.length * 0.5) {
      recommendations.push({
        id: 'rec_cache_disabled',
        type: 'enable_cache',
        priority: 'high',
        message: 'Many requests are not using cache. Enable prompt caching.',
        potentialSavings: noCacheMetrics.length * 0.8 * this.inputCostPerToken * 50000,
        action: 'Add cache_control to system prompt and tools',
      })
    }

    const avgCacheRead = metrics.reduce((sum, m) => sum + m.cacheReadTokens, 0) / metrics.length
    if (avgCacheRead < 5000 && hitRate > 0.5) {
      recommendations.push({
        id: 'rec_small_cache',
        type: 'increase_prefix',
        priority: 'medium',
        message: 'Cache hits are small. Consider adding more content to cacheable prefix.',
        potentialSavings: metrics.length * 0.3 * this.inputCostPerToken * 10000,
        action: 'Extend stable prefix with more context',
      })
    }

    return recommendations
  }

  private generateAlerts(metrics: CacheHitMetric[]): CacheAlert[] {
    const alerts: CacheAlert[] = []
    const hitRate = this.calculateHitRate(metrics)

    if (hitRate < 0.2) {
      alerts.push({
        id: `alert_low_hit_${Date.now()}`,
        type: 'low_hit_rate',
        severity: 'critical',
        message: `Cache hit rate is critically low: ${(hitRate * 100).toFixed(1)}%`,
        timestamp: Date.now(),
      })
    } else if (hitRate < 0.4) {
      alerts.push({
        id: `alert_low_hit_${Date.now()}`,
        type: 'low_hit_rate',
        severity: 'warning',
        message: `Cache hit rate is below optimal: ${(hitRate * 100).toFixed(1)}%`,
        timestamp: Date.now(),
      })
    }

    return alerts
  }

  clearMetrics(): void {
    this.metrics = []
  }

  exportData(): string {
    return JSON.stringify({
      metrics: this.metrics,
      exportedAt: Date.now(),
    }, null, 2)
  }

  importData(json: string): void {
    try {
      const data = JSON.parse(json)
      if (Array.isArray(data.metrics)) {
        this.metrics = data.metrics
      }
    } catch {
      throw new Error('Invalid import data format')
    }
  }
}

let defaultDashboard: CacheDashboard | null = null

export function getCacheDashboard(): CacheDashboard {
  if (!defaultDashboard) {
    defaultDashboard = new CacheDashboard()
  }
  return defaultDashboard
}

export function createCacheDashboard(
  maxMetrics?: number,
  inputCostPerToken?: number,
  cacheReadCostPerToken?: number,
): CacheDashboard {
  defaultDashboard = new CacheDashboard(maxMetrics, inputCostPerToken, cacheReadCostPerToken)
  return defaultDashboard
}

export function formatHitRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export function formatSavings(savings: number): string {
  if (savings < 0.01) return `$${(savings * 100).toFixed(2)}¢`
  if (savings < 1) return `$${savings.toFixed(3)}`
  return `$${savings.toFixed(2)}`
}

export function getCacheEfficiencyGrade(efficiency: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (efficiency >= 0.8) return 'A'
  if (efficiency >= 0.6) return 'B'
  if (efficiency >= 0.4) return 'C'
  if (efficiency >= 0.2) return 'D'
  return 'F'
}
