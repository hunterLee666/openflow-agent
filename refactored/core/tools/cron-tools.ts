import type { ToolDefinition } from "../types/index.js";
import type { CronScheduler } from "../scheduler/cron-scheduler.js";
import type { CronJob, CronExecutionResult } from "../scheduler/cron-scheduler.js";

export interface CronCreateInput {
  label: string;
  prompt: string;
  cron?: string;
  interval?: string;
  runAt?: string;
  type?: "recurring" | "once";
  mode?: "main-session" | "isolated";
  maxRuns?: number;
  expiresAfter?: string;
  boundSkills?: string[];
  boundWorkflows?: string[];
}

export interface CronListInput {
  status?: "all" | "active" | "paused" | "completed";
}

export interface CronDeleteInput {
  jobId: string;
}

export interface CronPauseInput {
  jobId: string;
}

export interface CronResumeInput {
  jobId: string;
}

export interface CronRunNowInput {
  jobId: string;
}

export interface CronStatusInput {
  jobId: string;
}

export interface CronHistoryInput {
  jobId: string;
  limit?: number;
}

export interface CronEditInput {
  jobId: string;
  label?: string;
  prompt?: string;
  cron?: string;
  runAt?: string;
  maxRuns?: number;
  expiresAfter?: string;
  boundSkills?: string[];
  boundWorkflows?: string[];
}

const INTERVAL_PATTERN = /^(\d+)(s|m|h|d)$/;

function parseIntervalToCron(interval: string): string | null {
  const match = interval.match(INTERVAL_PATTERN);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      if (value < 60) return `*/1 * * * *`;
      return `*/${Math.floor(value / 60)} * * * *`;
    case "m":
      return `*/${value} * * * *`;
    case "h":
      return `0 */${value} * * *`;
    case "d":
      return `0 0 */${value} * *`;
    default:
      return null;
  }
}

function parseExpiresAfter(expiresAfter: string): number | undefined {
  const match = expiresAfter.match(INTERVAL_PATTERN);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = Date.now();

  switch (unit) {
    case "s": return now + value * 1000;
    case "m": return now + value * 60 * 1000;
    case "h": return now + value * 60 * 60 * 1000;
    case "d": return now + value * 24 * 60 * 60 * 1000;
    default: return undefined;
  }
}

function formatCronExpression(expr: string): string {
  const specialNames: Record<string, string> = {
    "@hourly": "每小时",
    "@daily": "每天",
    "@midnight": "每天",
    "@weekly": "每周",
    "@monthly": "每月",
    "@yearly": "每年",
    "@annually": "每年",
  };

  if (specialNames[expr]) return specialNames[expr];
  return expr;
}

function formatJobStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "等待中",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
  };
  return statusMap[status] || status;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return `${seconds}秒前`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) return `${minutes}分${seconds % 60}秒`;
  return `${seconds}秒`;
}

