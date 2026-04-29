export interface TTFBMetric {
  requestId: string
  provider: string
  model: string
  startTime: number
  firstTokenTime: number
  ttfb: number
  inputTokens: number
  cached: boolean
  success: boolean
}

export interface TTFBAggregate {
  provider: string
  model: string
  count: number
  min: number
  max: number
  mean: number
  median: number
  p50: number
  p90: number
  p95: number
  p99: number
  cachedCount: number
  cachedMean: number
  uncachedCount: number
  uncachedMean: number
}

export interface TTFBThresholds {
  excellent: number
  good: number
  fair: number
  poor: number
}

export const DEFAULT_TTFB_THRESHOLDS: TTFBThresholds = {
  excellent: 500,
  good: 1000,
  fair: 2000,
  poor: 5000,
}

export function classifyTTFB(ttfb: number, thresholds: TTFBThresholds = DEFAULT_TTFB_THRESHOLDS): 'excellent' | 'good' | 'fair' | 'poor' {
  if (ttfb <= thresholds.excellent) return 'excellent'
  if (ttfb <= thresholds.good) return 'good'
  if (ttfb <= thresholds.fair) return 'fair'
  return 'poor'
}

class TTFBMonitor {
  private metrics: TTFBMetric[] = []
  private maxMetrics: number
  private thresholds: TTFBThresholds
  private pendingRequests: Map<string, { startTime: number; provider: string; model: string; inputTokens: number }> = new Map()

  constructor(maxMetrics: number = 1000, thresholds: TTFBThresholds = DEFAULT_TTFB_THRESHOLDS) {
    this.maxMetrics = maxMetrics
    this.thresholds = thresholds
  }

  startRequest(requestId: string, provider: string, model: string, inputTokens: number): number {
    const startTime = Date.now()
    this.pendingRequests.set(requestId, { startTime, provider, model, inputTokens })
    return startTime
  }

  recordFirstToken(requestId: string, cached: boolean = false): TTFBMetric | null {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return null

    const firstTokenTime = Date.now()
    const ttfb = firstTokenTime - pending.startTime

    const metric: TTFBMetric = {
      requestId,
      provider: pending.provider,
      model: pending.model,
      startTime: pending.startTime,
      firstTokenTime,
      ttfb,
      inputTokens: pending.inputTokens,
      cached,
      success: true,
    }

    this.pendingRequests.delete(requestId)
    this.addMetric(metric)

    return metric
  }

  recordFailure(requestId: string): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return

    const metric: TTFBMetric = {
      requestId,
      provider: pending.provider,
      model: pending.model,
      startTime: pending.startTime,
      firstTokenTime: Date.now(),
      ttfb: Date.now() - pending.startTime,
      inputTokens: pending.inputTokens,
      cached: false,
      success: false,
    }

