import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  lastResult?: TaskExecutionResult;
  metadata?: Record<string, unknown>;
}

export interface TaskExecutionResult {
  taskId: string;
  startTime: number;
  endTime: number;
  duration: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface TaskSchedulerConfig {
  dataDir: string;
  maxHistory: number;
  maxConcurrent: number;
}

const DEFAULT_CONFIG: TaskSchedulerConfig = {
  dataDir: process.env.HOME ? `${process.env.HOME}/.openflow/tasks` : ".openflow/tasks",
  maxHistory: 100,
  maxConcurrent: 5,
};

export class TaskScheduler extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map();
  private runningTasks: Map<string, TaskExecutionResult> = new Map();
  private config: TaskSchedulerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<TaskSchedulerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    const dataDir = resolve(this.config.dataDir);
    await mkdir(dataDir, { recursive: true });
    await this.loadTasks();
    this.startScheduler();
  }

  addTask(task: Omit<ScheduledTask, "id" | "runCount" | "enabled">): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const fullTask: ScheduledTask = {
      ...task,
      id,
      enabled: true,
      runCount: 0,
    };

    this.tasks.set(id, fullTask);
    this.saveTasks();

    this.emit("task:added", { id, task: fullTask });

    return id;
  }

  removeTask(taskId: string): boolean {
    const deleted = this.tasks.delete(taskId);
    if (deleted) {
      this.saveTasks();
      this.emit("task:removed", { taskId });
    }
    return deleted;
  }

  enableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.enabled = true;
    this.saveTasks();
    this.emit("task:enabled", { taskId });
    return true;
  }

  disableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.enabled = false;
    this.saveTasks();
    this.emit("task:disabled", { taskId });
    return true;
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getEnabledTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.enabled);
  }

  async runTaskNow(taskId: string): Promise<TaskExecutionResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    return this.executeTask(task);
  }

  private async executeTask(task: ScheduledTask): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const result: TaskExecutionResult = {
      taskId: task.id,
      startTime,
      endTime: 0,
      duration: 0,
      exitCode: null,
      stdout: "",
      stderr: "",
    };

    this.runningTasks.set(task.id, result);
    this.emit("task:start", { taskId: task.id, task });

    try {
      const env = {
        ...process.env,
        OPENFLOW_TASK_ID: task.id,
        OPENFLOW_TASK_NAME: task.name,
        ...(task.env || {}),
      };

      const child = spawn(task.command, task.args || [], {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
        cwd: task.cwd,
        env,
        timeout: 300000,
      });

      child.stdout?.on("data", (data) => {
        result.stdout += data.toString();
        this.emit("task:output", { taskId: task.id, data: data.toString(), type: "stdout" });
      });

      child.stderr?.on("data", (data) => {
        result.stderr += data.toString();
        this.emit("task:output", { taskId: task.id, data: data.toString(), type: "stderr" });
      });

      result.exitCode = await new Promise<number | null>((resolve) => {
        child.on("close", (code) => {
          resolve(code);
        });

        child.on("error", () => {
          resolve(-1);
        });
      });
    } catch (error) {
      result.error = (error as Error).message;
      result.exitCode = -1;
    }

    result.endTime = Date.now();
    result.duration = result.endTime - startTime;

    task.lastRun = startTime;
    task.runCount++;
    task.lastResult = result;
    task.nextRun = this.calculateNextRun(task.cronExpression);

    this.runningTasks.delete(task.id);
    this.saveTasks();

    this.emit("task:complete", { taskId: task.id, result });

    return result;
  }

  private startScheduler(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.checkDueTasks();
    }, 60000);
  }

  private checkDueTasks(): void {
    const now = Date.now();

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      if (this.runningTasks.has(task.id)) continue;

      if (task.nextRun && task.nextRun <= now) {
        this.executeTask(task).catch((error) => {
          console.error(`Scheduled task ${task.name} failed:`, error);
        });
      }
    }
  }

  private calculateNextRun(cronExpression: string): number | undefined {
    const parts = cronExpression.split(" ");
    if (parts.length < 5) return undefined;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const now = new Date();
    let next = new Date(now);

    next.setMinutes(parseInt(minute) || 0);
    next.setHours(parseInt(hour) || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  private async loadTasks(): Promise<void> {
    const tasksFile = join(resolve(this.config.dataDir), "tasks.json");
    const exists = await this.pathExists(tasksFile);

    if (exists) {
      try {
        const content = await readFile(tasksFile, "utf-8");
        const tasksData = JSON.parse(content) as ScheduledTask[];

        for (const task of tasksData) {
          this.tasks.set(task.id, task);
        }
      } catch {
        // Corrupted file, start fresh
      }
    }
  }

  private async saveTasks(): Promise<void> {
    const tasksFile = join(resolve(this.config.dataDir), "tasks.json");
    const tasksData = Array.from(this.tasks.values());

    await writeFile(tasksFile, JSON.stringify(tasksData, null, 2));
  }

  async getTaskHistory(taskId: string, limit = 10): Promise<TaskExecutionResult[]> {
    const historyFile = join(resolve(this.config.dataDir), `${taskId}-history.json`);
    const exists = await this.pathExists(historyFile);

    if (!exists) return [];

    try {
      const content = await readFile(historyFile, "utf-8");
      const history = JSON.parse(content) as TaskExecutionResult[];
      return history.slice(-limit);
    } catch {
      return [];
    }
  }

  async getStats(): Promise<{
    totalTasks: number;
    enabledTasks: number;
    runningTasks: number;
    totalExecutions: number;
  }> {
    let totalExecutions = 0;
    for (const task of this.tasks.values()) {
      totalExecutions += task.runCount;
    }

    return {
      totalTasks: this.tasks.size,
      enabledTasks: this.getEnabledTasks().length,
      runningTasks: this.runningTasks.size,
      totalExecutions,
    };
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

export function createTaskScheduler(config?: Partial<TaskSchedulerConfig>): TaskScheduler {
  return new TaskScheduler(config);
}
