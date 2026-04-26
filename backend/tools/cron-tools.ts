import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import type { CronScheduler } from "../scheduler/cron-scheduler.js";
import { createReadOnlyTool, createWriteTool } from "./tool-factory.js";

const CronCreateInputSchema = z.object({
  label: z.string().min(1, "label 不能为空"),
  prompt: z.string().min(1, "prompt 不能为空"),
  cron: z.string().optional(),
  interval: z.string().optional(),
  runAt: z.string().optional(),
  type: z.enum(["recurring", "once"]).optional(),
  mode: z.enum(["main-session", "isolated"]).optional(),
  maxRuns: z.number().int().positive().optional(),
  expiresAfter: z.string().optional(),
  boundSkills: z.array(z.string()).optional(),
  boundWorkflows: z.array(z.string()).optional(),
});

const CronListInputSchema = z.object({
  status: z.enum(["all", "active", "paused", "completed"]).optional(),
});

const CronDeleteInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
});

const CronPauseInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
});

const CronResumeInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
});

const CronRunNowInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
});

const CronStatusInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
});

const CronHistoryInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
  limit: z.number().int().positive().optional(),
});

const CronEditInputSchema = z.object({
  jobId: z.string().min(1, "jobId 不能为空"),
  label: z.string().optional(),
  prompt: z.string().optional(),
  cron: z.string().optional(),
  runAt: z.string().optional(),
  maxRuns: z.number().int().positive().optional(),
  expiresAfter: z.string().optional(),
  boundSkills: z.array(z.string()).optional(),
  boundWorkflows: z.array(z.string()).optional(),
});

const CronStatsInputSchema = z.object({});

