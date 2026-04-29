import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { JarvisMemory } from './memory'
import type { DreamResult } from './types'

export type DreamTrigger = 
  | 'idle_timeout'
  | 'night_window'
  | 'manual'
  | 'session_end'
  | 'memory_threshold'

export type DreamSchedulerConfig = {
  idleTimeoutMs: number
  nightWindowStart: number
  nightWindowEnd: number
  memoryThreshold: number
  maxDreamsPerDay: number
  enableIdleTrigger: boolean
  enableNightTrigger: boolean
  enableSessionEndTrigger: boolean
}

const DEFAULT_SCHEDULER_CONFIG: DreamSchedulerConfig = {
  idleTimeoutMs: 30 * 60 * 1000,
  nightWindowStart: 23,
  nightWindowEnd: 7,
  memoryThreshold: 100,
  maxDreamsPerDay: 3,
  enableIdleTrigger: true,
  enableNightTrigger: true,
  enableSessionEndTrigger: false,
}

export type IdleState = {
  lastActivity: Date
  isIdle: boolean
  idleDurationMs: number
}

export type NightWindowState = {
  isNightWindow: boolean
  currentHour: number
  timeUntilNightWindow: number
}

export type DreamTriggerResult = {
  shouldTrigger: boolean
  trigger: DreamTrigger | null
  reason: string
  metadata?: Record<string, unknown>
}

export class DreamScheduler {
  private config: DreamSchedulerConfig
  private memoryDir: string
  private memory: JarvisMemory
  private lastActivityPath: string
  private dreamCountPath: string
  private lastDreamDatePath: string
  private schedulerInterval: NodeJS.Timeout | null = null
  private onDreamCallback: ((trigger: DreamTrigger) => Promise<DreamResult[]>) | null = null

  constructor(
    memory: JarvisMemory,
    config: Partial<DreamSchedulerConfig> = {},
  ) {
    this.memory = memory
    this.memoryDir = memory.getMemoryDir()
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config }
    
