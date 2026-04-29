export type AlertSeverity = 'P1' | 'P2' | 'P3' | 'P4'

export type AlertChannel = 'phone' | 'sms' | 'email' | 'im' | 'ticket' | 'log'

export interface AlertRule {
  id: string
  name: string
  description: string
  severity: AlertSeverity
  condition: AlertCondition
  channels: AlertChannel[]
  cooldownMs: number
  enabled: boolean
}

export interface AlertCondition {
  metric: string
  operator: '>' | '<' | '>=' | '<=' | '==' | '!='
  threshold: number
  durationMs?: number
}

export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  severity: AlertSeverity
  message: string
  timestamp: number
  value: number
  threshold: number
  channels: AlertChannel[]
  acknowledged: boolean
  acknowledgedAt?: number
  acknowledgedBy?: string
  resolved: boolean
  resolvedAt?: number
}

export interface AlertConfig {
  enabled: boolean
  defaultChannels: AlertChannel[]
  maxActiveAlerts: number
  retentionMs: number
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  defaultChannels: ['log', 'im'],
  maxActiveAlerts: 100,
  retentionMs: 86400000,
}

const SEVERITY_CHANNELS: Record<AlertSeverity, AlertChannel[]> = {
  P1: ['phone', 'sms', 'im'],
  P2: ['im', 'email'],
  P3: ['email', 'ticket'],
  P4: ['log', 'ticket'],
}

const SEVERITY_RESPONSE_TIMES: Record<AlertSeverity, number> = {
  P1: 5 * 60 * 1000,
  P2: 30 * 60 * 1000,
  P3: 4 * 60 * 60 * 1000,
  P4: 24 * 60 * 60 * 1000,
}

