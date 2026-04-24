export interface ProgressUpdate {
  taskId: string;
  progress: number;
  currentStep: string;
  steps?: ProgressStep[];
  estimatedTimeRemaining?: number;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface ProgressStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  progress?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ProgressReporter {
  start(taskId: string, totalSteps?: number): void;
  update(update: Omit<ProgressUpdate, "taskId" | "timestamp">): void;
  complete(artifacts?: string[]): void;
  fail(error: string): void;
  getProgress(): ProgressUpdate | null;
}

export interface ProgressTrackerConfig {
  reportIntervalMs: number;
  enableETAPrediction: boolean;
  minSamplesForETA: number;
  smoothingFactor: number;
}

export const DEFAULT_PROGRESS_CONFIG: ProgressTrackerConfig = {
  reportIntervalMs: 1000,
  enableETAPrediction: true,
  minSamplesForETA: 5,
  smoothingFactor: 0.2,
};

export class ProgressTracker implements ProgressReporter {
  private currentProgress: ProgressUpdate | null = null;
  private startTime: number = 0;
  private stepStartTimes: Map<string, number> = new Map();
  private progressSamples: Array<{ progress: number; time: number }> = [];
  private listeners: Array<(update: ProgressUpdate) => void> = [];
  private config: ProgressTrackerConfig;
  private updateIntervalId?: NodeJS.Timeout;

  constructor(config: Partial<ProgressTrackerConfig> = {}) {
    this.config = { ...DEFAULT_PROGRESS_CONFIG, ...config };
  }

  start(taskId: string, totalSteps?: number): void {
    this.startTime = Date.now();
    this.progressSamples = [];
    this.stepStartTimes.clear();

    this.currentProgress = {
      taskId,
      progress: 0,
      currentStep: "",
      timestamp: this.startTime,
    };

    if (totalSteps) {
      this.currentProgress.steps = Array.from({ length: totalSteps }, (_, i) => ({
        id: `step_${i}`,
        name: `Step ${i + 1}`,
        status: "pending",
      }));
    }

    this.startAutoReport();
  }

  update(update: Omit<ProgressUpdate, "taskId" | "timestamp">): void {
    if (!this.currentProgress) {
      return;
    }

    this.currentProgress = {
      ...this.currentProgress,
      ...update,
      timestamp: Date.now(),
    };

    if (update.progress !== undefined) {
      this.recordProgressSample(update.progress);
    }

    if (update.currentStep && this.currentProgress.steps) {
      const step = this.currentProgress.steps.find((s) => s.name === update.currentStep);
      if (step) {
        step.status = "running";
        step.startedAt = Date.now();
        this.stepStartTimes.set(step.id, Date.now());
      }
    }

    if (this.config.enableETAPrediction) {
      this.currentProgress.estimatedTimeRemaining = this.calculateETA();
    }

    this.notifyListeners();
  }

  complete(artifacts?: string[]): void {
    if (!this.currentProgress) {
      return;
    }

    this.currentProgress = {
      ...this.currentProgress,
      progress: 100,
      currentStep: "Complete",
      estimatedTimeRemaining: 0,
      artifacts: artifacts || this.currentProgress.artifacts,
      timestamp: Date.now(),
    };

    if (this.currentProgress.steps) {
      for (const step of this.currentProgress.steps) {
        if (step.status === "running") {
          step.status = "completed";
          step.completedAt = Date.now();
          step.progress = 100;
        }
      }
    }

    this.stopAutoReport();
    this.notifyListeners();
  }

  fail(error: string): void {
    if (!this.currentProgress) {
      return;
    }

    this.currentProgress = {
      ...this.currentProgress,
      metadata: { ...this.currentProgress.metadata, error },
      timestamp: Date.now(),
    };

    if (this.currentProgress.steps) {
      for (const step of this.currentProgress.steps) {
        if (step.status === "running") {
          step.status = "failed";
          step.error = error;
          step.completedAt = Date.now();
        }
      }
    }

    this.stopAutoReport();
    this.notifyListeners();
  }

  getProgress(): ProgressUpdate | null {
    return this.currentProgress
      ? { ...this.currentProgress }
      : null;
  }

  subscribe(listener: (update: ProgressUpdate) => void): () => void {
    this.listeners.push(listener);

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private recordProgressSample(progress: number): void {
    const now = Date.now();
    this.progressSamples.push({ progress, time: now });

    const cutoff = now - 60000;
    this.progressSamples = this.progressSamples.filter((s) => s.time >= cutoff);
  }

  private calculateETA(): number | undefined {
    if (this.progressSamples.length < this.config.minSamplesForETA) {
      return undefined;
    }

    const elapsed = Date.now() - this.startTime;
    const currentProgress = this.currentProgress?.progress || 0;

    if (currentProgress === 0) {
      return undefined;
    }

    const rate = currentProgress / elapsed;
    const remaining = 100 - currentProgress;

    const rawETA = remaining / rate;

    const recentSamples = this.progressSamples.slice(-10);
    let totalWeight = 0;
    let weightedRate = 0;

    for (let i = 1; i < recentSamples.length; i++) {
      const prev = recentSamples[i - 1];
      const curr = recentSamples[i];
      const timeDelta = curr.time - prev.time;
      const progressDelta = curr.progress - prev.progress;

      if (timeDelta > 0) {
        const weight = Math.exp(-0.1 * (recentSamples.length - i));
        weightedRate += weight * (progressDelta / timeDelta);
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      const smoothedRate = weightedRate / totalWeight;
      if (smoothedRate > 0) {
        return Math.round(remaining / smoothedRate);
      }
    }

    return Math.round(rawETA);
  }

  private startAutoReport(): void {
    if (this.updateIntervalId) {
      return;
    }

    this.updateIntervalId = setInterval(() => {
      if (this.currentProgress && this.currentProgress.progress < 100) {
        this.notifyListeners();
      }
    }, this.config.reportIntervalMs);
  }

  private stopAutoReport(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = undefined;
    }
  }

  private notifyListeners(): void {
    if (!this.currentProgress) return;

    const progress = { ...this.currentProgress };

    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch (e) {
        console.error("Progress listener error:", e);
      }
    }
  }

  destroy(): void {
    this.stopAutoReport();
    this.listeners = [];
    this.currentProgress = null;
  }
}

export class MultiTaskProgressTracker {
  private trackers: Map<string, ProgressTracker> = new Map();
  private listeners: Array<(taskId: string, update: ProgressUpdate) => void> = [];
  private config: ProgressTrackerConfig;

  constructor(config: Partial<ProgressTrackerConfig> = {}) {
    this.config = { ...DEFAULT_PROGRESS_CONFIG, ...config };
  }

  createTask(taskId: string, totalSteps?: number): ProgressTracker {
    const tracker = new ProgressTracker(this.config);
    tracker.start(taskId, totalSteps);

    tracker.subscribe((update) => {
      this.notifyListeners(taskId, update);
    });

    this.trackers.set(taskId, tracker);
    return tracker;
  }

  getTracker(taskId: string): ProgressTracker | undefined {
    return this.trackers.get(taskId);
  }

  removeTask(taskId: string): boolean {
    const tracker = this.trackers.get(taskId);
    if (tracker) {
      tracker.destroy();
      return this.trackers.delete(taskId);
    }
    return false;
  }

  getAllProgress(): Map<string, ProgressUpdate> {
    const result = new Map<string, ProgressUpdate>();

    for (const [taskId, tracker] of this.trackers) {
      const progress = tracker.getProgress();
      if (progress) {
        result.set(taskId, progress);
      }
    }

    return result;
  }

  subscribe(listener: (taskId: string, update: ProgressUpdate) => void): () => void {
    this.listeners.push(listener);

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(taskId: string, update: ProgressUpdate): void {
    for (const listener of this.listeners) {
      try {
        listener(taskId, update);
      } catch (e) {
        console.error("Multi-task progress listener error:", e);
      }
    }
  }

  getStats(): {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageProgress: number;
    totalETA: number;
  } {
    let totalProgress = 0;
    let completedCount = 0;
    let failedCount = 0;
    let totalETA = 0;

    for (const tracker of this.trackers.values()) {
      const progress = tracker.getProgress();
      if (progress) {
        totalProgress += progress.progress;
        totalETA += progress.estimatedTimeRemaining || 0;

        if (progress.progress >= 100) {
          completedCount++;
        } else if (progress.metadata?.["error"]) {
          failedCount++;
        }
      }
    }

    const count = this.trackers.size;
    return {
      totalTasks: count,
      activeTasks: count - completedCount - failedCount,
      completedTasks: completedCount,
      failedTasks: failedCount,
      averageProgress: count > 0 ? totalProgress / count : 0,
      totalETA,
    };
  }
}

export const defaultProgressTracker = new ProgressTracker();
export const defaultMultiTaskTracker = new MultiTaskProgressTracker();
