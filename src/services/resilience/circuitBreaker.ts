export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerConfig {
  failureThreshold: number
  successThreshold: number
  cooldownMs: number
  halfOpenMaxAttempts: number
  onStateChange?: (from: CircuitState, to: CircuitState) => void
  onFailure?: (error: Error, failures: number) => void
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  cooldownMs: 60000,
  halfOpenMaxAttempts: 1,
}

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  totalCalls: number
  totalFailures: number
  totalSuccesses: number
}

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures: number = 0
  private successes: number = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private openUntil: number = 0
  private halfOpenAttempts: number = 0
  private config: CircuitBreakerConfig
  private name: string

  private totalCalls: number = 0
  private totalFailures: number = 0
  private totalSuccesses: number = 0

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this.name, this.getRemainingCooldown())
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error as Error)
      throw error
    }
  }

  private canExecute(): boolean {
    const now = Date.now()

    switch (this.state) {
      case 'closed':
        return true

      case 'open':
        if (now >= this.openUntil) {
          this.transitionTo('half-open')
          return true
        }
        return false

      case 'half-open':
        return this.halfOpenAttempts < this.config.halfOpenMaxAttempts

      default:
        return false
    }
  }

  private onSuccess(): void {
    this.totalCalls++
    this.totalSuccesses++
    this.lastSuccessTime = Date.now()

    switch (this.state) {
      case 'closed':
        this.failures = 0
        break

      case 'half-open':
        this.successes++
        this.halfOpenAttempts++
        if (this.successes >= this.config.successThreshold) {
          this.transitionTo('closed')
        }
        break
    }
  }

  private onFailure(error: Error): void {
    this.totalCalls++
    this.totalFailures++
    this.failures++
    this.lastFailureTime = Date.now()

    this.config.onFailure?.(error, this.failures)

    switch (this.state) {
      case 'closed':
        if (this.failures >= this.config.failureThreshold) {
          this.transitionTo('open')
        }
        break

      case 'half-open':
        this.halfOpenAttempts++
        this.transitionTo('open')
        break
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state
    this.state = newState

    switch (newState) {
      case 'closed':
        this.failures = 0
        this.successes = 0
        this.halfOpenAttempts = 0
        break

      case 'open':
        this.openUntil = Date.now() + this.config.cooldownMs
        this.successes = 0
        this.halfOpenAttempts = 0
        break

      case 'half-open':
        this.successes = 0
        this.halfOpenAttempts = 0
        break
    }

    this.config.onStateChange?.(oldState, newState)
  }

  private getRemainingCooldown(): number {
    if (this.state !== 'open') return 0
    return Math.max(0, this.openUntil - Date.now())
  }

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() >= this.openUntil) {
      this.transitionTo('half-open')
    }
    return this.state
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    }
  }

  reset(): void {
    this.transitionTo('closed')
  }

  forceOpen(): void {
    this.transitionTo('open')
  }

  getName(): string {
    return this.name
  }

  isOpen(): boolean {
    return this.getState() === 'open'
  }

  isClosed(): boolean {
    return this.getState() === 'closed'
  }

  isHalfOpen(): boolean {
    return this.getState() === 'half-open'
  }
}

export class CircuitOpenError extends Error {
  readonly circuitName: string
  readonly remainingCooldownMs: number

  constructor(circuitName: string, remainingCooldownMs: number) {
    super(`Circuit "${circuitName}" is open. Retry after ${remainingCooldownMs}ms.`)
    this.name = 'CircuitOpenError'
    this.circuitName = circuitName
    this.remainingCooldownMs = remainingCooldownMs
  }
}

class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map()

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name)
    if (!breaker) {
      breaker = new CircuitBreaker(name, config)
      this.breakers.set(name, breaker)
    }
    return breaker
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name)
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers)
  }

  reset(name: string): boolean {
    const breaker = this.breakers.get(name)
    if (breaker) {
      breaker.reset()
      return true
    }
    return false
  }

  resetAll(): void {
    for (const breaker of Array.from(this.breakers.values())) {
      breaker.reset()
    }
  }

  getStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {}
    for (const [name, breaker] of Array.from(this.breakers)) {
      stats[name] = breaker.getStats()
    }
    return stats
  }
}

let registryInstance: CircuitBreakerRegistry | null = null

export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!registryInstance) {
    registryInstance = new CircuitBreakerRegistry()
  }
  return registryInstance
}

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return getCircuitBreakerRegistry().getOrCreate(name, config)
}

export const PRESET_CONFIGS = {
  compression: {
    failureThreshold: 3,
    successThreshold: 2,
    cooldownMs: 60000,
    halfOpenMaxAttempts: 1,
  },
  api: {
    failureThreshold: 5,
    successThreshold: 3,
    cooldownMs: 30000,
    halfOpenMaxAttempts: 2,
  },
  mcp: {
    failureThreshold: 3,
    successThreshold: 1,
    cooldownMs: 120000,
    halfOpenMaxAttempts: 1,
  },
  tool: {
    failureThreshold: 5,
    successThreshold: 2,
    cooldownMs: 15000,
    halfOpenMaxAttempts: 3,
  },
} as const

export type CircuitPreset = keyof typeof PRESET_CONFIGS

export function createCircuitBreaker(name: string, preset: CircuitPreset): CircuitBreaker {
  return new CircuitBreaker(name, PRESET_CONFIGS[preset])
}
