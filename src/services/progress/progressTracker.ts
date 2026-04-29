export type ProgressPhase =
  | 'initializing'
  | 'planning'
  | 'thinking'
  | 'tooling'
  | 'summarizing'
  | 'waiting'
  | 'completed'
  | 'error'

export interface ProgressUpdate {
  phase: ProgressPhase
  step: number
  message: string
  ts: number
  etaMs?: number
  percent?: number
  details?: Record<string, unknown>
}

export interface ProgressTracker {
  id: string
  agentId: string
  parentId?: string
  startTime: number
  lastUpdate: ProgressUpdate
  history: ProgressUpdate[]
  isComplete: boolean
  error?: Error
}

export type ProgressCallback = (progress: ProgressUpdate, tracker: ProgressTracker) => void

class ProgressManager {
  private trackers: Map<string, ProgressTracker> = new Map()
  private callbacks: Set<ProgressCallback> = new Set()
  private maxHistorySize: number = 100

  createTracker(agentId: string, parentId?: string): ProgressTracker {
    const id = `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()

    const tracker: ProgressTracker = {
      id,
      agentId,
      parentId,
      startTime: now,
      lastUpdate: {
        phase: 'initializing',
        step: 0,
        message: 'Initializing...',
        ts: now,
      },
      history: [],
      isComplete: false,
    }

    this.trackers.set(id, tracker)
    return tracker
  }

  updateProgress(
    trackerId: string,
    update: Partial<Omit<ProgressUpdate, 'ts'>>,
  ): ProgressTracker | undefined {
    const tracker = this.trackers.get(trackerId)
    if (!tracker || tracker.isComplete) return undefined

    const now = Date.now()
    const fullUpdate: ProgressUpdate = {
      phase: update.phase ?? tracker.lastUpdate.phase,
      step: update.step ?? tracker.lastUpdate.step + 1,
      message: update.message ?? tracker.lastUpdate.message,
      ts: now,
      etaMs: update.etaMs,
      percent: update.percent,
      details: update.details,
    }

    tracker.history.push(tracker.lastUpdate)
    if (tracker.history.length > this.maxHistorySize) {
      tracker.history.shift()
    }

    tracker.lastUpdate = fullUpdate

    if (fullUpdate.phase === 'completed' || fullUpdate.phase === 'error') {
      tracker.isComplete = true
    }

    this.notifyCallbacks(fullUpdate, tracker)
    return tracker
  }

  setPhase(trackerId: string, phase: ProgressPhase, message?: string): ProgressTracker | undefined {
    return this.updateProgress(trackerId, { phase, message })
  }

  setStep(trackerId: string, step: number, message?: string): ProgressTracker | undefined {
    return this.updateProgress(trackerId, { step, message })
  }

  setPercent(trackerId: string, percent: number, message?: string): ProgressTracker | undefined {
    return this.updateProgress(trackerId, { percent, message })
  }

  setEta(trackerId: string, etaMs: number, message?: string): ProgressTracker | undefined {
    return this.updateProgress(trackerId, { etaMs, message })
  }

  complete(trackerId: string, message: string = 'Completed'): ProgressTracker | undefined {
    return this.updateProgress(trackerId, {
      phase: 'completed',
      message,
      percent: 100,
    })
  }

  error(trackerId: string, error: Error, message?: string): ProgressTracker | undefined {
    const tracker = this.trackers.get(trackerId)
    if (!tracker) return undefined

    tracker.error = error
    return this.updateProgress(trackerId, {
      phase: 'error',
      message: message ?? error.message,
    })
  }

  heartbeat(trackerId: string, message?: string): ProgressTracker | undefined {
    const tracker = this.trackers.get(trackerId)
    if (!tracker || tracker.isComplete) return undefined

    const now = Date.now()
    const update: ProgressUpdate = {
      ...tracker.lastUpdate,
      ts: now,
      message: message ?? tracker.lastUpdate.message,
    }

    tracker.lastUpdate = update
    this.notifyCallbacks(update, tracker)
    return tracker
  }

  getTracker(trackerId: string): ProgressTracker | undefined {
    return this.trackers.get(trackerId)
  }

  getTrackerByAgent(agentId: string): ProgressTracker | undefined {
    for (const tracker of Array.from(this.trackers.values())) {
      if (tracker.agentId === agentId && !tracker.isComplete) {
        return tracker
      }
    }
    return undefined
  }

  getActiveTrackers(): ProgressTracker[] {
    return Array.from(this.trackers.values()).filter(t => !t.isComplete)
  }

  getAllTrackers(): ProgressTracker[] {
    return Array.from(this.trackers.values())
  }

  removeTracker(trackerId: string): boolean {
    return this.trackers.delete(trackerId)
  }

  clearCompleted(): number {
    let removed = 0
    for (const [id, tracker] of Array.from(this.trackers)) {
      if (tracker.isComplete) {
        this.trackers.delete(id)
        removed++
      }
    }
    return removed
  }

  subscribe(callback: ProgressCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  private notifyCallbacks(update: ProgressUpdate, tracker: ProgressTracker): void {
    for (const callback of Array.from(this.callbacks)) {
      try {
        callback(update, tracker)
      } catch (error) {
        console.error('Progress callback error:', error)
      }
    }
  }

  getStats(): {
    total: number
    active: number
    completed: number
    errors: number
  } {
    let active = 0
    let completed = 0
    let errors = 0

    for (const tracker of Array.from(this.trackers.values())) {
      if (tracker.isComplete) {
        if (tracker.error) {
          errors++
        } else {
          completed++
        }
      } else {
        active++
      }
    }

    return {
      total: this.trackers.size,
      active,
      completed,
      errors,
    }
  }
}

let managerInstance: ProgressManager | null = null

export function getProgressManager(): ProgressManager {
  if (!managerInstance) {
    managerInstance = new ProgressManager()
  }
  return managerInstance
}

export function createProgressTracker(agentId: string, parentId?: string): ProgressTracker {
  return getProgressManager().createTracker(agentId, parentId)
}

export function updateProgress(
  trackerId: string,
  update: Partial<Omit<ProgressUpdate, 'ts'>>,
): ProgressTracker | undefined {
  return getProgressManager().updateProgress(trackerId, update)
}

export function setProgressPhase(
  trackerId: string,
  phase: ProgressPhase,
  message?: string,
): ProgressTracker | undefined {
  return getProgressManager().setPhase(trackerId, phase, message)
}

export function completeProgress(
  trackerId: string,
  message?: string,
): ProgressTracker | undefined {
  return getProgressManager().complete(trackerId, message)
}

export function errorProgress(
  trackerId: string,
  error: Error,
  message?: string,
): ProgressTracker | undefined {
  return getProgressManager().error(trackerId, error, message)
}

export function heartbeatProgress(trackerId: string, message?: string): ProgressTracker | undefined {
  return getProgressManager().heartbeat(trackerId, message)
}

export function subscribeToProgress(callback: ProgressCallback): () => void {
  return getProgressManager().subscribe(callback)
}

export const PHASE_MESSAGES: Record<ProgressPhase, string> = {
  initializing: 'Initializing...',
  planning: 'Planning next steps...',
  thinking: 'Thinking...',
  tooling: 'Executing tools...',
  summarizing: 'Summarizing results...',
  waiting: 'Waiting for response...',
  completed: 'Completed',
  error: 'Error occurred',
}

export function formatProgress(tracker: ProgressTracker): string {
  const { phase, step, message, percent, etaMs } = tracker.lastUpdate
  const parts: string[] = [`[${phase}]`, `step ${step}`]

  if (percent !== undefined) {
    parts.push(`${percent}%`)
  }

  if (etaMs !== undefined) {
    const etaSec = Math.ceil(etaMs / 1000)
    parts.push(`ETA: ${etaSec}s`)
  }

  parts.push(`- ${message}`)

  return parts.join(' ')
}