    this.lastActivityPath = join(this.memoryDir, '.last_activity')
    this.dreamCountPath = join(this.memoryDir, '.dream_count')
    this.lastDreamDatePath = join(this.memoryDir, '.last_dream_date')
    
    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true })
    }
  }

  updateActivity(): void {
    writeFileSync(this.lastActivityPath, Date.now().toString(), 'utf-8')
  }

  getIdleState(): IdleState {
    if (!existsSync(this.lastActivityPath)) {
      return {
        lastActivity: new Date(),
        isIdle: false,
        idleDurationMs: 0,
      }
    }

    const lastActivityMs = parseInt(readFileSync(this.lastActivityPath, 'utf-8'), 10)
    const lastActivity = new Date(lastActivityMs)
    const idleDurationMs = Date.now() - lastActivityMs
    const isIdle = idleDurationMs >= this.config.idleTimeoutMs

    return {
      lastActivity,
      isIdle,
      idleDurationMs,
    }
  }

  getNightWindowState(): NightWindowState {
    const now = new Date()
    const currentHour = now.getHours()
    
    let isNightWindow: boolean
    if (this.config.nightWindowStart > this.config.nightWindowEnd) {
      isNightWindow = currentHour >= this.config.nightWindowStart || currentHour < this.config.nightWindowEnd
    } else {
      isNightWindow = currentHour >= this.config.nightWindowStart && currentHour < this.config.nightWindowEnd
    }

    let timeUntilNightWindow = 0
    if (!isNightWindow) {
      const nextNightStart = new Date(now)
      if (currentHour >= this.config.nightWindowStart) {
        nextNightStart.setDate(nextNightStart.getDate() + 1)
      }
      nextNightStart.setHours(this.config.nightWindowStart, 0, 0, 0)
      timeUntilNightWindow = nextNightStart.getTime() - now.getTime()
    }

    return {
      isNightWindow,
      currentHour,
      timeUntilNightWindow,
    }
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0]
  }

  private getDreamCountToday(): number {
    if (!existsSync(this.lastDreamDatePath) || !existsSync(this.dreamCountPath)) {
      return 0
    }

    const lastDreamDate = readFileSync(this.lastDreamDatePath, 'utf-8').trim()
    const today = this.getTodayDate()

    if (lastDreamDate !== today) {
      return 0
    }

    return parseInt(readFileSync(this.dreamCountPath, 'utf-8'), 10) || 0
  }

  private incrementDreamCount(): void {
    const today = this.getTodayDate()
    const currentCount = this.getDreamCountToday()
    
    writeFileSync(this.lastDreamDatePath, today, 'utf-8')
    writeFileSync(this.dreamCountPath, (currentCount + 1).toString(), 'utf-8')
  }

  checkTrigger(): DreamTriggerResult {
    const dreamCountToday = this.getDreamCountToday()
    if (dreamCountToday >= this.config.maxDreamsPerDay) {
      return {
        shouldTrigger: false,
        trigger: null,
        reason: `Max dreams per day reached (${dreamCountToday}/${this.config.maxDreamsPerDay})`,
      }
    }

    if (this.config.enableIdleTrigger) {
      const idleState = this.getIdleState()
      if (idleState.isIdle) {
        return {
          shouldTrigger: true,
          trigger: 'idle_timeout',
          reason: `Idle for ${Math.round(idleState.idleDurationMs / 60000)} minutes`,
          metadata: { idleDurationMs: idleState.idleDurationMs },
        }
      }
    }

    if (this.config.enableNightTrigger) {
      const nightState = this.getNightWindowState()
      if (nightState.isNightWindow) {
        return {
          shouldTrigger: true,
          trigger: 'night_window',
          reason: `Within night window (hour ${nightState.currentHour})`,
          metadata: { currentHour: nightState.currentHour },
        }
      }
    }

    return {
      shouldTrigger: false,
      trigger: null,
      reason: 'No trigger conditions met',
    }
  }

  checkMemoryThreshold(): DreamTriggerResult {
    const recentMemories = this.memory.getRecentSync(this.config.memoryThreshold + 10)
    
    if (recentMemories.length >= this.config.memoryThreshold) {
      return {
        shouldTrigger: true,
        trigger: 'memory_threshold',
        reason: `Memory count (${recentMemories.length}) exceeds threshold (${this.config.memoryThreshold})`,
        metadata: { memoryCount: recentMemories.length },
      }
    }

    return {
      shouldTrigger: false,
      trigger: null,
      reason: `Memory count (${recentMemories.length}) below threshold`,
    }
  }

  onDream(callback: (trigger: DreamTrigger) => Promise<DreamResult[]>): void {
    this.onDreamCallback = callback
  }

  startScheduler(checkIntervalMs: number = 60000): void {
    this.updateActivity()
    
    this.schedulerInterval = setInterval(async () => {
      const triggerResult = this.checkTrigger()
      
      if (triggerResult.shouldTrigger && triggerResult.trigger && this.onDreamCallback) {
        try {
          await this.onDreamCallback(triggerResult.trigger)
          this.incrementDreamCount()
          this.updateActivity()
        } catch (error) {
          console.error('Dream scheduler error:', error)
        }
      }
    }, checkIntervalMs)
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
    }
  }

  async triggerManual(): Promise<DreamResult[] | null> {
    if (!this.onDreamCallback) {
      return null
    }

    const result = await this.onDreamCallback('manual')
    this.incrementDreamCount()
    return result
  }

  async triggerSessionEnd(): Promise<DreamResult[] | null> {
    if (!this.config.enableSessionEndTrigger || !this.onDreamCallback) {
      return null
    }

    const result = await this.onDreamCallback('session_end')
    this.incrementDreamCount()
    return result
  }

  getStatus(): {
    idleState: IdleState
    nightWindowState: NightWindowState
    dreamCountToday: number
    maxDreamsPerDay: number
    schedulerRunning: boolean
  } {
    return {
      idleState: this.getIdleState(),
      nightWindowState: this.getNightWindowState(),
      dreamCountToday: this.getDreamCountToday(),
      maxDreamsPerDay: this.config.maxDreamsPerDay,
      schedulerRunning: this.schedulerInterval !== null,
    }
  }
}

export function createDreamScheduler(
  memory: JarvisMemory,
  config?: Partial<DreamSchedulerConfig>,
): DreamScheduler {
  return new DreamScheduler(memory, config)
}
