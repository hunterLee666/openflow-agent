import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export type CronExecutionMode = "main-session" | "isolated";

export type CronJobType = "recurring" | "once";

export type CronJobStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface CronJob {
  id: string;
  label: string;
  prompt: string;
  type: CronJobType;
  cronExpression?: string;
  runAt?: number;
  mode: CronExecutionMode;
  status: CronJobStatus;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  maxRuns?: number;
  expiresAt?: number;
  lastResult?: CronExecutionResult;
  boundSkills?: string[];
  boundWorkflows?: string[];
  metadata?: Record<string, unknown>;
}

export interface CronExecutionResult {
  jobId: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  output: string;
  error?: string;
}

export interface CronSchedulerConfig {
  dataDir: string;
  tickIntervalMs: number;
  maxHistory: number;
  defaultExpiresAfterDays: number;
}

const DEFAULT_CONFIG: CronSchedulerConfig = {
  dataDir: process.env.HOME ? `${process.env.HOME}/.openflow/cron` : ".openflow/cron",
  tickIntervalMs: 60000,
  maxHistory: 100,
  defaultExpiresAfterDays: 3,
};

export class CronScheduler extends EventEmitter {
  private jobs: Map<string, CronJob> = new Map();
  private runningJobs: Set<string> = new Set();
  private config: CronSchedulerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(config?: Partial<CronSchedulerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dataDir = resolve(this.config.dataDir);
    await mkdir(dataDir, { recursive: true });
    await mkdir(join(dataDir, "history"), { recursive: true });

    await this.loadJobs();
    this.startTicker();
    this.initialized = true;

    this.emit("scheduler:started", { jobCount: this.jobs.size });
  }

  async shutdown(): Promise<void> {
    this.stopTicker();
    await this.saveJobs();
    this.initialized = false;
    this.emit("scheduler:stopped");
  }

  createJob(params: {
    label: string;
    prompt: string;
    cronExpression?: string;
    runAt?: number;
    type?: CronJobType;
    mode?: CronExecutionMode;
    maxRuns?: number;
    expiresAt?: number;
    boundSkills?: string[];
    boundWorkflows?: string[];
    metadata?: Record<string, unknown>;
  }): CronJob {
    const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const jobType = params.type || (params.runAt ? "once" : "recurring");

    const job: CronJob = {
      id,
      label: params.label,
      prompt: params.prompt,
      type: jobType,
      cronExpression: params.cronExpression,
      runAt: params.runAt,
      mode: params.mode || "main-session",
      status: "pending",
      enabled: true,
      createdAt: now,
      updatedAt: now,
      nextRunAt: params.runAt || (params.cronExpression ? this.calculateNextRun(params.cronExpression) : undefined),
      runCount: 0,
      maxRuns: params.maxRuns || (params.runAt ? 1 : undefined),
      expiresAt: params.expiresAt,
      boundSkills: params.boundSkills,
      boundWorkflows: params.boundWorkflows,
      metadata: params.metadata,
    };

    this.jobs.set(id, job);
    this.saveJobs();

    this.emit("job:created", { id, job });

    return job;
  }

