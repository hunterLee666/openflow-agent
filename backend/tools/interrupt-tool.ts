import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";

const InterruptInputSchema = z.object({
  action: z.enum(["check", "cancel", "pause", "resume"]).describe("Action to perform"),
  taskId: z.string().optional().describe("Task ID for cancel/pause/resume actions"),
  reason: z.string().optional().describe("Reason for the interrupt"),
});

const taskStates = new Map<string, {
  status: "running" | "paused" | "cancelled" | "completed";
  startedAt: number;
  pausedAt?: number;
  cancelledAt?: number;
  cancelledReason?: string;
  progress?: number;
}>();

type InterruptInput = z.infer<typeof InterruptInputSchema>;

interface InterruptResult {
  success: boolean;
  taskId?: string;
  status?: string;
  message?: string;
  error?: string;
}

export function createInterruptTool(): ToolDefinition {
  return {
    name: "Interrupt",
    description: `Manage task interruption - check status, cancel, pause, or resume tasks.
Use this tool when:
- A long-running task needs to be gracefully stopped
- You need to pause a task to gather more information
- You want to check if a task can be safely interrupted
- A task is taking too long and should be cancelled

Note: This tool provides the mechanism for interruption, but actual task interruption
depends on whether the running task supports graceful shutdown.`,
    inputSchema: InterruptInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = InterruptInputSchema.parse(rawInput);
      console.log(`[Interrupt] Action: ${input.action}, Task: ${input.taskId || "none"}`);

      try {
        switch (input.action) {
          case "check": {
            if (!input.taskId) {
              const runningTasks = Array.from(taskStates.entries())
                .filter(([, state]) => state.status === "running")
                .map(([id]) => id);

              return JSON.stringify({
                success: true,
                message: runningTasks.length === 0
                  ? "No running tasks found"
                  : `[Running Tasks]\n${runningTasks.join("\n")}`,
              });
            }

            const state = taskStates.get(input.taskId);
            if (!state) {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} not found` });
            }

            const result: InterruptResult = {
              success: true,
              taskId: input.taskId,
              status: state.status,
              message: `[Task Status]
Task ID: ${input.taskId}
Status: ${state.status}
Started: ${new Date(state.startedAt).toISOString()}
${state.pausedAt ? `Paused: ${new Date(state.pausedAt).toISOString()}\n` : ""}
${state.cancelledAt ? `Cancelled: ${new Date(state.cancelledAt).toISOString()}\n` : ""}
${state.cancelledReason ? `Reason: ${state.cancelledReason}\n` : ""}
${state.progress !== undefined ? `Progress: ${state.progress}%\n` : ""}`,
            };
            return JSON.stringify(result);
          }

          case "cancel": {
            if (!input.taskId) {
              return JSON.stringify({ success: false, error: "taskId is required for cancel action" });
            }
            const state = taskStates.get(input.taskId);
            if (!state) {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} not found` });
            }
            if (state.status === "cancelled") {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} is already cancelled` });
            }
            if (state.status === "completed") {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} is already completed` });
            }

            state.status = "cancelled";
            state.cancelledAt = Date.now();
            state.cancelledReason = input.reason || "No reason provided";

            const result: InterruptResult = {
              success: true,
              taskId: input.taskId,
              status: "cancelled",
              message: `[Task Cancelled]
Task ID: ${input.taskId}
Cancelled: ${new Date(state.cancelledAt).toISOString()}
Reason: ${state.cancelledReason}`,
            };
            console.log(`[Interrupt] Cancelled task: ${input.taskId}`);
            return JSON.stringify(result);
          }

          case "pause": {
            if (!input.taskId) {
              return JSON.stringify({ success: false, error: "taskId is required for pause action" });
            }
            const state = taskStates.get(input.taskId);
            if (!state) {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} not found` });
            }
            if (state.status !== "running") {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} is not running (status: ${state.status})` });
            }

            state.status = "paused";
            state.pausedAt = Date.now();

            const result: InterruptResult = {
              success: true,
              taskId: input.taskId,
              status: "paused",
              message: `[Task Paused]
Task ID: ${input.taskId}
Paused: ${new Date(state.pausedAt).toISOString()}`,
            };
            console.log(`[Interrupt] Paused task: ${input.taskId}`);
            return JSON.stringify(result);
          }

          case "resume": {
            if (!input.taskId) {
              return JSON.stringify({ success: false, error: "taskId is required for resume action" });
            }
            const state = taskStates.get(input.taskId);
            if (!state) {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} not found` });
            }
            if (state.status !== "paused") {
              return JSON.stringify({ success: false, error: `Task ${input.taskId} is not paused (status: ${state.status})` });
            }

            state.status = "running";
            state.pausedAt = undefined;

            const result: InterruptResult = {
              success: true,
              taskId: input.taskId,
              status: "running",
              message: `[Task Resumed]
Task ID: ${input.taskId}
Status: running`,
            };
            console.log(`[Interrupt] Resumed task: ${input.taskId}`);
            return JSON.stringify(result);
          }

          default:
            return JSON.stringify({ success: false, error: `Unknown action: ${input.action}` });
        }
      } catch (error) {
        const errorResult: InterruptResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        console.error(`[Interrupt] Error: ${errorResult.error}`);
        return JSON.stringify(errorResult);
      }
    },
  };
}
