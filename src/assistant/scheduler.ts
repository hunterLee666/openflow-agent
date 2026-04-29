import { nanoid } from 'nanoid'
import type { ScheduledTask } from './types'

type TaskHandler = () => Promise<void>

export class JarvisScheduler {
  private tasks: Map<string, ScheduledTask> = new Map()
  private handlers: Map<string, TaskHandler> = new Map()
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map()
  private enabled: boolean = true

  constructor() {}

  registerTask(
    name: string,
    cronExpression: string,
    handler: TaskHandler,
    enabled: boolean = true,
  ): ScheduledTask {
    const id = nanoid()
    const task: ScheduledTask = {
      id,
      name,
      cron: cronExpression,
      handler: name,
      enabled,
    }

    this.tasks.set(id, task)
    this.handlers.set(name, handler)

    if (enabled) {
      this.scheduleTask(task)
    }

    return task
  }

  private parseCron(expression: string): number {
    const parts = expression.trim().split(/\s+/)
    
    if (parts.length === 1) {
      const value = parseInt(parts[0], 10)
      if (!isNaN(value)) {
        return value * 1000
      }
    }
    
    if (parts.length === 2) {
      const value = parseInt(parts[0], 10)
      const unit = parts[1].toLowerCase()
      
      switch (unit) {
        case 's':
        case 'sec':
        case 'seconds':
          return value * 1000
        case 'm':
        case 'min':
        case 'minutes':
          return value * 60 * 1000
        case 'h':
        case 'hour':
        case 'hours':
          return value * 60 * 60 * 1000
        case 'd':
        case 'day':
        case 'days':
          return value * 24 * 60 * 60 * 1000
      }
    }
    
    return 60000
  }

  private scheduleTask(task: ScheduledTask): void {
    const handler = this.handlers.get(task.handler)
    if (!handler) return

    const intervalMs = this.parseCron(task.cron)
    const intervalId = setInterval(async () => {
      if (!this.enabled || !task.enabled) return
      
      try {
        task.lastRun = new Date()
        await handler()
        task.nextRun = new Date(Date.now() + intervalMs)
      } catch (error) {
        console.error(`Task ${task.name} failed:`, error)
      }
    }, intervalMs)

    this.intervals.set(task.id, intervalId)
    task.nextRun = new Date(Date.now() + intervalMs)
  }

  enableTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.enabled = true
      this.scheduleTask(task)
    }
  }

  disableTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      task.enabled = false
      const intervalId = this.intervals.get(taskId)
      if (intervalId) {
        clearInterval(intervalId)
        this.intervals.delete(taskId)
      }
    }
  }

  removeTask(taskId: string): void {
    this.disableTask(taskId)
    const task = this.tasks.get(taskId)
    if (task) {
      this.handlers.delete(task.handler)
      this.tasks.delete(taskId)
    }
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId)
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }

  getPendingTasks(): ScheduledTask[] {
    const now = Date.now()
    return this.getAllTasks().filter(task => {
      if (!task.enabled) return false
      if (!task.nextRun) return true
      return task.nextRun.getTime() <= now
    })
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  destroy(): void {
    for (const intervalId of this.intervals.values()) {
      clearInterval(intervalId)
    }
    this.intervals.clear()
    this.tasks.clear()
    this.handlers.clear()
  }
}
