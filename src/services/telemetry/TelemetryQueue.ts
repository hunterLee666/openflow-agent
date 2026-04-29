import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { homedir } from 'node:os'

export interface TelemetryEvent {
  name: string
  timestamp: string
  sessionId: string
  properties?: Record<string, string | number | boolean | undefined>
  measurements?: Record<string, number>
}

export interface TelemetryConfig {
  enabled: boolean
  endpoint?: string
  batchSize: number
  flushIntervalMs: number
  maxQueueSize: number
  offlineStorage: boolean
  offlineStoragePath?: string
  sampleRate: number
  anonymizePaths: boolean
  piiFields: Set<string>
}

export const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  batchSize: 100,
  flushIntervalMs: 30000,
  maxQueueSize: 10000,
  offlineStorage: true,
  sampleRate: 1.0,
  anonymizePaths: true,
  piiFields: new Set([
    'prompt',
    'response',
    'apiKey',
    'email',
    'username',
    'password',
    'token',
    'secret',
    'content',
    'message',
    'input',
    'output',
  ]),
}

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-ant-[a-zA-Z0-9-]{20,}/g,
  /api[_-]?key[=:]\s*\S+/gi,
  /bearer\s+[a-zA-Z0-9._-]+/gi,
]

export class TelemetryQueue {
  private buffer: TelemetryEvent[] = []
  private offlineBuffer: TelemetryEvent[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private isFlushing = false
  private config: TelemetryConfig
  private sessionId: string
  private cliVersion: string
  private os: string
  private anonymousId: string
  private storagePath: string

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.sessionId = generateSessionId()
    this.cliVersion = getCliVersion()
    this.os = getOsInfo()
    this.anonymousId = getOrCreateAnonymousId()
    this.storagePath = this.config.offlineStoragePath || path.join(homedir(), '.agent', 'telemetry', 'offline.json')

    this.startFlushTimer()
    this.loadOfflineBuffer()
  }

  track(name: string, properties?: Record<string, unknown>, measurements?: Record<string, number>): void {
    if (!this.config.enabled) return
    if (!this.shouldSample()) return

    const sanitizedProps = this.sanitizeProperties(properties)
    const event: TelemetryEvent = {
      name,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: sanitizedProps,
      measurements,
    }

    this.buffer.push(event)

    if (this.buffer.length >= this.config.batchSize) {
      this.flush()
    }

    if (this.buffer.length > this.config.maxQueueSize) {
      this.buffer = this.buffer.slice(-this.config.maxQueueSize)
    }
  }

  trackPerformance(name: string, durationMs: number, properties?: Record<string, unknown>): void {
    this.track(`perf.${name}`, properties, { durationMs })
  }

  trackError(error: Error, context?: Record<string, unknown>): void {
    this.track('error', {
      errorType: error.name,
      errorMessage: this.anonymizeMessage(error.message),
      ...context,
    })
  }

  trackToolUse(toolName: string, success: boolean, durationMs: number, properties?: Record<string, unknown>): void {
    this.track('tool_use', {
      toolName,
      success,
      ...properties,
    }, { durationMs })
  }

  trackQuery(modelId: string, inputTokens: number, outputTokens: number, costUsd: number, properties?: Record<string, unknown>): void {
    this.track('query', {
      modelId,
      ...properties,
    }, {
      inputTokens,
      outputTokens,
      costUsd,
    })
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return
    this.isFlushing = true

    const batch = this.buffer.splice(0, this.buffer.length)

    try {
      await this.sendBatch(batch)
    } catch (error) {
      console.warn('[Telemetry] Flush failed, storing offline:', error)
      this.offlineBuffer.push(...batch)
      await this.saveOfflineBuffer()
    } finally {
      this.isFlushing = false
    }
  }