class AlertManager {
  private rules: Map<string, AlertRule> = new Map()
  private activeAlerts: Map<string, Alert> = new Map()
  private alertHistory: Alert[] = []
  private config: AlertConfig
  private lastTriggered: Map<string, number> = new Map()
  private onAlert?: (alert: Alert) => void
  private onAlertResolve?: (alert: Alert) => void

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initializeDefaultRules()
  }

  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'success_rate_critical',
        name: 'Success Rate Critical',
        description: 'Turn success rate below 90% for 10 minutes',
        severity: 'P1',
        condition: {
          metric: 'turn_success_rate',
          operator: '<',
          threshold: 90,
          durationMs: 600000,
        },
        channels: SEVERITY_CHANNELS.P1,
        cooldownMs: 300000,
        enabled: true,
      },
      {
        id: 'latency_p95_high',
        name: 'P95 Latency High',
        description: 'P95 latency above 30s for 20 minutes',
        severity: 'P2',
        condition: {
          metric: 'api_latency_p95',
          operator: '>',
          threshold: 30000,
          durationMs: 1200000,
        },
        channels: SEVERITY_CHANNELS.P2,
        cooldownMs: 600000,
        enabled: true,
      },
      {
        id: 'tool_failure_spike',
        name: 'Tool Failure Spike',
        description: 'Single tool failure rate spiked',
        severity: 'P3',
        condition: {
          metric: 'tool_failure_rate',
          operator: '>',
          threshold: 20,
        },
        channels: SEVERITY_CHANNELS.P3,
        cooldownMs: 900000,
        enabled: true,
      },
      {
        id: 'circuit_breaker_open',
        name: 'Circuit Breaker Open',
        description: 'A circuit breaker has opened',
        severity: 'P2',
        condition: {
          metric: 'circuit_breaker_state',
          operator: '==',
          threshold: 1,
        },
        channels: SEVERITY_CHANNELS.P2,
        cooldownMs: 300000,
        enabled: true,
      },
      {
        id: 'memory_high',
        name: 'Memory Usage High',
        description: 'Memory usage above 85%',
        severity: 'P3',
        condition: {
          metric: 'memory_usage_percent',
          operator: '>',
          threshold: 85,
        },
        channels: SEVERITY_CHANNELS.P3,
        cooldownMs: 600000,
        enabled: true,
      },
      {
        id: 'rate_limit_429',
        name: 'Rate Limit Exceeded',
        description: '429 error rate above 10%',
        severity: 'P2',
        condition: {
          metric: 'rate_429_percent',
          operator: '>',
          threshold: 10,
        },
        channels: SEVERITY_CHANNELS.P2,
        cooldownMs: 300000,
        enabled: true,
      },
    ]

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule)
    }
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule)
  }

  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId)
  }

  enableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId)
    if (rule) {
      rule.enabled = true
      return true
    }
    return false
  }

  disableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId)
    if (rule) {
      rule.enabled = false
      return true
    }
    return false
  }

  checkMetric(metric: string, value: number): Alert | null {
    for (const rule of Array.from(this.rules.values())) {
      if (!rule.enabled || rule.condition.metric !== metric) {
        continue
      }

      if (this.isInCooldown(rule.id)) {
        continue
      }

      if (this.evaluateCondition(rule.condition, value)) {
        return this.triggerAlert(rule, value)
      }
    }

    return null
  }

  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case '>':
        return value > condition.threshold
      case '<':
        return value < condition.threshold
      case '>=':
        return value >= condition.threshold
      case '<=':
        return value <= condition.threshold
      case '==':
        return value === condition.threshold
      case '!=':
        return value !== condition.threshold
      default:
        return false
    }
  }

  private isInCooldown(ruleId: string): boolean {
    const lastTriggered = this.lastTriggered.get(ruleId)
    if (!lastTriggered) return false

    const rule = this.rules.get(ruleId)
    if (!rule) return false

    return Date.now() - lastTriggered < rule.cooldownMs
  }

  private triggerAlert(rule: AlertRule, value: number): Alert {
    const alert: Alert = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.condition.metric} ${rule.condition.operator} ${rule.condition.threshold} (current: ${value})`,
      timestamp: Date.now(),
      value,
      threshold: rule.condition.threshold,
      channels: rule.channels,
      acknowledged: false,
      resolved: false,
    }

    this.activeAlerts.set(alert.id, alert)
    this.alertHistory.push(alert)
    this.lastTriggered.set(rule.id, Date.now())

    if (this.activeAlerts.size > this.config.maxActiveAlerts) {
      const oldest = Array.from(this.activeAlerts.keys())[0]
      this.activeAlerts.delete(oldest)
    }

    this.onAlert?.(alert)

    return alert
  }

  acknowledge(alertId: string, by?: string): boolean {
    const alert = this.activeAlerts.get(alertId)
    if (!alert || alert.acknowledged) return false

    alert.acknowledged = true
    alert.acknowledgedAt = Date.now()
    alert.acknowledgedBy = by

    return true
  }

  resolve(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId)
    if (!alert || alert.resolved) return false

    alert.resolved = true
    alert.resolvedAt = Date.now()
    this.activeAlerts.delete(alertId)

    this.onAlertResolve?.(alert)

    return true
  }

  resolveAll(): number {
    let resolved = 0
    for (const [id] of Array.from(this.activeAlerts)) {
      if (this.resolve(id)) {
        resolved++
      }
    }
    return resolved
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
  }

  getAlert(alertId: string): Alert | undefined {
    return this.activeAlerts.get(alertId) ?? this.alertHistory.find(a => a.id === alertId)
  }

  getAlertHistory(since?: number): Alert[] {
    if (since) {
      return this.alertHistory.filter(a => a.timestamp >= since)
    }
    return [...this.alertHistory]
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values())
  }

  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId)
  }

  setOnAlert(callback: (alert: Alert) => void): void {
    this.onAlert = callback
  }

  setOnAlertResolve(callback: (alert: Alert) => void): void {
    this.onAlertResolve = callback
  }

  getStats(): {
    active: number
    bySeverity: Record<AlertSeverity, number>
    acknowledged: number
    unacknowledged: number
  } {
    const bySeverity: Record<AlertSeverity, number> = { P1: 0, P2: 0, P3: 0, P4: 0 }
    let acknowledged = 0
    let unacknowledged = 0

    for (const alert of Array.from(this.activeAlerts.values())) {
      bySeverity[alert.severity]++
      if (alert.acknowledged) {
        acknowledged++
      } else {
        unacknowledged++
      }
    }

    return {
      active: this.activeAlerts.size,
      bySeverity,
      acknowledged,
      unacknowledged,
    }
  }

  clearHistory(): void {
    this.alertHistory = []
  }

  clearExpired(): number {
    const cutoff = Date.now() - this.config.retentionMs
    const before = this.alertHistory.length
    this.alertHistory = this.alertHistory.filter(a => a.timestamp >= cutoff)
    return before - this.alertHistory.length
  }
}

let managerInstance: AlertManager | null = null

export function getAlertManager(): AlertManager {
  if (!managerInstance) {
    managerInstance = new AlertManager()
  }
  return managerInstance
}

export function checkAlertMetric(metric: string, value: number): Alert | null {
  return getAlertManager().checkMetric(metric, value)
}

export function acknowledgeAlert(alertId: string, by?: string): boolean {
  return getAlertManager().acknowledge(alertId, by)
}

export function resolveAlert(alertId: string): boolean {
  return getAlertManager().resolve(alertId)
}

export function getActiveAlerts(): Alert[] {
  return getAlertManager().getActiveAlerts()
}

export function addAlertRule(rule: AlertRule): void {
  getAlertManager().addRule(rule)
}

export function getAlertStats(): ReturnType<AlertManager['getStats']> {
  return getAlertManager().getStats()
}

export { SEVERITY_CHANNELS, SEVERITY_RESPONSE_TIMES }
