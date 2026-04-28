import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import type { TaskScheduler } from "../scheduler/task-scheduler.js";

const TaskCreateInputSchema = z.object({
  name: z.string().min(1, "name 不能为空"),
  description: z.string().optional(),
  command: z.string().min(1, "command 不能为空"),
  args: z.array(z.string()).optional(),
  cron: z.string().optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const TaskListInputSchema = z.object({
  status: z.enum(["all", "enabled", "disabled"]).optional(),
});

const TaskRunInputSchema = z.object({
  taskId: z.string().min(1, "taskId 不能为空"),
});

const TaskDeleteInputSchema = z.object({
  taskId: z.string().min(1, "taskId 不能为空"),
});

const TaskEnableInputSchema = z.object({
  taskId: z.string().min(1, "taskId 不能为空"),
});

const TaskDisableInputSchema = z.object({
  taskId: z.string().min(1, "taskId 不能为空"),
});

export function createTaskTools(scheduler: TaskScheduler): ToolDefinition[] {
  const TaskCreateTool: ToolDefinition = {
    name: "TaskCreate",
    description: `Create a scheduled shell command task.
Use this to schedule shell commands to run on a cron schedule.
The task will run automatically at the specified times.

Examples:
- Schedule a backup every day at 2am: cron="0 2 * * *", command="tar -czf backup.tar.gz data/"
- Run a script every hour: cron="0 * * * *", command="node scripts/hourly-task.js"`,
    inputSchema: TaskCreateInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = TaskCreateInputSchema.parse(rawInput);

      if (!input.cron) {
        return JSON.stringify({
          success: false,
          error: "cron expression is required",
        });
      }

      const taskId = scheduler.addTask({
        name: input.name,
        description: input.description || "",
        cronExpression: input.cron,
        command: input.command,
        args: input.args,
        cwd: input.cwd || process.cwd(),
        env: input.env,
        lastRun: undefined,
        nextRun: undefined,
        metadata: {},
      });

      return JSON.stringify({
        success: true,
        taskId,
        message: `Task '${input.name}' created successfully with cron: ${input.cron}`,
      });
    },
  };

  const TaskListTool: ToolDefinition = {
    name: "TaskList",
    description: `List all scheduled tasks.
Use this to see all tasks and their status.
Can filter by status: all, enabled, or disabled.`,
    inputSchema: TaskListInputSchema,
    isReadOnly: true,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = TaskListInputSchema.parse(rawInput);

      let tasks = scheduler.getAllTasks();

      if (input.status === "enabled") {
        tasks = tasks.filter((t) => t.enabled);
      } else if (input.status === "disabled") {
        tasks = tasks.filter((t) => !t.enabled);
      }

      const taskList = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        command: t.command,
        cron: t.cronExpression,
        enabled: t.enabled,
        lastRun: t.lastRun ? new Date(t.lastRun).toISOString() : null,
        nextRun: t.nextRun ? new Date(t.nextRun).toISOString() : null,
        runCount: t.runCount,
      }));

      return JSON.stringify({
        success: true,
        tasks: taskList,
        count: taskList.length,
      });
    },
  };

  const TaskRunNowTool: ToolDefinition = {
    name: "TaskRunNow",
    description: `Run a scheduled task immediately.
Use this to execute a task right now instead of waiting for its scheduled time.`,
    inputSchema: TaskRunInputSchema,
    isReadOnly: false,
    isConcurrencySafe: false,
    async handler(rawInput: unknown): Promise<string> {
      const input = TaskRunInputSchema.parse(rawInput);

      const result = await scheduler.runTaskNow(input.taskId);

      if (!result) {
        return JSON.stringify({
          success: false,
          error: `Task '${input.taskId}' not found`,
        });
      }

      return JSON.stringify({
        success: true,
        taskId: input.taskId,
        result: {
          exitCode: result.exitCode,
          duration: result.duration,
          stdout: result.stdout.substring(0, 1000),
          stderr: result.stderr.substring(0, 500),
          error: result.error,
        },
      });
    },
  };

  const TaskDeleteTool: ToolDefinition = {
    name: "TaskDelete",
    description: `Delete a scheduled task.
Use this to remove a task permanently.`,
    inputSchema: TaskDeleteInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = TaskDeleteInputSchema.parse(rawInput);

      const deleted = scheduler.removeTask(input.taskId);

      return JSON.stringify({
        success: deleted,
        taskId: input.taskId,
        message: deleted ? `Task deleted successfully` : `Task not found`,
      });
    },
  };

  const TaskEnableTool: ToolDefinition = {
    name: "TaskEnable",
    description: `Enable a disabled scheduled task.
Use this to re-enable a task that was previously disabled.`,
    inputSchema: TaskEnableInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = TaskEnableInputSchema.parse(rawInput);

      const enabled = scheduler.enableTask(input.taskId);

      return JSON.stringify({
        success: enabled,
        taskId: input.taskId,
        message: enabled ? `Task enabled successfully` : `Task not found`,
      });
    },
  };

  const TaskDisableTool: ToolDefinition = {
    name: "TaskDisable",
    description: `Disable a scheduled task.
Use this to temporarily pause a task without deleting it.`,
    inputSchema: TaskDisableInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = TaskDisableInputSchema.parse(rawInput);

      const disabled = scheduler.disableTask(input.taskId);

      return JSON.stringify({
        success: disabled,
        taskId: input.taskId,
        message: disabled ? `Task disabled successfully` : `Task not found`,
      });
    },
  };

  return [
    TaskCreateTool,
    TaskListTool,
    TaskRunNowTool,
    TaskDeleteTool,
    TaskEnableTool,
    TaskDisableTool,
  ];
}
