export type TaskState =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskTrigger = "user" | "system" | "timeout" | "error" | "manual";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface TaskTransition {
  from: TaskState;
  to: TaskState;
  trigger: TaskTrigger;
  guard?: Condition;
  beforeTransition?: (task: Task) => Promise<boolean>;
  afterTransition?: (task: Task) => void;
}

export interface Condition {
  evaluate(context: TaskContext): boolean;
}

export interface TaskContext {
  task: Task;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canRetry: boolean;
  errorCount: number;
  lastError?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  state: TaskState;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  pausedAt?: number;
  resumedAt?: number;
  progress: number;
  steps: TaskStep[];
  metadata?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface TaskStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
  artifacts?: string[];
}

export const VALID_TRANSITIONS: TaskTransition[] = [
  { from: "queued", to: "running", trigger: "user" },
  { from: "queued", to: "running", trigger: "system" },
  { from: "queued", to: "cancelled", trigger: "user" },
  { from: "queued", to: "cancelled", trigger: "error" },
  { from: "running", to: "paused", trigger: "user" },
  { from: "running", to: "completed", trigger: "system" },
  { from: "running", to: "failed", trigger: "error" },
  { from: "running", to: "cancelled", trigger: "user" },
  { from: "paused", to: "running", trigger: "user" },
  { from: "paused", to: "cancelled", trigger: "user" },
  { from: "failed", to: "running", trigger: "user" },
  { from: "failed", to: "queued", trigger: "user" },
  { from: "cancelled", to: "queued", trigger: "user" },
];

export class TaskStateMachine {
  private tasks: Map<string, Task> = new Map();
  private listeners: Map<string, Array<(task: Task) => void>> = new Map();
  private globalListeners: Array<(task: Task, prevState: TaskState) => void> = [];

  createTask(partial: Partial<Task> & { id: string; name: string }): Task {
    const task: Task = {
      id: partial.id,
      name: partial.name,
      description: partial.description,
      state: partial.state || "queued",
      priority: partial.priority || "normal",
      createdAt: partial.createdAt || Date.now(),
      updatedAt: partial.updatedAt || Date.now(),
      startedAt: partial.startedAt,
      completedAt: partial.completedAt,
      pausedAt: partial.pausedAt,
      resumedAt: partial.resumedAt,
      progress: partial.progress || 0,
      steps: partial.steps || [],
      metadata: partial.metadata,
      error: partial.error,
      retryCount: partial.retryCount || 0,
      maxRetries: partial.maxRetries || 3,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByState(state: TaskState): Task[] {
    return this.getAllTasks().filter((t) => t.state === state);
  }

  canTransition(taskId: string, toState: TaskState, trigger: TaskTrigger = "manual"): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const transition = VALID_TRANSITIONS.find(
      (t) => t.from === task.state && t.to === toState && t.trigger === trigger
    );

    if (!transition) return false;

    if (transition.guard) {
      const context = this.buildContext(task);
      return transition.guard.evaluate(context);
    }

    return true;
  }

  async transition(
    taskId: string,
    toState: TaskState,
    trigger: TaskTrigger = "manual"
  ): Promise<{ success: boolean; task?: Task; error?: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const prevState = task.state;

    const transition = VALID_TRANSITIONS.find(
      (t) => t.from === prevState && t.to === toState && (t.trigger === trigger || t.trigger === "manual")
    );

    if (!transition) {
      return {
        success: false,
        error: `Invalid transition: ${prevState} -> ${toState} (trigger: ${trigger})`,
      };
    }

    if (transition.guard) {
      const context = this.buildContext(task);
      if (!transition.guard.evaluate(context)) {
        return { success: false, error: "Transition guard condition not met" };
      }
    }

    if (transition.beforeTransition) {
      const canProceed = await this.executeBeforeTransition(transition, task);
      if (!canProceed) {
        return { success: false, error: "Before transition check failed" };
      }
    }

    task.state = toState;
    task.updatedAt = Date.now();

    switch (toState) {
      case "running":
        task.startedAt = task.startedAt || Date.now();
        break;
      case "completed":
        task.completedAt = Date.now();
        task.progress = 100;
        break;
      case "paused":
        task.pausedAt = Date.now();
        break;
      case "running":
        if (task.pausedAt) {
          task.resumedAt = Date.now();
        }
        break;
      case "failed":
        task.retryCount++;
        break;
      case "cancelled":
        task.completedAt = Date.now();
        break;
    }

    transition.afterTransition?.(task);

    this.notifyListeners(task);
    this.notifyGlobalListeners(task, prevState);

    return { success: true, task };
  }

  private async executeBeforeTransition(
    transition: TaskTransition,
    task: Task
  ): Promise<boolean> {
    if (transition.beforeTransition) {
      return await transition.beforeTransition(task);
    }
    return true;
  }

  private buildContext(task: Task): TaskContext {
    return {
      task,
      canPause: this.canTransition(task.id, "paused", "user"),
      canResume: this.canTransition(task.id, "running", "user"),
      canCancel: this.canTransition(task.id, "cancelled", "user"),
      canRetry: task.retryCount < task.maxRetries && task.state === "failed",
      errorCount: task.retryCount,
      lastError: task.error,
    };
  }

  async updateProgress(taskId: string, progress: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== "running") return false;

    task.progress = Math.max(0, Math.min(100, progress));
    task.updatedAt = Date.now();

    if (progress >= 100) {
      await this.transition(taskId, "completed", "system");
    }

    this.notifyListeners(task);
    return true;
  }

