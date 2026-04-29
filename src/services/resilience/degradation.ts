export type DegradationLevel =
  | 'normal'
  | 'economy_model'
  | 'truncated_history'
  | 'mcp_disabled'
  | 'read_only'
  | 'minimal'

export interface DegradationState {
  level: DegradationLevel
  reason: string
  timestamp: number
  previousLevel?: DegradationLevel
  userMessage?: string
}

export interface DegradationConfig {
  modelFallbackChain: string[]
  maxHistoryTokens: number
  enableMCP: boolean
  enableWriteTools: boolean
  enableNetworkTools: boolean
}

export const DEGRADATION_MESSAGES: Record<DegradationLevel, string> = {
  normal: 'Operating normally',
  economy_model: 'Switched to economy model for cost optimization',
  truncated_history: 'Earlier conversation history has been truncated',
  mcp_disabled: 'External MCP tools are temporarily unavailable',
  read_only: 'Running in read-only mode - file writes disabled',
  minimal: 'Running in minimal mode - limited functionality',
}

export const DEGRADATION_LEVELS: DegradationLevel[] = [
  'normal',
  'economy_model',
  'truncated_history',
  'mcp_disabled',
  'read_only',
  'minimal',
]

class DegradationManager {
  private currentLevel: DegradationLevel = 'normal'
  private history: DegradationState[] = []
  private onLevelChange?: (state: DegradationState) => void
  private config: DegradationConfig = {
    modelFallbackChain: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    maxHistoryTokens: 8000,
    enableMCP: true,
    enableWriteTools: true,
    enableNetworkTools: true,
  }

  degrade(reason: string, targetLevel?: DegradationLevel): DegradationState {
    const currentIndex = DEGRADATION_LEVELS.indexOf(this.currentLevel)
    const newLevel = targetLevel ?? DEGRADATION_LEVELS[currentIndex + 1] ?? 'minimal'

    if (DEGRADATION_LEVELS.indexOf(newLevel) <= currentIndex) {
      return this.getCurrentState()
    }

    const previousLevel = this.currentLevel
    this.currentLevel = newLevel

    const state: DegradationState = {
      level: newLevel,
      reason,
      timestamp: Date.now(),
      previousLevel,
      userMessage: DEGRADATION_MESSAGES[newLevel],
    }

    this.history.push(state)
    this.applyLevel(newLevel)
    this.onLevelChange?.(state)

    return state
  }

  recover(reason: string, targetLevel?: DegradationLevel): DegradationState {
    const currentIndex = DEGRADATION_LEVELS.indexOf(this.currentLevel)
    if (currentIndex === 0) {
      return this.getCurrentState()
    }

    const newLevel = targetLevel ?? DEGRADATION_LEVELS[currentIndex - 1] ?? 'normal'
    const previousLevel = this.currentLevel
    this.currentLevel = newLevel

    const state: DegradationState = {
      level: newLevel,
      reason,
      timestamp: Date.now(),
      previousLevel,
      userMessage: newLevel === 'normal' ? undefined : DEGRADATION_MESSAGES[newLevel],
    }

    this.history.push(state)
    this.applyLevel(newLevel)
    this.onLevelChange?.(state)

    return state
  }

  reset(): DegradationState {
    return this.recover('System reset', 'normal')
  }

  private applyLevel(level: DegradationLevel): void {
    switch (level) {
      case 'normal':
        this.config.enableMCP = true
        this.config.enableWriteTools = true
        this.config.enableNetworkTools = true
        this.config.maxHistoryTokens = 128000
        break

      case 'economy_model':
        this.config.enableMCP = true
        this.config.enableWriteTools = true
        this.config.enableNetworkTools = true
        this.config.maxHistoryTokens = 32000
        break

      case 'truncated_history':
        this.config.enableMCP = true
        this.config.enableWriteTools = true
        this.config.enableNetworkTools = true
        this.config.maxHistoryTokens = 8000
        break

      case 'mcp_disabled':
        this.config.enableMCP = false
        this.config.enableWriteTools = true
        this.config.enableNetworkTools = true
        this.config.maxHistoryTokens = 8000
        break

      case 'read_only':
        this.config.enableMCP = false
        this.config.enableWriteTools = false
        this.config.enableNetworkTools = true
        this.config.maxHistoryTokens = 4000
        break

      case 'minimal':
        this.config.enableMCP = false
        this.config.enableWriteTools = false
        this.config.enableNetworkTools = false
        this.config.maxHistoryTokens = 2000
        break
    }
  }

  getCurrentState(): DegradationState {
    return {
      level: this.currentLevel,
      reason: 'Current state',
      timestamp: Date.now(),
      userMessage: DEGRADATION_MESSAGES[this.currentLevel],
    }
  }

  getCurrentLevel(): DegradationLevel {
    return this.currentLevel
  }

  getConfig(): DegradationConfig {
    return { ...this.config }
  }

  getHistory(): DegradationState[] {
    return [...this.history]
  }

  setOnLevelChange(callback: (state: DegradationState) => void): void {
    this.onLevelChange = callback
  }

  isNormal(): boolean {
    return this.currentLevel === 'normal'
  }

  isDegraded(): boolean {
    return this.currentLevel !== 'normal'
  }

  isReadOnly(): boolean {
    return (
      this.currentLevel === 'read_only' ||
      this.currentLevel === 'minimal'
    )
  }

  isMCPEnabled(): boolean {
    return this.config.enableMCP
  }

  canWrite(): boolean {
    return this.config.enableWriteTools
  }

  canUseNetwork(): boolean {
    return this.config.enableNetworkTools
  }

  getFallbackModel(currentModel: string): string | undefined {
    if (this.currentLevel === 'normal') {
      return undefined
    }

    const chain = this.config.modelFallbackChain
    const currentIndex = chain.indexOf(currentModel)

    if (currentIndex === -1) {
      return chain[0]
    }

    return chain[currentIndex + 1]
  }

  getMaxHistoryTokens(): number {
    return this.config.maxHistoryTokens
  }
}

let managerInstance: DegradationManager | null = null

export function getDegradationManager(): DegradationManager {
  if (!managerInstance) {
    managerInstance = new DegradationManager()
  }
  return managerInstance
}

export function degradeSystem(reason: string, targetLevel?: DegradationLevel): DegradationState {
  return getDegradationManager().degrade(reason, targetLevel)
}

export function recoverSystem(reason: string, targetLevel?: DegradationLevel): DegradationState {
  return getDegradationManager().recover(reason, targetLevel)
}

export function resetDegradation(): DegradationState {
  return getDegradationManager().reset()
}

export function getCurrentDegradationLevel(): DegradationLevel {
  return getDegradationManager().getCurrentLevel()
}

export function isSystemDegraded(): boolean {
  return getDegradationManager().isDegraded()
}

export function isSystemReadOnly(): boolean {
  return getDegradationManager().isReadOnly()
}

export function getDegradationConfig(): DegradationConfig {
  return getDegradationManager().getConfig()
}

export function withDegradationCheck<T>(
  operation: string,
  fn: () => Promise<T>,
  fallback?: () => Promise<T>,
): Promise<T> {
  const manager = getDegradationManager()

  if (manager.isNormal()) {
    return fn()
  }

  if (fallback) {
    return fallback()
  }

  throw new Error(`Operation "${operation}" not available in ${manager.getCurrentLevel()} mode`)
}