  async flushAll(): Promise<void> {
    await this.flush()

    if (this.offlineBuffer.length > 0) {
      const batch = this.offlineBuffer.splice(0, this.offlineBuffer.length)
      try {
        await this.sendBatch(batch)
      } catch (error) {
        this.offlineBuffer.push(...batch)
        await this.saveOfflineBuffer()
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  getSessionId(): string {
    return this.sessionId
  }

  getAnonymousId(): string {
    return this.anonymousId
  }

  getQueueSize(): number {
    return this.buffer.length
  }

  private shouldSample(): boolean {
    if (this.config.sampleRate >= 1) return true
    return Math.random() < this.config.sampleRate
  }

  private sanitizeProperties(props?: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
    if (!props) return {}

    const sanitized: Record<string, string | number | boolean | undefined> = {}

    for (const [key, value] of Object.entries(props)) {
      if (this.config.piiFields.has(key.toLowerCase())) {
        continue
      }

      if (typeof value === 'string') {
        sanitized[key] = this.anonymizeMessage(value)
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (value === null || value === undefined) {
        sanitized[key] = undefined
      } else {
        sanitized[key] = '[REDACTED]'
      }
    }

    return sanitized
  }

  private anonymizeMessage(message: string): string {
    let result = message

    for (const pattern of PII_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]')
    }

    if (this.config.anonymizePaths) {
      result = result.replace(/\/[^\s]+/g, (match) => {
        if (match.length > 20) {
          return path.dirname(match) + '/[ANONYMIZED]'
        }
        return match
      })
    }

    return result
  }

  private async sendBatch(events: TelemetryEvent[]): Promise<void> {
    if (!this.config.endpoint) return

    const payload = {
      events: events.map(e => ({
        ...e,
        cliVersion: this.cliVersion,
        os: this.os,
        anonymousId: this.anonymousId,
      })),
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Telemetry send failed: ${response.status}`)
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(err => console.warn('[Telemetry] Timer flush error:', err))
    }, this.config.flushIntervalMs)
  }

  private async loadOfflineBuffer(): Promise<void> {
    if (!this.config.offlineStorage) return

    try {
      const data = await fs.readFile(this.storagePath, 'utf8')
      const events = JSON.parse(data) as TelemetryEvent[]
      this.offlineBuffer = events
    } catch {
      this.offlineBuffer = []
    }
  }

  private async saveOfflineBuffer(): Promise<void> {
    if (!this.config.offlineStorage) return

    try {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true })
      await fs.writeFile(this.storagePath, JSON.stringify(this.offlineBuffer), 'utf8')
    } catch (error) {
      console.warn('[Telemetry] Failed to save offline buffer:', error)
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }
}

function generateSessionId(): string {
  return crypto.randomBytes(16).toString('hex')
}

function getCliVersion(): string {
  try {
    const pkg = require('../../../package.json')
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

function getOsInfo(): string {
  return `${process.platform}-${process.arch}`
}

function getOrCreateAnonymousId(): string {
  const idPath = path.join(homedir(), '.agent', 'telemetry', 'id')

  try {
    const existing = require('fs').readFileSync(idPath, 'utf8').trim()
    if (existing && existing.length === 64) {
      return existing
    }
  } catch {}

  const newId = crypto.randomBytes(32).toString('hex')

  try {
    require('fs').mkdirSync(path.dirname(idPath), { recursive: true })
    require('fs').writeFileSync(idPath, newId, 'utf8')
  } catch {}

  return newId
}

let instance: TelemetryQueue | null = null

export function getTelemetryQueue(config?: Partial<TelemetryConfig>): TelemetryQueue {
  if (!instance) {
    instance = new TelemetryQueue(config)
  }
  return instance
}

export function resetTelemetryQueue(config?: Partial<TelemetryConfig>): TelemetryQueue {
  if (instance) {
    instance.destroy()
  }
  instance = new TelemetryQueue(config)
  return instance
}

export function trackEvent(name: string, properties?: Record<string, unknown>, measurements?: Record<string, number>): void {
  getTelemetryQueue().track(name, properties, measurements)
}

export function trackPerformance(name: string, durationMs: number, properties?: Record<string, unknown>): void {
  getTelemetryQueue().trackPerformance(name, durationMs, properties)
}

export function span<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  return fn().finally(() => {
    const duration = performance.now() - start
    trackPerformance(name, duration)
  })
}