  addStep(taskId: string, step: Omit<TaskStep, "id">): string | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newStep: TaskStep = {
      ...step,
      id: stepId,
    };

    task.steps.push(newStep);
    task.updatedAt = Date.now();

    this.notifyListeners(task);
    return stepId;
  }

  updateStep(taskId: string, stepId: string, update: Partial<TaskStep>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) return false;

    Object.assign(step, update);
    task.updatedAt = Date.now();

    this.notifyListeners(task);
    return true;
  }

  setError(taskId: string, error: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.error = error;
    task.updatedAt = Date.now();

    this.notifyListeners(task);
    return true;
  }

  subscribe(taskId: string, listener: (task: Task) => void): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, []);
    }
    this.listeners.get(taskId)!.push(listener);

    return () => {
      const listeners = this.listeners.get(taskId);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  subscribeAll(listener: (task: Task, prevState: TaskState) => void): () => void {
    this.globalListeners.push(listener);

    return () => {
      const index = this.globalListeners.indexOf(listener);
      if (index !== -1) {
        this.globalListeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(task: Task): void {
    const listeners = this.listeners.get(task.id);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(task);
        } catch (e) {
          console.error("Task listener error:", e);
        }
      }
    }
  }

  private notifyGlobalListeners(task: Task, prevState: TaskState): void {
    for (const listener of this.globalListeners) {
      try {
        listener(task, prevState);
      } catch (e) {
        console.error("Global task listener error:", e);
      }
    }
  }

  removeTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  clear(): void {
    this.tasks.clear();
  }

  getStats(): {
    total: number;
    byState: Record<TaskState, number>;
    averageProgress: number;
    activeTasks: number;
  } {
    const tasks = this.getAllTasks();

    return {
      total: tasks.length,
      byState: {
        queued: tasks.filter((t) => t.state === "queued").length,
        running: tasks.filter((t) => t.state === "running").length,
        paused: tasks.filter((t) => t.state === "paused").length,
        completed: tasks.filter((t) => t.state === "completed").length,
        failed: tasks.filter((t) => t.state === "failed").length,
        cancelled: tasks.filter((t) => t.state === "cancelled").length,
      },
      averageProgress:
        tasks.length > 0
          ? tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length
          : 0,
      activeTasks: tasks.filter((t) => t.state === "running" || t.state === "queued").length,
    };
  }
}

export class AlwaysCondition implements Condition {
  evaluate(): boolean {
    return true;
  }
}

export class NeverCondition implements Condition {
  evaluate(): boolean {
    return false;
  }
}

export class MaxRetriesCondition implements Condition {
  constructor(private max: number) {}

  evaluate(context: TaskContext): boolean {
    return context.errorCount < this.max;
  }
}

export class HasErrorCondition implements Condition {
  evaluate(context: TaskContext): boolean {
    return !!context.lastError;
  }
}

export const defaultTaskStateMachine = new TaskStateMachine();
