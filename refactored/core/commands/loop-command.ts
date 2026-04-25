import type { CommandDefinition } from "./command-registry.js";
import type { CronScheduler } from "../scheduler/cron-scheduler.js";

const CRON_PATTERNS: Array<{ pattern: RegExp; cron: string; label: string }> = [
  { pattern: /(?:every\s+)?(\d+)\s*(?:min|minute)s?/i, cron: "*/$1 * * * *", label: "每 $1 分钟" },
  { pattern: /(?:every\s+)?(\d+)\s*(?:hour|hr)s?/i, cron: "0 */$1 * * *", label: "每 $1 小时" },
  { pattern: /(?:every\s+)?(\d+)\s*days?/i, cron: "0 0 */$1 * *", label: "每 $1 天" },
  { pattern: /(?:every\s+)?(\d+)\s*weeks?/i, cron: "0 0 * * $1", label: "每 $1 周" },
  { pattern: /hourly/i, cron: "@hourly", label: "每小时" },
  { pattern: /daily|every\s+day/i, cron: "@daily", label: "每天" },
  { pattern: /weekly|every\s+week/i, cron: "@weekly", label: "每周" },
  { pattern: /monthly|every\s+month/i, cron: "@monthly", label: "每月" },
];

const ONCE_PATTERN = /^(?:once|at|run\s+at|run\s+on)\s+(.+)$/i;

function parseNaturalLanguage(input: string): { cron?: string; runAt?: number; type?: "recurring" | "once"; label?: string; prompt?: string } | null {
  const trimmed = input.trim();

  const onceMatch = trimmed.match(ONCE_PATTERN);
  if (onceMatch) {
    const dateStr = onceMatch[1].trim();
    const runAt = new Date(dateStr).getTime();
    if (!isNaN(runAt) && runAt > Date.now()) {
      const prompt = trimmed.replace(onceMatch[0], "").trim() || "Execute one-time task";
      return {
        runAt,
        type: "once",
        label: `Once: ${new Date(runAt).toLocaleString()}`,
        prompt,
      };
    }
  }

  for (const { pattern, cron, label } of CRON_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const resolvedCron = cron.replace(/\$(\d+)/g, (_, num) => match[num] || "");
      const prompt = trimmed.replace(match[0], "").trim();

      return {
        cron: resolvedCron,
        type: "recurring",
        label: label.replace(/\$(\d+)/g, (_, num) => match[num] || ""),
        prompt: prompt || "Execute scheduled task",
      };
    }
  }

  const cronMatch = trimmed.match(/^([0-9*,/-]+\s+){4}[0-9*,/-]+\s*(.*)$/);
  if (cronMatch) {
    return {
      cron: cronMatch[0].trim().split(/\s+(.*)/)[0],
      type: "recurring",
      prompt: cronMatch[2]?.trim() || "Execute scheduled task",
      label: `Cron: ${cronMatch[0].trim().split(/\s+(.*)/)[0]}`,
    };
  }

  return null;
}

