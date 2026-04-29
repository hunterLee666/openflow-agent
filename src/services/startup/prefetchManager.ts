export type PrefetchTaskStatus = 'pending' | 'loading' | 'done' | 'error' | 'skipped'

export interface PrefetchTask<T = unknown> {
  id: string
  name: string
  category: 'system' | 'git' | 'environment' | 'project' | 'mcp' | 'tools'
  loader: () => Promise<T>
  dependencies?: string[]
  timeout?: number
  retries?: number
  optional?: boolean
  priority: number
}

export interface PrefetchTaskResult<T = unknown> {
  taskId: string
  status: PrefetchTaskStatus
  result?: T
  error?: Error
  duration: number
  startTime: number
  endTime: number
}

export interface PrefetchState {
  tasks: Map<string, PrefetchTask>
  results: Map<string, PrefetchTaskResult>
  loading: Set<string>
  completed: number
  failed: number
  skipped: number
  total: number
  startTime: number
  endTime?: number
}

export interface PrefetchConfig {
  maxConcurrency: number
  defaultTimeout: number
  stopOnError: boolean
  retryDelay: number
  maxRetries: number
}

export const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = {
  maxConcurrency: 5,
  defaultTimeout: 30000,
  stopOnError: false,
  retryDelay: 1000,
  maxRetries: 2,
}

class PrefetchManager {
  private state: PrefetchState = {
    tasks: new Map(),
    results: new Map(),
    loading: new Set(),
    completed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    startTime: 0,
  }

  private config: PrefetchConfig
  private abortController: AbortController | null = null

  constructor(config: Partial<PrefetchConfig> = {}) {
    this.config = { ...DEFAULT_PREFETCH_CONFIG, ...config }
  }

  registerTask<T>(task: PrefetchTask<T>): void {
    this.state.tasks.set(task.id, task)
    this.state.total = this.state.tasks.size
  }

  registerTasks(tasks: PrefetchTask[]): void {
    for (const task of tasks) {
      this.state.tasks.set(task.id, task)
    }
    this.state.total = this.state.tasks.size
  }

  getTask(id: string): PrefetchTask | undefined {
    return this.state.tasks.get(id)
  }

  getTaskStatus(id: string): PrefetchTaskStatus {
    const result = this.state.results.get(id)
    if (result) return result.status
    if (this.state.loading.has(id)) return 'loading'
    return 'pending'
  }

  getResult<T>(id: string): T | undefined {
    return this.state.results.get(id)?.result as T | undefined
  }

  getState(): PrefetchState {
    return { ...this.state }
  }

  getProgress(): { completed: number; total: number; percent: number } {
    const completed = this.state.completed + this.state.failed + this.state.skipped
    return {
      completed,
      total: this.state.total,
      percent: this.state.total > 0 ? Math.round((completed / this.state.total) * 100) : 0,
    }
  }

  private canRunTask(task: PrefetchTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true
    }

    for (const depId of task.dependencies) {
      const depResult = this.state.results.get(depId)
      if (!depResult || depResult.status !== 'done') {
        return false
      }
    }