const CronOutputSchema = z.object({
  message: z.string(),
  success: z.boolean().optional(),
});

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
  const cronCreateTool = createWriteTool({
    name: "CronCreate",
    description: "Create a scheduled cron job. Supports cron expressions (e.g., '*/5 * * * *') or natural language intervals (e.g., '5m', '1h', '1d').",
    inputSchema: CronCreateInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      let cronExpression: string | undefined = input.cron;
      let runAtTime: number | undefined;

      if (input.runAt) {
        const parsed = new Date(input.runAt).getTime();
        if (isNaN(parsed)) {
          return { message: `Error: Invalid runAt format. Use ISO date string like "2024-01-01T10:00:00"`, success: false };
        }
        runAtTime = parsed;
      } else if (!cronExpression && input.interval) {
        const parsed = parseIntervalToCron(input.interval);
        if (!parsed) {
          return { message: `Error: Invalid interval format: ${input.interval}\nSupported formats: 5m, 1h, 1d`, success: false };
        }
        cronExpression = parsed;
      }

      if (!cronExpression && !runAtTime) {
        return { message: `Error: Either 'cron', 'interval', or 'runAt' must be provided.\nExamples:\n- cron: "*/5 * * * *" (every 5 minutes)\n- interval: "5m" (every 5 minutes)\n- runAt: "2024-01-01T10:00:00" (one-time)\n- cron: "@hourly" (every hour)`, success: false };
      }

      const expiresAt = input.expiresAfter ? parseExpiresAfter(input.expiresAfter) : undefined;

      const job = scheduler.createJob({
        label: input.label,
        prompt: input.prompt,
        cronExpression,
        runAt: runAtTime,
        type: input.type,
        mode: input.mode,
        maxRuns: input.maxRuns,
        expiresAt,
        boundSkills: input.boundSkills,
        boundWorkflows: input.boundWorkflows,
      });

      const scheduleStr = runAtTime ? new Date(runAtTime).toLocaleString() : (cronExpression ? formatCronExpression(cronExpression) : "unknown");
      const nextRunStr = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "unknown";

      return {
        message: `Cron job created successfully!\n\n` +
          `ID: ${job.id}\n` +
          `Label: ${job.label}\n` +
          `Type: ${job.type}\n` +
          `Schedule: ${scheduleStr}\n` +
          `Prompt: ${input.prompt}\n` +
          `Mode: ${job.mode}\n` +
          `Next run: ${nextRunStr}` +
          (input.maxRuns ? `\nMax runs: ${input.maxRuns}` : "") +
          (input.expiresAfter ? `\nExpires: ${input.expiresAfter}` : "") +
          (input.boundSkills && input.boundSkills.length > 0 ? `\nBound skills: ${input.boundSkills.join(", ")}` : "") +
          (input.boundWorkflows && input.boundWorkflows.length > 0 ? `\nBound workflows: ${input.boundWorkflows.join(", ")}` : ""),
        success: true,
      };
    },
  });

  const cronListTool = createReadOnlyTool({
    name: "CronList",
    description: "List all scheduled cron jobs. Optionally filter by status.",
    inputSchema: CronListInputSchema,
    outputSchema: CronOutputSchema,
    handler: async (input) => {
      const filter = input?.status || "all";

      let jobs = scheduler.getAllJobs();

      if (filter === "active") {
        jobs = jobs.filter((j) => j.enabled && j.status !== "paused" && j.status !== "completed");
      } else if (filter === "paused") {
        jobs = jobs.filter((j) => j.status === "paused");
      } else if (filter === "completed") {
        jobs = jobs.filter((j) => j.status === "completed");
      }

      if (jobs.length === 0) {
        return { message: "No cron jobs found.", success: true };
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

      return { message: `Scheduled Cron Jobs (${jobs.length}):\n\n${lines.join("\n\n")}`, success: true };
    },
  });

  const cronDeleteTool = createWriteTool({
    name: "CronDelete",
    description: "Delete a scheduled cron job by ID.",
    inputSchema: CronDeleteInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const deleted = scheduler.deleteJob(input.jobId);

      if (!deleted) {
        return { message: `Error: Job not found: ${input.jobId}`, success: false };
      }

      return { message: `Cron job deleted: ${input.jobId}`, success: true };
    },
  });

  const cronPauseTool = createWriteTool({
    name: "CronPause",
    description: "Pause a running or pending cron job.",
    inputSchema: CronPauseInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const paused = scheduler.pauseJob(input.jobId);

      if (!paused) {
        return { message: `Error: Job not found: ${input.jobId}`, success: false };
      }

      return { message: `Cron job paused: ${input.jobId}`, success: true };
    },
  });

  const cronResumeTool = createWriteTool({
    name: "CronResume",
    description: "Resume a paused cron job.",
    inputSchema: CronResumeInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const resumed = scheduler.resumeJob(input.jobId);

      if (!resumed) {
        return { message: `Error: Job not found: ${input.jobId}`, success: false };
      }

      return { message: `Cron job resumed: ${input.jobId}`, success: true };
    },
  });

  const cronRunNowTool = createWriteTool({
    name: "CronRunNow",
    description: "Execute a cron job immediately, outside of its schedule.",
    inputSchema: CronRunNowInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const result = await scheduler.runJobNow(input.jobId);

      if (!result) {
        return { message: `Error: Job not found: ${input.jobId}`, success: false };
      }

      const status = result.success ? "Success" : "Failed";
      return {
        message: `Job executed immediately.\n\n` +
          `Status: ${status}\n` +
          `Duration: ${formatDuration(result.duration)}\n` +
          `Output:\n${result.output}` +
          (result.error ? `\n\nError: ${result.error}` : ""),
        success: result.success,
      };
    },
  });

  const cronStatusTool = createReadOnlyTool({
    name: "CronStatus",
    description: "Get detailed status of a specific cron job.",
    inputSchema: CronStatusInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const job = scheduler.getJob(input.jobId);

      if (!job) {
        return { message: `Error: Job not found: ${input.jobId}`, success: false };
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

      return { message: output, success: true };
    },
  });

  const cronHistoryTool = createReadOnlyTool({
    name: "CronHistory",
    description: "Get execution history for a cron job.",
    inputSchema: CronHistoryInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const history = await scheduler.getJobHistory(input.jobId, input.limit || 10);

      if (history.length === 0) {
        return { message: `No execution history found for job: ${input.jobId}`, success: true };
      }

      const lines = history.map((entry, i) => {
        const status = entry.success ? "✅" : "❌";
        return `${i + 1}. ${status} ${new Date(entry.startTime).toLocaleString()}\n` +
          `   Duration: ${formatDuration(entry.duration)}\n` +
          `   Output: ${entry.output.slice(0, 100)}${entry.output.length > 100 ? "..." : ""}` +
          (entry.error ? `\n   Error: ${entry.error}` : "");
      });

      return { message: `Execution History for ${input.jobId}:\n\n${lines.join("\n\n")}`, success: true };
    },
  });

  const cronEditTool = createWriteTool({
    name: "CronEdit",
    description: "Edit an existing cron job's properties.",
    inputSchema: CronEditInputSchema,
    outputSchema: CronOutputSchema,
    resourceKeys: ["jobId"],
    handler: async (input) => {
      const updates: Record<string, unknown> = {};
      if (input.label) updates.label = input.label;
      if (input.prompt) updates.prompt = input.prompt;
      if (input.cron) updates.cronExpression = input.cron;
      if (input.runAt) updates.runAt = new Date(input.runAt).getTime();
      if (input.maxRuns) updates.maxRuns = input.maxRuns;
      if (input.expiresAfter) updates.expiresAt = parseExpiresAfter(input.expiresAfter);
      if (input.boundSkills) updates.boundSkills = input.boundSkills;
      if (input.boundWorkflows) updates.boundWorkflows = input.boundWorkflows;

      const updated = scheduler.editJob(input.jobId, updates as any);

      if (!updated) {
        return { message: `Error: Job not found: ${input.jobId}`, success: false };
      }

      return { message: `Cron job updated: ${input.jobId}`, success: true };
    },
  });

  const cronStatsTool = createReadOnlyTool({
    name: "CronStats",
    description: "Get statistics about all cron jobs.",
    inputSchema: CronStatsInputSchema,
    outputSchema: CronOutputSchema,
    handler: async () => {
      const stats = await scheduler.getStats();

      return {
        message: `Cron Scheduler Statistics\n` +
          `========================\n\n` +
          `Total jobs: ${stats.totalJobs}\n` +
          `Enabled jobs: ${stats.enabledJobs}\n` +
          `Running jobs: ${stats.runningJobs}\n` +
          `Paused jobs: ${stats.pausedJobs}\n` +
          `Completed jobs: ${stats.completedJobs}\n` +
          `Total executions: ${stats.totalExecutions}`,
        success: true,
      };
    },
  });

  return [
    cronCreateTool,
    cronListTool,
    cronDeleteTool,
    cronPauseTool,
    cronResumeTool,
    cronRunNowTool,
    cronStatusTool,
    cronHistoryTool,
    cronEditTool,
    cronStatsTool,
  ];
}