export function createLoopCommand(scheduler: CronScheduler): CommandDefinition {
  return {
    name: "loop",
    description: "Create and manage scheduled cron jobs using natural language or cron expressions.",
    handler: async (args: string) => {
      const input = args.trim();

      if (!input || input === "help") {
        return `Usage: /loop <schedule> <task description>

Examples:
  /loop every 5 minutes check for new emails
  /loop hourly run backup script
  /loop @daily generate daily report
  /loop 0 9 * * * send morning summary

Commands:
  /loop list              - List all scheduled jobs
  /loop status <job-id>   - Get job details
  /loop pause <job-id>    - Pause a job
  /loop resume <job-id>   - Resume a paused job
  /loop delete <job-id>   - Delete a job
  /loop run <job-id>      - Run a job immediately`;
      }

      if (input === "list") {
        const jobs = scheduler.getAllJobs();

        if (jobs.length === 0) {
          return "No scheduled jobs found.";
        }

        const lines = jobs.map((job) => {
          const statusIcon = job.status === "running" ? "🔄" :
            job.status === "paused" ? "⏸️" :
              job.status === "completed" ? "✅" :
                job.status === "failed" ? "❌" : "⏳";

          const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleTimeString() : "-";

          return `${statusIcon} ${job.id.slice(0, 12)}... | ${job.label}\n` +
            `   Schedule: ${job.cronExpression} | Next: ${nextRun}`;
        });

        return `Scheduled Jobs (${jobs.length}):\n\n${lines.join("\n\n")}`;
      }

      if (input.startsWith("status ")) {
        const jobId = input.slice(7).trim();
        const job = scheduler.getJob(jobId);

        if (!job) {
          return `Error: Job not found: ${jobId}`;
        }

        const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "-";
        const lastRun = job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "-";

        return `Job Details:\n\n` +
          `ID: ${job.id}\n` +
          `Label: ${job.label}\n` +
          `Status: ${job.status}\n` +
          `Schedule: ${job.cronExpression}\n` +
          `Prompt: ${job.prompt}\n` +
          `Mode: ${job.mode}\n` +
          `Runs: ${job.runCount}\n` +
          `Last run: ${lastRun}\n` +
          `Next run: ${nextRun}`;
      }

      if (input.startsWith("pause ")) {
        const jobId = input.slice(6).trim();
        const paused = scheduler.pauseJob(jobId);

        if (!paused) {
          return `Error: Job not found: ${jobId}`;
        }

        return `Job paused: ${jobId}`;
      }

      if (input.startsWith("resume ")) {
        const jobId = input.slice(7).trim();
        const resumed = scheduler.resumeJob(jobId);

        if (!resumed) {
          return `Error: Job not found: ${jobId}`;
        }

        return `Job resumed: ${jobId}`;
      }

      if (input.startsWith("delete ")) {
        const jobId = input.slice(7).trim();
        const deleted = scheduler.deleteJob(jobId);

        if (!deleted) {
          return `Error: Job not found: ${jobId}`;
        }

        return `Job deleted: ${jobId}`;
      }

      if (input.startsWith("run ")) {
        const jobId = input.slice(4).trim();
        const result = await scheduler.runJobNow(jobId);

        if (!result) {
          return `Error: Job not found: ${jobId}`;
        }

        return `Job executed:\n\n` +
          `Status: ${result.success ? "Success" : "Failed"}\n` +
          `Duration: ${Math.floor(result.duration / 1000)}s\n` +
          `Output:\n${result.output}` +
          (result.error ? `\n\nError: ${result.error}` : "");
      }

      const parsed = parseNaturalLanguage(input);

      if (!parsed || (!parsed.cron && !parsed.runAt)) {
        return `Error: Could not parse schedule. Please use one of these formats:\n\n` +
          `- Recurring: "every 5 minutes check emails"\n` +
          `- Preset: "hourly run backup"\n` +
          `- Cron expression: "*/5 * * * * check emails"\n` +
          `- One-time: "once 2024-01-01T10:00:00 send report"\n\n` +
          `Use "/loop help" for more examples.`;
      }

      const job = scheduler.createJob({
        label: parsed.label || (parsed.prompt ? parsed.prompt.slice(0, 30) : "Scheduled Task"),
        prompt: parsed.prompt || "Execute scheduled task",
        cronExpression: parsed.cron,
        runAt: parsed.runAt,
        type: parsed.type,
      });

      const scheduleStr = parsed.runAt ? new Date(parsed.runAt).toLocaleString() : (parsed.cron || "unknown");
      const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "unknown";

      return `Cron job created successfully!\n\n` +
        `ID: ${job.id}\n` +
        `Label: ${job.label}\n` +
        `Type: ${job.type}\n` +
        `Schedule: ${scheduleStr}\n` +
        `Task: ${parsed.prompt}\n` +
        `Next run: ${nextRun}`;
    },
  };
}