    return true
  }

  private async runTask<T>(
    task: PrefetchTask<T>,
    signal: AbortSignal,
  ): Promise<PrefetchTaskResult<T>> {
    const startTime = Date.now()
    const timeout = task.timeout ?? this.config.defaultTimeout
    const maxRetries = task.retries ?? this.config.maxRetries

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) {
        return {
          taskId: task.id,
          status: 'skipped',
          duration: Date.now() - startTime,
          startTime,
          endTime: Date.now(),
        }
      }

      try {
        const result = await Promise.race([
          task.loader(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Task ${task.id} timed out`)), timeout),
          ),
        ])

        return {
          taskId: task.id,
          status: 'done',
          result,
          duration: Date.now() - startTime,
          startTime,
          endTime: Date.now(),
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
        }
      }
    }

    if (task.optional) {
      return {
        taskId: task.id,
        status: 'skipped',
        error: lastError,
        duration: Date.now() - startTime,
        startTime,
        endTime: Date.now(),
      }
    }

    return {
      taskId: task.id,
      status: 'error',
      error: lastError,
      duration: Date.now() - startTime,
      startTime,
      endTime: Date.now(),
    }
  }

  async runAll(signal?: AbortSignal): Promise<Map<string, PrefetchTaskResult>> {
    this.abortController = new AbortController()
    const abortSignal = signal ?? this.abortController.signal
    this.state.startTime = Date.now()

    const sortedTasks = Array.from(this.state.tasks.values()).sort(
      (a, b) => b.priority - a.priority,
    )

    const pending: PrefetchTask[] = [...sortedTasks]
    const running: Promise<void>[] = []

    const processTask = async (task: PrefetchTask): Promise<void> => {
      if (abortSignal.aborted) {
        this.state.results.set(task.id, {
          taskId: task.id,
          status: 'skipped',
          duration: 0,
          startTime: Date.now(),
          endTime: Date.now(),
        })
        this.state.skipped++
        return
      }

      while (!this.canRunTask(task)) {
        if (abortSignal.aborted) {
          this.state.results.set(task.id, {
            taskId: task.id,
            status: 'skipped',
            duration: 0,
            startTime: Date.now(),
            endTime: Date.now(),
          })
          this.state.skipped++
          return
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      this.state.loading.add(task.id)
      const result = await this.runTask(task, abortSignal)
      this.state.loading.delete(task.id)

      this.state.results.set(task.id, result)

      switch (result.status) {
        case 'done':
          this.state.completed++
          break
        case 'error':
          this.state.failed++
          if (this.config.stopOnError && !task.optional) {
            this.abort()
          }
          break
        case 'skipped':
          this.state.skipped++
          break
      }
    }

    const worker = async (): Promise<void> => {
      while (pending.length > 0 && !abortSignal.aborted) {
        const task = pending.shift()
        if (task) {
          await processTask(task)
        }
      }
    }

    const workerCount = Math.min(this.config.maxConcurrency, this.state.tasks.size)
    for (let i = 0; i < workerCount; i++) {
      running.push(worker())
    }

    await Promise.all(running)

    this.state.endTime = Date.now()
    return this.state.results
  }

  abort(): void {
    this.abortController?.abort()
  }

  reset(): void {
    this.state = {
      tasks: new Map(),
      results: new Map(),
      loading: new Set(),
      completed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      startTime: 0,
    }
    this.abortController = null
  }

  getSummary(): {
    totalDuration: number
    completedTasks: number
    failedTasks: number
    skippedTasks: number
    averageTaskDuration: number
  } {
    const totalDuration = (this.state.endTime ?? Date.now()) - this.state.startTime
    const durations = Array.from(this.state.results.values()).map(r => r.duration)
    const averageTaskDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    return {
      totalDuration,
      completedTasks: this.state.completed,
      failedTasks: this.state.failed,
      skippedTasks: this.state.skipped,
      averageTaskDuration,
    }
  }
}

let defaultManager: PrefetchManager | null = null

export function getPrefetchManager(config?: Partial<PrefetchConfig>): PrefetchManager {
  if (!defaultManager) {
    defaultManager = new PrefetchManager(config)
  }
  return defaultManager
}

export function createPrefetchManager(config?: Partial<PrefetchConfig>): PrefetchManager {
  return new PrefetchManager(config)
}

export function createPrefetchTask<T>(
  id: string,
  name: string,
  loader: () => Promise<T>,
  options: Partial<Omit<PrefetchTask<T>, 'id' | 'name' | 'loader'>> = {},
): PrefetchTask<T> {
  return {
    id,
    name,
    loader,
    category: 'system',
    priority: 50,
    ...options,
  }
}

export const COMMON_PREFETCH_TASKS = {
  systemInfo: () =>
    createPrefetchTask(
      'system_info',
      'System Information',
      async () => {
        return {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          cwd: process.cwd(),
        }
      },
      { category: 'system', priority: 100 },
    ),

  gitStatus: (cwd: string) =>
    createPrefetchTask(
      'git_status',
      'Git Status',
      async () => {
        const { execSync } = await import('child_process')
        try {
          const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
          const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim()
          return { branch, status, isClean: status.length === 0 }
        } catch {
          return { branch: null, status: null, isClean: true }
        }
      },
      { category: 'git', priority: 90, optional: true },
    ),

  environmentCheck: () =>
    createPrefetchTask(
      'environment',
      'Environment Check',
      async () => {
        return {
          home: process.env.HOME ?? process.env.USERPROFILE,
          path: process.env.PATH?.split(':') ?? [],
          shell: process.env.SHELL,
          term: process.env.TERM,
        }
      },
      { category: 'environment', priority: 80 },
    ),

  projectDetection: (cwd: string) =>
    createPrefetchTask(
      'project_detection',
      'Project Detection',
      async () => {
        const fs = await import('fs')
        const path = await import('path')

        const projectType: string[] = []

        if (fs.existsSync(path.join(cwd, 'package.json'))) projectType.push('node')
        if (fs.existsSync(path.join(cwd, 'go.mod'))) projectType.push('go')
        if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) projectType.push('rust')
        if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) projectType.push('python')
        if (fs.existsSync(path.join(cwd, 'requirements.txt'))) projectType.push('python')

        return { projectType, cwd }
      },
      { category: 'project', priority: 70 },
    ),
}
