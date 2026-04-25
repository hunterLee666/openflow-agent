export interface ConsolidationConfig {
  intervalMs: number;
  batchSize: number;
  similarityThreshold: number;
  maxConsolidationTimeMs: number;
  enableAutoPruning: boolean;
  pruningConfidenceThreshold: number;
  offPeakHours: [number, number];
}

export interface ConsolidationStats {
  totalConsolidations: number;
  lastConsolidation: number | null;
  totalMemoriesConsolidated: number;
  totalMemoriesPruned: number;
  averageConsolidationTimeMs: number;
  lastRunDurationMs: number | null;
}

export interface ConsolidationResult {
  consolidated: number;
  pruned: number;
  merged: number;
  durationMs: number;
  timestamp: number;
}

type ConsolidationCallback = (result: ConsolidationResult) => void;

const DEFAULT_CONFIG: ConsolidationConfig = {
  intervalMs: 30 * 60 * 1000,
  batchSize: 50,
  similarityThreshold: 0.85,
  maxConsolidationTimeMs: 5000,
  enableAutoPruning: true,
  pruningConfidenceThreshold: 0.1,
  offPeakHours: [2, 6],
};

export class ConsolidationScheduler {
  private config: ConsolidationConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private stats: ConsolidationStats = {
    totalConsolidations: 0,
    lastConsolidation: null,
    totalMemoriesConsolidated: 0,
    totalMemoriesPruned: 0,
    averageConsolidationTimeMs: 0,
    lastRunDurationMs: null,
  };
  private callbacks: ConsolidationCallback[] = [];
  private consolidateFn: ((batchSize: number, similarityThreshold: number) => Promise<{ consolidated: number; merged: number }>) | null = null;
  private pruneFn: ((threshold: number) => Promise<number>) | null = null;
  private applyDecayFn: (() => Promise<void>) | null = null;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConsolidateFn(fn: (batchSize: number, similarityThreshold: number) => Promise<{ consolidated: number; merged: number }>): void {
    this.consolidateFn = fn;
  }

  setPruneFn(fn: (threshold: number) => Promise<number>): void {
    this.pruneFn = fn;
  }

  setApplyDecayFn(fn: () => Promise<void>): void {
    this.applyDecayFn = fn;
  }

  onConsolidation(callback: ConsolidationCallback): void {
    this.callbacks.push(callback);
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.runConsolidation();
    }, this.config.intervalMs);

    this.runConsolidation();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runConsolidation(): Promise<ConsolidationResult> {
    if (this.isRunning) {
      return { consolidated: 0, pruned: 0, merged: 0, durationMs: 0, timestamp: Date.now() };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      if (this.applyDecayFn) {
        await this.applyDecayFn();
      }

      let consolidated = 0;
      let merged = 0;

      if (this.consolidateFn) {
        const result = await this.consolidateFn(this.config.batchSize, this.config.similarityThreshold);
        consolidated = result.consolidated;
        merged = result.merged;
      }

      let pruned = 0;

      if (this.config.enableAutoPruning && this.pruneFn) {
        pruned = await this.pruneFn(this.config.pruningConfidenceThreshold);
      }

      const durationMs = Date.now() - startTime;

      const result: ConsolidationResult = {
        consolidated,
        pruned,
        merged,
        durationMs,
        timestamp: Date.now(),
      };

      this.updateStats(result);

      for (const callback of this.callbacks) {
        try {
          callback(result);
        } catch {
          // Ignore callback errors
        }
      }

      return result;
    } catch {
      return { consolidated: 0, pruned: 0, merged: 0, durationMs: Date.now() - startTime, timestamp: Date.now() };
    } finally {
      this.isRunning = false;
    }
  }

  isOffPeak(): boolean {
    const currentHour = new Date().getHours();
    const [start, end] = this.config.offPeakHours;

    if (start <= end) {
      return currentHour >= start && currentHour < end;
    }

    return currentHour >= start || currentHour < end;
  }

  async runIfOffPeak(): Promise<ConsolidationResult | null> {
    if (this.isOffPeak()) {
      return this.runConsolidation();
    }

    return null;
  }

  getStats(): ConsolidationStats {
    return { ...this.stats };
  }

  getConfig(): ConsolidationConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ConsolidationConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.intervalId && config.intervalMs !== undefined) {
      this.stop();
      this.start();
    }
  }

  isRunningStatus(): boolean {
    return this.isRunning;
  }

  private updateStats(result: ConsolidationResult): void {
    this.stats.totalConsolidations++;
    this.stats.lastConsolidation = result.timestamp;
    this.stats.totalMemoriesConsolidated += result.consolidated;
    this.stats.totalMemoriesPruned += result.pruned;
    this.stats.lastRunDurationMs = result.durationMs;

    const totalRuns = this.stats.totalConsolidations;
    const prevAvg = this.stats.averageConsolidationTimeMs * (totalRuns - 1);
    this.stats.averageConsolidationTimeMs = (prevAvg + result.durationMs) / totalRuns;
  }
}

export function createConsolidationScheduler(config?: Partial<ConsolidationConfig>): ConsolidationScheduler {
  return new ConsolidationScheduler(config);
}