export function createCronTools(scheduler: CronScheduler): ToolDefinition[] {
  return [
    {
      name: "CronCreate",
      description: "Create a scheduled cron job. Supports cron expressions (e.g., '*/5 * * * *') or natural language intervals (e.g., '5m', '1h', '1d').",
      inputSchema: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short label for the job" },
          prompt: { type: "string", description: "The prompt or command to execute" },
          cron: { type: "string", description: "Cron expression (e.g., '*/5 * * * *', '@hourly', '@daily')" },
          interval: { type: "string", description: "Natural language interval (e.g., '5m', '1h', '1d')" },
          runAt: { type: "string", description: "One-time run timestamp (ISO format, e.g., '2024-01-01T10:00:00')" },
          type: { type: "string", enum: ["recurring", "once"], description: "Job type" },
          mode: { type: "string", enum: ["main-session", "isolated"], description: "Execution mode" },
          maxRuns: { type: "number", description: "Maximum number of runs (optional)" },
          expiresAfter: { type: "string", description: "Auto-expire after duration (e.g., '3d', '1h')" },
          boundSkills: { type: "array", items: { type: "string" }, description: "Skills to bind to this job" },
          boundWorkflows: { type: "array", items: { type: "string" }, description: "Workflows to bind to this job" },
        },
        required: ["label", "prompt"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as CronCreateInput;

        let cronExpression: string | undefined = typed.cron;
        let runAtTime: number | undefined;

        if (typed.runAt) {
          const parsed = new Date(typed.runAt).getTime();
          if (isNaN(parsed)) {
            return `Error: Invalid runAt format. Use ISO date string like "2024-01-01T10:00:00"`;
          }
          runAtTime = parsed;
        } else if (!cronExpression && typed.interval) {
          const parsed = parseIntervalToCron(typed.interval);
          if (!parsed) {
            return `Error: Invalid interval format: ${typed.interval}\nSupported formats: 5m, 1h, 1d`;
          }
          cronExpression = parsed;
        }

        if (!cronExpression && !runAtTime) {
          return `Error: Either 'cron', 'interval', or 'runAt' must be provided.\nExamples:\n- cron: "*/5 * * * *" (every 5 minutes)\n- interval: "5m" (every 5 minutes)\n- runAt: "2024-01-01T10:00:00" (one-time)\n- cron: "@hourly" (every hour)`;
        }

        const expiresAt = typed.expiresAfter ? parseExpiresAfter(typed.expiresAfter) : undefined;

        const job = scheduler.createJob({
          label: typed.label,
          prompt: typed.prompt,
          cronExpression,
          runAt: runAtTime,
          type: typed.type,
          mode: typed.mode,
          maxRuns: typed.maxRuns,
          expiresAt,
          boundSkills: typed.boundSkills,
          boundWorkflows: typed.boundWorkflows,
        });

        const scheduleStr = runAtTime ? new Date(runAtTime).toLocaleString() : (cronExpression ? formatCronExpression(cronExpression) : "unknown");
        const nextRunStr = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "unknown";

        return `Cron job created successfully!\n\n` +
          `ID: ${job.id}\n` +
          `Label: ${job.label}\n` +
          `Type: ${job.type}\n` +
          `Schedule: ${scheduleStr}\n` +
          `Prompt: ${typed.prompt}\n` +
          `Mode: ${job.mode}\n` +
          `Next run: ${nextRunStr}` +
          (typed.maxRuns ? `\nMax runs: ${typed.maxRuns}` : "") +
          (typed.expiresAfter ? `\nExpires: ${typed.expiresAfter}` : "") +
          (typed.boundSkills && typed.boundSkills.length > 0 ? `\nBound skills: ${typed.boundSkills.join(", ")}` : "") +
          (typed.boundWorkflows && typed.boundWorkflows.length > 0 ? `\nBound workflows: ${typed.boundWorkflows.join(", ")}` : "");
      },
    },
    {
      name: "CronList",
      description: "List all scheduled cron jobs. Optionally filter by status.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["all", "active", "paused", "completed"], description: "Filter by status" },
        },
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as CronListInput | undefined;
        const filter = typed?.status || "all";

        let jobs = scheduler.getAllJobs();

        if (filter === "active") {
          jobs = jobs.filter((j) => j.enabled && j.status !== "completed");
        } else if (filter === "paused") {
          jobs = jobs.filter((j) => j.status === "paused");
        } else if (filter === "completed") {
          jobs = jobs.filter((j) => j.status === "completed");
        }

        if (jobs.length === 0) {
          return "No cron jobs found.";
        }

        const lines = jobs.map((job) => {
          const statusIcon = job.status === "running" ? "🔄" :
            job.status === "paused" ? "⏸️" :
              job.status === "completed" ? "✅" :
                job.status === "failed" ? "❌" : "⏳";

          const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleTimeString() : "-";
          const lastRun = job.lastRunAt ? formatTimeAgo(job.lastRunAt) : "-";
          const scheduleStr = job.type === "once" && job.runAt ? new Date(job.runAt).toLocaleString() : (job.cronExpression || "-");

          return `${statusIcon} ${job.id.slice(0, 12)}... | ${job.label}\n` +
            `   Type: ${job.type} | Schedule: ${scheduleStr}\n` +
            `   Status: ${formatJobStatus(job.status)} | Runs: ${job.runCount}\n` +
            `   Last: ${lastRun} | Next: ${nextRun}` +
            (job.boundSkills && job.boundSkills.length > 0 ? `\n   Skills: ${job.boundSkills.join(", ")}` : "") +
            (job.boundWorkflows && job.boundWorkflows.length > 0 ? `\n   Workflows: ${job.boundWorkflows.join(", ")}` : "");
        });

        return `Scheduled Cron Jobs (${jobs.length}):\n\n${lines.join("\n\n")}`;
      },
    },
    {
      name: "CronDelete",
      description: "Delete a scheduled cron job by ID.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to delete" },
        },
        required: ["jobId"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as CronDeleteInput;
        const deleted = scheduler.deleteJob(typed.jobId);

        if (!deleted) {
          return `Error: Job not found: ${typed.jobId}`;
        }

        return `Cron job deleted: ${typed.jobId}`;
      },
    },
    {
      name: "CronPause",
      description: "Pause a running or pending cron job.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to pause" },
        },
        required: ["jobId"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as CronPauseInput;
        const paused = scheduler.pauseJob(typed.jobId);

        if (!paused) {
          return `Error: Job not found: ${typed.jobId}`;
        }

        return `Cron job paused: ${typed.jobId}`;
      },
    },
    {
      name: "CronResume",
      description: "Resume a paused cron job.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to resume" },
        },
        required: ["jobId"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as CronResumeInput;
        const resumed = scheduler.resumeJob(typed.jobId);

        if (!resumed) {
          return `Error: Job not found: ${typed.jobId}`;
        }

        return `Cron job resumed: ${typed.jobId}`;
      },
    },
    {
      name: "CronRunNow",
      description: "Execute a cron job immediately, outside of its schedule.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to run now" },
        },
        required: ["jobId"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as CronRunNowInput;

        const result = await scheduler.runJobNow(typed.jobId);

        if (!result) {
          return `Error: Job not found: ${typed.jobId}`;
        }

        const status = result.success ? "Success" : "Failed";
        return `Job executed immediately.\n\n` +
          `Status: ${status}\n` +
          `Duration: ${formatDuration(result.duration)}\n` +
          `Output:\n${result.output}` +
          (result.error ? `\n\nError: ${result.error}` : "");
      },
    },
    {
      name: "CronStatus",
      description: "Get detailed status of a specific cron job.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to check" },
        },
        required: ["jobId"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as CronStatusInput;
        const job = scheduler.getJob(typed.jobId);

        if (!job) {
          return `Error: Job not found: ${typed.jobId}`;
        }

        const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "-";
        const lastRun = job.lastRunAt ? formatTimeAgo(job.lastRunAt) : "-";
        const createdAt = new Date(job.createdAt).toLocaleString();
        const scheduleStr = job.type === "once" && job.runAt ? new Date(job.runAt).toLocaleString() : (job.cronExpression || "-");

        let output = `Cron Job Details\n`;
        output += `================\n\n`;
        output += `ID: ${job.id}\n`;
        output += `Label: ${job.label}\n`;
        output += `Type: ${job.type}\n`;
        output += `Status: ${formatJobStatus(job.status)}\n`;
        output += `Enabled: ${job.enabled ? "Yes" : "No"}\n`;
        output += `Schedule: ${scheduleStr}\n`;
        output += `Mode: ${job.mode}\n`;
        output += `Prompt: ${job.prompt}\n`;
        output += `Created: ${createdAt}\n`;
        output += `Last run: ${lastRun}\n`;
        output += `Next run: ${nextRun}\n`;
        output += `Total runs: ${job.runCount}`;

        if (job.boundSkills && job.boundSkills.length > 0) {
          output += `\nBound skills: ${job.boundSkills.join(", ")}`;
        }
        if (job.boundWorkflows && job.boundWorkflows.length > 0) {
          output += `\nBound workflows: ${job.boundWorkflows.join(", ")}`;
        }
        if (job.maxRuns) output += `\nMax runs: ${job.maxRuns}`;
        if (job.expiresAt) output += `\nExpires: ${new Date(job.expiresAt).toLocaleString()}`;

        if (job.lastResult) {
          output += `\n\nLast Result:\n`;
          output += `  Success: ${job.lastResult.success ? "Yes" : "No"}\n`;
          output += `  Duration: ${formatDuration(job.lastResult.duration)}\n`;
          output += `  Output: ${job.lastResult.output.slice(0, 200)}${job.lastResult.output.length > 200 ? "..." : ""}`;
        }

        return output;
      },
    },
    {
      name: "CronHistory",
      description: "Get execution history for a cron job.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID" },
          limit: { type: "number", description: "Number of history entries to return" },
        },
        required: ["jobId"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as CronHistoryInput;
        const history = await scheduler.getJobHistory(typed.jobId, typed.limit || 10);

        if (history.length === 0) {
          return `No execution history found for job: ${typed.jobId}`;
        }

        const lines = history.map((entry, i) => {
          const status = entry.success ? "✅" : "❌";
          return `${i + 1}. ${status} ${new Date(entry.startTime).toLocaleString()}\n` +
            `   Duration: ${formatDuration(entry.duration)}\n` +
            `   Output: ${entry.output.slice(0, 100)}${entry.output.length > 100 ? "..." : ""}` +
            (entry.error ? `\n   Error: ${entry.error}` : "");
        });

        return `Execution History for ${typed.jobId}:\n\n${lines.join("\n\n")}`;
      },
    },
    {
      name: "CronEdit",
      description: "Edit an existing cron job's properties.",
      inputSchema: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "The job ID to edit" },
          label: { type: "string", description: "New label" },
          prompt: { type: "string", description: "New prompt" },
          cron: { type: "string", description: "New cron expression" },
          runAt: { type: "string", description: "New one-time run timestamp (ISO format)" },
          maxRuns: { type: "number", description: "New max runs" },
          expiresAfter: { type: "string", description: "New expiry duration" },
          boundSkills: { type: "array", items: { type: "string" }, description: "New bound skills" },
          boundWorkflows: { type: "array", items: { type: "string" }, description: "New bound workflows" },
        },
        required: ["jobId"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as CronEditInput;

        const updates: Record<string, unknown> = {};
        if (typed.label) updates.label = typed.label;
        if (typed.prompt) updates.prompt = typed.prompt;
        if (typed.cron) updates.cronExpression = typed.cron;
        if (typed.runAt) updates.runAt = new Date(typed.runAt).getTime();
        if (typed.maxRuns) updates.maxRuns = typed.maxRuns;
        if (typed.expiresAfter) updates.expiresAt = parseExpiresAfter(typed.expiresAfter);
        if (typed.boundSkills) updates.boundSkills = typed.boundSkills;
        if (typed.boundWorkflows) updates.boundWorkflows = typed.boundWorkflows;

        const updated = scheduler.editJob(typed.jobId, updates as any);

        if (!updated) {
          return `Error: Job not found: ${typed.jobId}`;
        }

        return `Cron job updated: ${typed.jobId}`;
      },
    },
    {
      name: "CronStats",
      description: "Get statistics about all cron jobs.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      isReadOnly: true,
      handler: async () => {
        const stats = await scheduler.getStats();

        return `Cron Scheduler Statistics\n` +
          `========================\n\n` +
          `Total jobs: ${stats.totalJobs}\n` +
          `Enabled jobs: ${stats.enabledJobs}\n` +
          `Running jobs: ${stats.runningJobs}\n` +
          `Paused jobs: ${stats.pausedJobs}\n` +
          `Completed jobs: ${stats.completedJobs}\n` +
          `Total executions: ${stats.totalExecutions}`;
      },
    },
  ];
}
