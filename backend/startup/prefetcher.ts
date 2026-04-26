import { z } from "zod";

export const PrefetchTaskSchema: z.ZodType<any> = z.object({
  name: z.string(),
  fn: z.function().args(z.instanceof(AbortSignal)).returns(z.promise(z.unknown())),
  timeoutMs: z.number(),
  critical: z.boolean(),
  dependsOn: z.array(z.string()).optional(),
});

export type PrefetchTask<T> = z.infer<typeof PrefetchTaskSchema>;

export const PrefetchResultSchema: z.ZodType<any> = z.object({
  name: z.string(),
  status: z.enum(["fulfilled", "rejected"]),
  value: z.unknown().optional(),
  error: z.instanceof(Error).optional(),
  durationMs: z.number(),
});

export type PrefetchResult<T> = z.infer<typeof PrefetchResultSchema>;

export const PrefetchReportSchema = z.object({
  results: z.array(PrefetchResultSchema),
  totalDurationMs: z.number(),
  allCriticalPassed: z.boolean(),
  partialFailure: z.boolean(),
});

export type PrefetchReport = z.infer<typeof PrefetchReportSchema>;

export const PrefetcherConfigSchema = z.object({
  defaultTimeoutMs: z.number(),
  concurrencyLimit: z.number(),
  logTiming: z.boolean(),
  logFn: z.function().args(z.string()).returns(z.void()).optional(),
});

export type PrefetcherConfig = z.infer<typeof PrefetcherConfigSchema>;

const DEFAULT_CONFIG: PrefetcherConfig = {
  defaultTimeoutMs: 5000,
  concurrencyLimit: 10,
  logTiming: true,
};

export class StartupPrefetcher {
  private config: PrefetcherConfig;

  constructor(config?: Partial<PrefetcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async run<T>(
    tasks: PrefetchTask<T>[],
    signal?: AbortSignal,
  ): Promise<PrefetchReport> {
    const startTime = Date.now();
    const dag = this.buildDag(tasks);
    const results = await this.executeDag(dag, signal);
    const totalDurationMs = Date.now() - startTime;

    const criticalResults = results.filter((r) => {
      const task = tasks.find((t) => t.name === r.name);
      return task?.critical;
    });

    const allCriticalPassed = criticalResults.every((r) => r.status === "fulfilled");
    const partialFailure = results.some((r) => r.status === "rejected");

    if (this.config.logTiming) {
      this.logReport(results, totalDurationMs);
    }

    return {
      results,
      totalDurationMs,
      allCriticalPassed,
      partialFailure,
    };
  }

  private buildDag<T>(tasks: PrefetchTask<T>[]): Map<string, PrefetchTask<T>> {
    const dag = new Map<string, PrefetchTask<T>>();
    for (const task of tasks) {
      dag.set(task.name, task);
    }

    for (const task of tasks) {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          if (!dag.has(dep)) {
            throw new Error(`Task "${task.name}" depends on unknown task "${dep}"`);
          }
        }
      }
    }

    return dag;
  }

  private async executeDag<T>(
    dag: Map<string, PrefetchTask<T>>,
    signal?: AbortSignal,
  ): Promise<PrefetchResult<T>[]> {
    const completed = new Map<string, PrefetchResult<T>>();
    const inFlight = new Map<string, Promise<PrefetchResult<T>>>();

    const executeTask = async (task: PrefetchTask<T>): Promise<PrefetchResult<T>> => {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          const depResult = completed.get(dep) || (await inFlight.get(dep));
          if (depResult && depResult.status === "rejected" && task.critical) {
            return {
              name: task.name,
              status: "rejected",
              error: new Error(`Dependency "${dep}" failed`),
              durationMs: 0,
            };
          }
        }
      }

      const timeoutMs = task.timeoutMs || this.config.defaultTimeoutMs;
      const startTime = Date.now();

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error(`Task "${task.name}" timed out after ${timeoutMs}ms`)), timeoutMs);
          timer.unref();
        });

        const taskPromise = task.fn(signal as AbortSignal);

        const value = await Promise.race([taskPromise, timeoutPromise]);
        const durationMs = Date.now() - startTime;

        const result: PrefetchResult<T> = {
          name: task.name,
          status: "fulfilled",
          value,
          durationMs,
        };

        completed.set(task.name, result);
        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const result: PrefetchResult<T> = {
          name: task.name,
          status: "rejected",
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs,
        };

        completed.set(task.name, result);
        return result;
      }
    };

    const levels = this.topologicalSort(dag);
    const allResults: PrefetchResult<T>[] = [];

    for (const level of levels) {
      const levelTasks = level.map((name) => dag.get(name)!);
      const limited = this.runWithConcurrency(limitTasks(levelTasks, this.config.concurrencyLimit), executeTask);
      const levelResults = await limited;
      allResults.push(...levelResults);
    }

    return allResults;
  }

  private topologicalSort<T>(dag: Map<string, PrefetchTask<T>>): string[][] {
    const visited = new Set<string>();
    const levels: string[][] = [];
    const remaining = new Set(dag.keys());

    while (remaining.size > 0) {
      const ready: string[] = [];

      for (const name of remaining) {
        const task = dag.get(name)!;
        const deps = task.dependsOn || [];
        if (deps.every((d: string) => visited.has(d))) {
          ready.push(name);
        }
      }

      if (ready.length === 0) {
        throw new Error("Circular dependency detected in prefetch tasks");
      }

      levels.push(ready);
      for (const name of ready) {
        visited.add(name);
        remaining.delete(name);
      }
    }

    return levels;
  }

  private async runWithConcurrency<T, R>(
    tasks: T[],
    fn: (task: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    let index = 0;

    const worker = async () => {
      while (index < tasks.length) {
        const currentIndex = index++;
        results[currentIndex] = await fn(tasks[currentIndex]!);
      }
    };

    await Promise.all(Array.from({ length: this.config.concurrencyLimit }, worker));
    return results;
  }

  private logReport(results: PrefetchResult<unknown>[], totalMs: number): void {
    const logFn = this.config.logFn || console.log;
    const lines = ["[StartupPrefetch] Timing report:"];

    for (const r of results) {
      const icon = r.status === "fulfilled" ? "✓" : "✗";
      const ms = r.durationMs.toFixed(0);
      lines.push(`  ${icon} ${r.name}: ${ms}ms${r.error ? ` (${r.error.message})` : ""}`);
    }

    lines.push(`  Total: ${totalMs}ms`);
    logFn(lines.join("\n"));
  }
}

function limitTasks<T>(tasks: T[], limit: number): T[] {
  return tasks.slice(0, limit);
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    timer.unref();
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer!);
  });
}

export function createPrefetchTask<T>(
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options?: { timeoutMs?: number; critical?: boolean; dependsOn?: string[] },
): PrefetchTask<T> {
  return {
    name,
    fn,
    timeoutMs: options?.timeoutMs ?? 5000,
    critical: options?.critical ?? false,
    dependsOn: options?.dependsOn,
  };
}