    this.pendingRequests.delete(requestId)
    this.addMetric(metric)
  }

  private addMetric(metric: TTFBMetric): void {
    this.metrics.push(metric)
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }
  }

  getMetrics(): TTFBMetric[] {
    return [...this.metrics]
  }

  getRecentMetrics(count: number = 100): TTFBMetric[] {
    return this.metrics.slice(-count)
  }

  clearMetrics(): void {
    this.metrics = []
  }

  calculateAggregate(provider?: string, model?: string): TTFBAggregate | null {
    let filtered = this.metrics.filter(m => m.success)
    if (provider) filtered = filtered.filter(m => m.provider === provider)
    if (model) filtered = filtered.filter(m => m.model === model)

    if (filtered.length === 0) return null

    const ttfbs = filtered.map(m => m.ttfb).sort((a, b) => a - b)
    const cached = filtered.filter(m => m.cached)
    const uncached = filtered.filter(m => !m.cached)

    const percentile = (arr: number[], p: number): number => {
      const idx = Math.ceil((arr.length * p) / 100) - 1
      return arr[Math.max(0, idx)]
    }

    return {
      provider: provider ?? 'all',
      model: model ?? 'all',
      count: filtered.length,
      min: ttfbs[0],
      max: ttfbs[ttfbs.length - 1],
      mean: Math.round(ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length),
      median: percentile(ttfbs, 50),
      p50: percentile(ttfbs, 50),
      p90: percentile(ttfbs, 90),
      p95: percentile(ttfbs, 95),
      p99: percentile(ttfbs, 99),
      cachedCount: cached.length,
      cachedMean: cached.length > 0 ? Math.round(cached.map(m => m.ttfb).reduce((a, b) => a + b, 0) / cached.length) : 0,
      uncachedCount: uncached.length,
      uncachedMean: uncached.length > 0 ? Math.round(uncached.map(m => m.ttfb).reduce((a, b) => a + b, 0) / uncached.length) : 0,
    }
  }

  getAggregatesByProvider(): Map<string, TTFBAggregate> {
    const providers = new Set(this.metrics.map(m => m.provider))
    const result = new Map<string, TTFBAggregate>()

    for (const provider of Array.from(providers)) {
      const aggregate = this.calculateAggregate(provider)
      if (aggregate) {
        result.set(provider, aggregate)
      }
    }

    return result
  }

  getAggregatesByModel(): Map<string, TTFBAggregate> {
    const models = new Set(this.metrics.map(m => m.model))
    const result = new Map<string, TTFBAggregate>()

    for (const model of Array.from(models)) {
      const aggregate = this.calculateAggregate(undefined, model)
      if (aggregate) {
        result.set(model, aggregate)
      }
    }

    return result
  }

  getHealthScore(): {
    score: number
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
    issues: string[]
  } {
    const recent = this.getRecentMetrics(50)
    if (recent.length < 5) {
      return { score: 100, grade: 'A', issues: ['Insufficient data for health assessment'] }
    }

    const successful = recent.filter(m => m.success)
    const successRate = successful.length / recent.length

    const ttfbs = successful.map(m => m.ttfb)
    const meanTTFB = ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length

    const cachedRate = successful.filter(m => m.cached).length / successful.length

    const issues: string[] = []

    let score = 100

    if (successRate < 0.95) {
      score -= (1 - successRate) * 30
      issues.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`)
    }

    if (meanTTFB > this.thresholds.poor) {
      score -= 25
      issues.push(`High average TTFB: ${meanTTFB.toFixed(0)}ms`)
    } else if (meanTTFB > this.thresholds.fair) {
      score -= 15
      issues.push(`Elevated average TTFB: ${meanTTFB.toFixed(0)}ms`)
    } else if (meanTTFB > this.thresholds.good) {
      score -= 5
      issues.push(`Moderate average TTFB: ${meanTTFB.toFixed(0)}ms`)
    }

    if (cachedRate < 0.3) {
      score -= 10
      issues.push(`Low cache hit rate: ${(cachedRate * 100).toFixed(1)}%`)
    }

    score = Math.max(0, Math.min(100, score))

    let grade: 'A' | 'B' | 'C' | 'D' | 'F'
    if (score >= 90) grade = 'A'
    else if (score >= 80) grade = 'B'
    else if (score >= 70) grade = 'C'
    else if (score >= 60) grade = 'D'
    else grade = 'F'

    return { score, grade, issues }
  }

  getSummary(): {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    averageTTFB: number
    cacheHitRate: number
    healthScore: number
  } {
    const successful = this.metrics.filter(m => m.success)
    const cached = successful.filter(m => m.cached)

    return {
      totalRequests: this.metrics.length,
      successfulRequests: successful.length,
      failedRequests: this.metrics.length - successful.length,
      averageTTFB: successful.length > 0
        ? Math.round(successful.map(m => m.ttfb).reduce((a, b) => a + b, 0) / successful.length)
        : 0,
      cacheHitRate: successful.length > 0 ? cached.length / successful.length : 0,
      healthScore: this.getHealthScore().score,
    }
  }
}

let defaultMonitor: TTFBMonitor | null = null

export function getTTFBMonitor(maxMetrics?: number, thresholds?: TTFBThresholds): TTFBMonitor {
  if (!defaultMonitor) {
    defaultMonitor = new TTFBMonitor(maxMetrics, thresholds)
  }
  return defaultMonitor
}

export function createTTFBMonitor(maxMetrics?: number, thresholds?: TTFBThresholds): TTFBMonitor {
  return new TTFBMonitor(maxMetrics, thresholds)
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export interface TTFBAlert {
  type: 'high_ttfb' | 'low_success_rate' | 'low_cache_hit'
  severity: 'warning' | 'critical'
  message: string
  timestamp: number
  details: Record<string, unknown>
}

export function checkTTFBAlerts(
  monitor: TTFBMonitor,
  thresholds: TTFBThresholds = DEFAULT_TTFB_THRESHOLDS,
): TTFBAlert[] {
  const alerts: TTFBAlert[] = []
  const summary = monitor.getSummary()

  if (summary.averageTTFB > thresholds.poor) {
    alerts.push({
      type: 'high_ttfb',
      severity: 'critical',
      message: `Average TTFB is critically high: ${summary.averageTTFB}ms`,
      timestamp: Date.now(),
      details: { averageTTFB: summary.averageTTFB, threshold: thresholds.poor },
    })
  } else if (summary.averageTTFB > thresholds.fair) {
    alerts.push({
      type: 'high_ttfb',
      severity: 'warning',
      message: `Average TTFB is elevated: ${summary.averageTTFB}ms`,
      timestamp: Date.now(),
      details: { averageTTFB: summary.averageTTFB, threshold: thresholds.fair },
    })
  }

  const successRate = summary.totalRequests > 0
    ? summary.successfulRequests / summary.totalRequests
    : 1

  if (successRate < 0.9) {
    alerts.push({
      type: 'low_success_rate',
      severity: 'critical',
      message: `Low success rate: ${(successRate * 100).toFixed(1)}%`,
      timestamp: Date.now(),
      details: { successRate, successfulRequests: summary.successfulRequests, totalRequests: summary.totalRequests },
    })
  } else if (successRate < 0.95) {
    alerts.push({
      type: 'low_success_rate',
      severity: 'warning',
      message: `Success rate below optimal: ${(successRate * 100).toFixed(1)}%`,
      timestamp: Date.now(),
      details: { successRate, successfulRequests: summary.successfulRequests, totalRequests: summary.totalRequests },
    })
  }

  if (summary.cacheHitRate < 0.2 && summary.successfulRequests > 10) {
    alerts.push({
      type: 'low_cache_hit',
      severity: 'warning',
      message: `Low cache hit rate: ${(summary.cacheHitRate * 100).toFixed(1)}%`,
      timestamp: Date.now(),
      details: { cacheHitRate: summary.cacheHitRate },
    })
  }

  return alerts
}