  getJob(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  getEnabledJobs(): CronJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.enabled && j.status !== "completed");
  }

  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "paused";
    job.updatedAt = Date.now();
    this.saveJobs();

    this.emit("job:paused", { id: jobId });
    return true;
  }

  resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "pending";
    job.updatedAt = Date.now();
    if (job.cronExpression) {
      job.nextRunAt = this.calculateNextRun(job.cronExpression);
    }
    this.saveJobs();

    this.emit("job:resumed", { id: jobId });
    return true;
  }

  deleteJob(jobId: string): boolean {
    const deleted = this.jobs.delete(jobId);
    if (deleted) {
      this.saveJobs();
      this.emit("job:deleted", { id: jobId });
    }
    return deleted;
  }

  enableJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.enabled = true;
    job.updatedAt = Date.now();
    this.saveJobs();

    this.emit("job:enabled", { id: jobId });
    return true;
  }

  disableJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.enabled = false;
    job.updatedAt = Date.now();
    this.saveJobs();

    this.emit("job:disabled", { id: jobId });
    return true;
  }

  async runJobNow(jobId: string, executor?: (job: CronJob) => Promise<CronExecutionResult>): Promise<CronExecutionResult | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return this.executeJob(job, executor);
  }

  editJob(jobId: string, updates: Partial<Pick<CronJob, "label" | "prompt" | "cronExpression" | "runAt" | "maxRuns" | "expiresAt" | "boundSkills" | "boundWorkflows">>): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (updates.label) job.label = updates.label;
    if (updates.prompt) job.prompt = updates.prompt;
    if (updates.cronExpression) {
      job.cronExpression = updates.cronExpression;
      job.type = "recurring";
      job.nextRunAt = this.calculateNextRun(updates.cronExpression);
    }
    if (updates.runAt) {
      job.runAt = updates.runAt;
      job.type = "once";
      job.nextRunAt = updates.runAt;
    }
    if (updates.maxRuns !== undefined) job.maxRuns = updates.maxRuns;
    if (updates.expiresAt !== undefined) job.expiresAt = updates.expiresAt;
    if (updates.boundSkills) job.boundSkills = updates.boundSkills;
    if (updates.boundWorkflows) job.boundWorkflows = updates.boundWorkflows;

    job.updatedAt = Date.now();
    this.saveJobs();

    this.emit("job:updated", { id: jobId });
    return true;
  }

  async getJobHistory(jobId: string, limit = 10): Promise<CronExecutionResult[]> {
    const historyFile = join(resolve(this.config.dataDir), "history", `${jobId}.json`);
    const exists = await this.pathExists(historyFile);

    if (!exists) return [];

    try {
      const content = await readFile(historyFile, "utf-8");
      const history = JSON.parse(content) as CronExecutionResult[];
      return history.slice(-limit);
    } catch {
      return [];
    }
  }

  async getStats(): Promise<{
    totalJobs: number;
    enabledJobs: number;
    runningJobs: number;
    pausedJobs: number;
    completedJobs: number;
    totalExecutions: number;
  }> {
    let totalExecutions = 0;
    let pausedJobs = 0;
    let completedJobs = 0;

    for (const job of this.jobs.values()) {
      totalExecutions += job.runCount;
      if (job.status === "paused") pausedJobs++;
      if (job.status === "completed") completedJobs++;
    }

    return {
      totalJobs: this.jobs.size,
      enabledJobs: this.getEnabledJobs().length,
      runningJobs: this.runningJobs.size,
      pausedJobs,
      completedJobs,
      totalExecutions,
    };
  }

  private startTicker(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.tick();
    }, this.config.tickIntervalMs);
  }

  private stopTicker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = Date.now();

    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (job.status === "paused" || job.status === "completed") continue;
      if (this.runningJobs.has(job.id)) continue;
      if (job.expiresAt && now > job.expiresAt) {
        job.status = "completed";
        job.updatedAt = now;
        this.saveJobs();
        this.emit("job:expired", { id: job.id });
        continue;
      }
      if (job.maxRuns && job.runCount >= job.maxRuns) {
        job.status = "completed";
        job.updatedAt = now;
        this.saveJobs();
        this.emit("job:max-runs-reached", { id: job.id });
        continue;
      }

      if (job.nextRunAt && job.nextRunAt <= now) {
        this.executeJob(job).catch((error) => {
          console.error(`Cron job ${job.label} failed:`, error);
        });
      }
    }
  }

  private async executeJob(
    job: CronJob,
    executor?: (job: CronJob) => Promise<CronExecutionResult>
  ): Promise<CronExecutionResult> {
    const startTime = Date.now();

    this.runningJobs.add(job.id);
    job.status = "running";
    job.lastRunAt = startTime;
    job.runCount++;
    this.saveJobs();

    this.emit("job:start", { id: job.id, job });

    let result: CronExecutionResult;

    try {
      if (executor) {
        result = await executor(job);
      } else {
        result = await this.defaultExecutor(job);
      }
    } catch (error) {
      result = {
        jobId: job.id,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        success: false,
        output: "",
        error: (error as Error).message,
      };
    }

    job.status = result.success ? "pending" : "failed";
    job.lastResult = result;
    if (job.type === "once") {
      job.status = "completed";
      job.nextRunAt = undefined;
    } else if (job.cronExpression) {
      job.nextRunAt = this.calculateNextRun(job.cronExpression);
    }
    job.updatedAt = Date.now();

    this.runningJobs.delete(job.id);
    this.saveJobs();

    await this.appendJobHistory(job.id, result);

    this.emit("job:complete", { id: job.id, result });

    return result;
  }

  private async defaultExecutor(job: CronJob): Promise<CronExecutionResult> {
    const startTime = Date.now();

    return {
      jobId: job.id,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      success: true,
      output: `Job "${job.label}" executed.\nPrompt: ${job.prompt}\nMode: ${job.mode}`,
    };
  }

  private async appendJobHistory(jobId: string, result: CronExecutionResult): Promise<void> {
    const historyFile = join(resolve(this.config.dataDir), "history", `${jobId}.json`);
    const exists = await this.pathExists(historyFile);

    let history: CronExecutionResult[] = [];
    if (exists) {
      try {
        const content = await readFile(historyFile, "utf-8");
        history = JSON.parse(content) as CronExecutionResult[];
      } catch {
        history = [];
      }
    }

    history.push(result);

    if (history.length > this.config.maxHistory) {
      history = history.slice(-this.config.maxHistory);
    }

    await writeFile(historyFile, JSON.stringify(history, null, 2));
  }

  private calculateNextRun(cronExpression: string): number | undefined {
    if (cronExpression.startsWith("@")) {
      return this.calculateSpecialExpression(cronExpression);
    }

    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return undefined;

    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    try {
      this.advanceToNextMatch(next, minute, hour, dayOfMonth, month, dayOfWeek);
    } catch {
      return undefined;
    }

    return next.getTime();
  }

  private advanceToNextMatch(
    date: Date,
    minute: string,
    hour: string,
    dayOfMonth: string,
    month: string,
    dayOfWeek: string
  ): void {
    const maxIterations = 525960;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      if (!this.matchesField(date.getMinutes(), minute)) {
        date.setMinutes(date.getMinutes() + 1);
        date.setSeconds(0);
        continue;
      }

      if (!this.matchesField(date.getHours(), hour)) {
        date.setHours(date.getHours() + 1);
        date.setMinutes(0);
        date.setSeconds(0);
        continue;
      }

      if (!this.matchesField(date.getMonth() + 1, month)) {
        date.setMonth(date.getMonth() + 1);
        date.setDate(1);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        continue;
      }

      const dayMatches = this.matchesField(date.getDate(), dayOfMonth) ||
        this.matchesField(date.getDay(), dayOfWeek);

      if (!dayMatches) {
        date.setDate(date.getDate() + 1);
        date.setHours(0);
        date.setMinutes(0);
        date.setSeconds(0);
        continue;
      }

      return;
    }

    throw new Error("Could not find next matching date");
  }

  private matchesField(value: number, field: string): boolean {
    if (field === "*") return true;

    if (field.includes(",")) {
      return field.split(",").some((part) => this.matchesField(value, part.trim()));
    }

    if (field.includes("/")) {
      const [start, step] = field.split("/");
      const startVal = start === "*" ? 0 : parseInt(start, 10);
      const stepVal = parseInt(step, 10);
      return value >= startVal && (value - startVal) % stepVal === 0;
    }

    if (field.includes("-")) {
      const [start, end] = field.split("-").map((s) => parseInt(s, 10));
      return value >= start && value <= end;
    }

    const fieldVal = parseInt(field, 10);
    return value === fieldVal;
  }

  private calculateSpecialExpression(expression: string): number | undefined {
    const now = new Date();

    switch (expression) {
      case "@hourly":
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        if (now <= new Date()) now.setHours(now.getHours() + 1);
        return now.getTime();

      case "@daily":
      case "@midnight":
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        if (now <= new Date()) now.setDate(now.getDate() + 1);
        return now.getTime();

      case "@weekly":
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        now.setDate(now.getDate() + (7 - now.getDay()));
        return now.getTime();

      case "@monthly":
        now.setDate(1);
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        if (now <= new Date()) now.setMonth(now.getMonth() + 1);
        return now.getTime();

      case "@yearly":
      case "@annually":
        now.setMonth(0);
        now.setDate(1);
        now.setHours(0);
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        if (now <= new Date()) now.setFullYear(now.getFullYear() + 1);
        return now.getTime();

      default:
        return undefined;
    }
  }

  private async loadJobs(): Promise<void> {
    const jobsFile = join(resolve(this.config.dataDir), "jobs.json");
    const exists = await this.pathExists(jobsFile);

    if (exists) {
      try {
        const content = await readFile(jobsFile, "utf-8");
        const jobsData = JSON.parse(content) as CronJob[];

        for (const job of jobsData) {
          this.jobs.set(job.id, job);
        }
      } catch {
        // Corrupted file, start fresh
      }
    }
  }

  private async saveJobs(): Promise<void> {
    const jobsFile = join(resolve(this.config.dataDir), "jobs.json");
    const jobsData = Array.from(this.jobs.values());

    await writeFile(jobsFile, JSON.stringify(jobsData, null, 2));
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

export function createCronScheduler(config?: Partial<CronSchedulerConfig>): CronScheduler {
  return new CronScheduler(config);
}
