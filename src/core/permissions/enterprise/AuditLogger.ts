export type AuditEventType =
  | 'permission_granted'
  | 'permission_denied'
  | 'permission_asked'
  | 'mode_changed'
  | 'rule_added'
  | 'rule_removed'
  | 'role_assigned'
  | 'role_revoked'
  | 'bypass_activated'
  | 'sandbox_violation'
  | 'sensitive_content_detected'
  | 'classifier_decision'
  | 'pipeline_step'
  | 'fail_closed_triggered'

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface AuditEvent {
  id: string
  timestamp: string
  type: AuditEventType
  severity: AuditSeverity
  userId?: string
  sessionId?: string
  toolName?: string
  resource?: string
  action?: string
  decision?: 'allow' | 'deny' | 'ask'
  reason?: string
  metadata?: Record<string, unknown>
}

export interface AuditLogConfig {
  enabled: boolean
  maxEvents: number
  retentionDays: number
  logToFile: boolean
  logToConsole: boolean
  logToRemote: boolean
  remoteEndpoint?: string
  sensitiveFields: string[]
}

export const DEFAULT_AUDIT_CONFIG: AuditLogConfig = {
  enabled: true,
  maxEvents: 10000,
  retentionDays: 90,
  logToFile: true,
  logToConsole: true,
  logToRemote: false,
  sensitiveFields: [
    'password',
    'apiKey',
    'secret',
    'token',
    'privateKey',
    'credential',
  ],
}

export class AuditLogger {
  private config: AuditLogConfig
  private events: AuditEvent[] = []
  private eventCounter = 0

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config }
  }

  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    if (!this.config.enabled) {
      return
    }

    const fullEvent: AuditEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
    }

    this.sanitizeEvent(fullEvent)

    this.events.push(fullEvent)

    if (this.events.length > this.config.maxEvents) {
      this.events.shift()
    }

    if (this.config.logToConsole) {
      this.logToConsole(fullEvent)
    }

    if (this.config.logToFile) {
      this.logToFile(fullEvent)
    }

    if (this.config.logToRemote && this.config.remoteEndpoint) {
      this.logToRemote(fullEvent)
    }
  }

  logPermissionGranted(
    userId: string,
    toolName: string,
    resource: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'permission_granted',
      severity: 'low',
      userId,
      toolName,
      resource,
      decision: 'allow',
      reason,
      metadata,
    })
  }

  logPermissionDenied(
    userId: string,
    toolName: string,
    resource: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'permission_denied',
      severity: 'high',
      userId,
      toolName,
      resource,
      decision: 'deny',
      reason,
      metadata,
    })
  }

  logPermissionAsked(
    userId: string,
    toolName: string,
    resource: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'permission_asked',
      severity: 'medium',
      userId,
      toolName,
      resource,
      decision: 'ask',
      reason,
      metadata,
    })
  }

  logModeChanged(
    userId: string,
    fromMode: string,
    toMode: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'mode_changed',
      severity: 'medium',
      userId,
      action: `Changed from ${fromMode} to ${toMode}`,
      metadata: {
        fromMode,
        toMode,
        ...metadata,
      },
    })
  }

  logBypassActivated(
    userId: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'bypass_activated',
      severity: 'critical',
      userId,
      action: 'Bypass permissions activated',
      reason,
      metadata,
    })
  }

  logSensitiveContentDetected(
    userId: string,
    toolName: string,
    contentType: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'sensitive_content_detected',
      severity: 'high',
      userId,
      toolName,
      action: `Sensitive content detected: ${contentType}`,
      metadata,
    })
  }

  logFailClosedTriggered(
    reason: string,
    context: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'fail_closed_triggered',
      severity: 'high',
      action: 'Fail-closed mechanism triggered',
      reason: `${reason} in ${context}`,
      metadata,
    })
  }

  getEvents(filter?: {
    type?: AuditEventType
    userId?: string
    severity?: AuditSeverity
    startDate?: string
    endDate?: string
  }): AuditEvent[] {
    let filtered = [...this.events]

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter((e) => e.type === filter.type)
      }

      if (filter.userId) {
        filtered = filtered.filter((e) => e.userId === filter.userId)
      }

      if (filter.severity) {
        filtered = filtered.filter((e) => e.severity === filter.severity)
      }

      if (filter.startDate) {
        const start = new Date(filter.startDate)
        filtered = filtered.filter((e) => new Date(e.timestamp) >= start)
      }

      if (filter.endDate) {
        const end = new Date(filter.endDate)
        filtered = filtered.filter((e) => new Date(e.timestamp) <= end)
      }
    }

    return filtered
  }

  getStatistics(): {
    totalEvents: number
    eventsByType: Record<AuditEventType, number>
    eventsBySeverity: Record<AuditSeverity, number>
    eventsByUser: Record<string, number>
  } {
    const eventsByType: Record<string, number> = {}
    const eventsBySeverity: Record<string, number> = {}
    const eventsByUser: Record<string, number> = {}

    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1
      if (event.userId) {
        eventsByUser[event.userId] = (eventsByUser[event.userId] || 0) + 1
      }
    }

    return {
      totalEvents: this.events.length,
      eventsByType: eventsByType as Record<AuditEventType, number>,
      eventsBySeverity: eventsBySeverity as Record<AuditSeverity, number>,
      eventsByUser,
    }
  }

  clearOldEvents(): number {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays)

    const initialLength = this.events.length
    this.events = this.events.filter(
      (e) => new Date(e.timestamp) >= cutoffDate,
    )

    return initialLength - this.events.length
  }

  export(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.events, null, 2)
    }

    const headers = [
      'id',
      'timestamp',
      'type',
      'severity',
      'userId',
      'toolName',
      'resource',
      'decision',
      'reason',
    ]

    const rows = this.events.map((e) =>
      [
        e.id,
        e.timestamp,
        e.type,
        e.severity,
        e.userId || '',
        e.toolName || '',
        e.resource || '',
        e.decision || '',
        e.reason || '',
      ].join(','),
    )

    return [headers.join(','), ...rows].join('\n')
  }

  private generateEventId(): string {
    this.eventCounter++
    return `audit-${Date.now()}-${this.eventCounter}`
  }

  private sanitizeEvent(event: AuditEvent): void {
    if (!event.metadata) return

    for (const field of this.config.sensitiveFields) {
      if (event.metadata[field]) {
        event.metadata[field] = '[REDACTED]'
      }
    }

    if (event.resource) {
      for (const field of this.config.sensitiveFields) {
        if (event.resource.toLowerCase().includes(field.toLowerCase())) {
          event.resource = '[REDACTED]'
          break
        }
      }
    }
  }

  private logToConsole(event: AuditEvent): void {
    const prefix = `[AUDIT][${event.severity.toUpperCase()}]`
    console.log(
      `${prefix} ${event.type}: ${event.reason || event.action || 'No details'}`,
    )
  }

  private logToFile(_event: AuditEvent): void {
    // Implementation would write to a log file
    // For now, we'll just stub this out
  }

  private async logToRemote(event: AuditEvent): Promise<void> {
    if (!this.config.remoteEndpoint) return

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      })
    } catch (error) {
      console.error('Failed to send audit log to remote:', error)
    }
  }

  updateConfig(updates: Partial<AuditLogConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  getConfig(): AuditLogConfig {
    return { ...this.config }
  }
}
