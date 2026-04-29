import { spawn, type ChildProcess } from 'child_process'

export interface ShellTask {
  pid: number
  agentId: string
  command: string
  child: ChildProcess
  startTime: number
  status: 'running' | 'completed' | 'killed' | 'error'
  exitCode?: number
}

export interface ShellTaskOptions {
  command: string
  agentId: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
}

class ShellTaskRegistry {
  private tasks: Map<number, ShellTask> = new Map()
  private byAgent: Map<string, Set<number>> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private maxTasks: number = 100
  private defaultTimeout: number = 600000

  constructor() {
    this.startCleanupInterval()
  }

  register(agentId: string, child: ChildProcess, command: string): ShellTask {
    const pid = child.pid
    if (!pid) {
      throw new Error('Child process has no PID')
    }

    const task: ShellTask = {
      pid,
      agentId,
      command,
      child,
      startTime: Date.now(),
      status: 'running',
    }

    this.tasks.set(pid, task)

    if (!this.byAgent.has(agentId)) {
      this.byAgent.set(agentId, new Set())
    }
    this.byAgent.get(agentId)!.add(pid)

    child.on('exit', (code, signal) => {
      this.markCompleted(pid, code ?? (signal ? 1 : 0))
    })

    child.on('error', () => {
      this.markError(pid)
    })

    return task
  }

  private markCompleted(pid: number, exitCode: number): void {
    const task = this.tasks.get(pid)
    if (task) {
      task.status = 'completed'
      task.exitCode = exitCode
    }
  }

  private markError(pid: number): void {
    const task = this.tasks.get(pid)
    if (task) {
      task.status = 'error'
    }
  }

  killTask(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const task = this.tasks.get(pid)
    if (!task || task.status !== 'running') {
      return false
    }

    try {
      if (process.platform !== 'win32') {
        try {
          process.kill(-pid, signal)
        } catch {
          task.child.kill(signal)
        }
      } else {
        task.child.kill(signal)
      }
      task.status = 'killed'
      return true
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error)
      return false
    }
  }

  killTasksForAgent(agentId: string, signal: NodeJS.Signals = 'SIGTERM'): number {
    const pids = this.byAgent.get(agentId)
    if (!pids || pids.size === 0) {
      return 0
    }

    let killed = 0
    for (const pid of Array.from(pids)) {
      if (this.killTask(pid, signal)) {
        killed++
      }
    }

    return killed
  }

  killAllTasks(signal: NodeJS.Signals = 'SIGTERM'): number {
    let killed = 0
    for (const [pid, task] of Array.from(this.tasks)) {
      if (task.status === 'running' && this.killTask(pid, signal)) {
        killed++
      }
    }
    return killed
  }

  getTask(pid: number): ShellTask | undefined {
    return this.tasks.get(pid)
  }

  getTasksForAgent(agentId: string): ShellTask[] {
    const pids = this.byAgent.get(agentId)
    if (!pids) return []

    const tasks: ShellTask[] = []
    for (const pid of Array.from(pids)) {
      const task = this.tasks.get(pid)
      if (task) {
        tasks.push(task)
      }
    }
    return tasks
  }

  getRunningTasks(): ShellTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running')
  }

  getAllTasks(): ShellTask[] {
    return Array.from(this.tasks.values())
  }

  getStats(): {
    total: number
    running: number
    completed: number
    killed: number
    error: number
    byAgent: Record<string, number>
  } {
    let running = 0
    let completed = 0
    let killed = 0
    let error = 0
    const byAgent: Record<string, number> = {}

    for (const task of Array.from(this.tasks.values())) {
      switch (task.status) {
        case 'running':
          running++
          break
        case 'completed':
          completed++
          break
        case 'killed':
          killed++
          break
        case 'error':
          error++
          break
      }

      byAgent[task.agentId] = (byAgent[task.agentId] || 0) + 1
    }

    return {
      total: this.tasks.size,
      running,
      completed,
      killed,
      error,
      byAgent,
    }
  }

  removeTask(pid: number): boolean {
    const task = this.tasks.get(pid)
    if (!task) return false

    this.tasks.delete(pid)
    const agentPids = this.byAgent.get(task.agentId)
    if (agentPids) {
      agentPids.delete(pid)
      if (agentPids.size === 0) {
        this.byAgent.delete(task.agentId)
      }
    }

    return true
  }

  clearCompleted(): number {
    let removed = 0
    for (const [pid, task] of Array.from(this.tasks)) {
      if (task.status !== 'running') {
        this.removeTask(pid)
        removed++
      }
    }
    return removed
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.clearCompleted()
    }, 60000).unref()
  }

  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  async gracefulShutdown(timeoutMs: number = 5000): Promise<void> {
    const runningTasks = this.getRunningTasks()

    for (const task of runningTasks) {
      this.killTask(task.pid, 'SIGTERM')
    }

    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      const stillRunning = this.getRunningTasks()
      if (stillRunning.length === 0) {
        break
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const remaining = this.getRunningTasks()
    for (const task of remaining) {
      this.killTask(task.pid, 'SIGKILL')
    }
  }
}

let registryInstance: ShellTaskRegistry | null = null

export function getShellTaskRegistry(): ShellTaskRegistry {
  if (!registryInstance) {
    registryInstance = new ShellTaskRegistry()
  }
  return registryInstance
}

export function registerShellTask(agentId: string, child: ChildProcess, command: string): ShellTask {
  return getShellTaskRegistry().register(agentId, child, command)
}

export function killShellTasksForAgent(agentId: string, signal?: NodeJS.Signals): number {
  return getShellTaskRegistry().killTasksForAgent(agentId, signal)
}

export function killAllShellTasks(signal?: NodeJS.Signals): number {
  return getShellTaskRegistry().killAllTasks(signal)
}

export function getShellTasksForAgent(agentId: string): ShellTask[] {
  return getShellTaskRegistry().getTasksForAgent(agentId)
}

export function getRunningShellTasks(): ShellTask[] {
  return getShellTaskRegistry().getRunningTasks()
}

export function setupProcessExitHandlers(): void {
  const registry = getShellTaskRegistry()

  const exitHandler = () => {
    registry.killAllTasks('SIGTERM')
  }

  process.on('exit', exitHandler)
  process.on('SIGINT', () => {
    registry.gracefulShutdown(3000).then(() => {
      process.exit(0)
    })
  })
  process.on('SIGTERM', () => {
    registry.gracefulShutdown(5000).then(() => {
      process.exit(0)
    })
  })
}
