import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool, createWriteTool, createReadOnlyTool } from "./tool-factory.js";
import type { CommandRegistry } from "../commands/command-registry.js";

const TodoItemSchema = z.object({
  content: z.string().min(1, "content 不能为空"),
  activeForm: z.string().min(1, "activeForm 不能为空"),
  status: z.enum(["pending", "in_progress", "completed"]),
  priority: z.enum(["high", "medium", "low"]).optional(),
});

const TodoWriteInputSchema = z.object({
  todos: z.array(TodoItemSchema).min(1, "todos 至少需要一个任务"),
});

const ExitPlanModeInputSchema = z.object({
  plan: z.string().min(1, "plan 不能为空"),
});

const SlashCommandInputSchema = z.object({
  command: z.string().startsWith("/", "命令必须以 / 开头"),
});

const TaskInputSchema = z.object({
  subagent_type: z.enum(["general-purpose", "statusline-setup", "output-style-setup"]),
  description: z.string().min(1, "description 不能为空"),
  prompt: z.string().min(1, "prompt 不能为空"),
});

const TodoWriteOutputSchema = z.object({
  message: z.string(),
  count: z.number().int().positive(),
  inProgressCount: z.number(),
});

const ExitPlanModeOutputSchema = z.object({
  message: z.string(),
  planLength: z.number().int().nonnegative(),
});

const SlashCommandOutputSchema = z.object({
  message: z.string(),
  commandName: z.string(),
});

const TaskOutputSchema = z.object({
  message: z.string(),
  subagentType: z.string(),
});

interface TodoState {
  todos: z.infer<typeof TodoItemSchema>[];
  updatedAt: number;
}

export type TodoItem = z.infer<typeof TodoItemSchema>;
export type TodoWriteInput = z.infer<typeof TodoWriteInputSchema>;
export type ExitPlanModeInput = z.infer<typeof ExitPlanModeInputSchema>;
export type SlashCommandInput = z.infer<typeof SlashCommandInputSchema>;
export type TaskInput = z.infer<typeof TaskInputSchema>;

let todoState: TodoState = { todos: [], updatedAt: 0 };

export function createUtilityTools(commandRegistry?: CommandRegistry): ToolDefinition[] {
  const todoWriteTool = createWriteTool({
    name: "todo_write",
    description: "Create and manage structured task lists for tracking progress. Use for complex multi-step tasks (3+ steps). EXACTLY ONE task must be 'in_progress' at any time.",
    inputSchema: TodoWriteInputSchema,
    outputSchema: TodoWriteOutputSchema,
    handler: async (input) => {
      const inProgressCount = input.todos.filter((t) => t.status === "in_progress").length;
      if (inProgressCount !== 1) {
        throw new Error(`EXACTLY ONE task must be 'in_progress' at any time. Found ${inProgressCount}.`);
      }

      todoState = {
        todos: input.todos,
        updatedAt: Date.now(),
      };

      const summary = input.todos
        .map((t) => {
          const icon = t.status === "completed" ? "✅" : t.status === "in_progress" ? "🔄" : "⏳";
          return `${icon} ${t.content}`;
        })
        .join("\n");

      return {
        message: `Todo list updated (${input.todos.length} items):\n\n${summary}`,
        count: input.todos.length,
        inProgressCount,
      };
    },
  });

  const exitPlanModeTool = createReadOnlyTool({
    name: "ExitPlanMode",
    description: "Exit plan mode after presenting an implementation plan. Only use for tasks requiring code implementation planning.",
    inputSchema: ExitPlanModeInputSchema,
    outputSchema: ExitPlanModeOutputSchema,
    handler: async (input) => {
      return {
        message: `Plan submitted:\n\n${input.plan}`,
        planLength: input.plan.length,
      };
    },
  });

  const slashCommandTool = defineTool({
    name: "SlashCommand",
    description: commandRegistry
      ? `Execute slash commands within the conversation. Available commands: ${commandRegistry.getNames().join(", ")}`
      : "Execute slash commands within the conversation. Only available commands can be executed.",
    inputSchema: SlashCommandInputSchema,
    outputSchema: SlashCommandOutputSchema,
    isReadOnly: false,
    isConcurrencySafe: false,
    handler: async (input) => {
      if (commandRegistry) {
        const commandName = input.command.split(" ")[0].slice(1);
        const args = input.command.includes(" ") ? input.command.split(" ").slice(1).join(" ") : "";
        const result = commandRegistry.execute(commandName, args);
        return {
          message: result,
          commandName,
        };
      }

      const commandName = input.command.split(" ")[0].slice(1);
      const availableCommands = ["help", "clear", "status", "models", "budget", "plugins", "hooks", "memory"];

      if (!availableCommands.includes(commandName)) {
        throw new Error(`Unknown command: ${commandName}\nAvailable commands: ${availableCommands.join(", ")}`);
      }

      return {
        message: `Executing: ${input.command}`,
        commandName,
      };
    },
  });

  const taskTool = createReadOnlyTool({
    name: "Task",
    description: "Launch specialized sub-agents for complex, multi-step tasks. Available types: general-purpose (research, code search), statusline-setup, output-style-setup.",
    inputSchema: TaskInputSchema,
    outputSchema: TaskOutputSchema,
    handler: async (input) => {
      if (input.subagent_type === "general-purpose") {
        return {
          message: `Sub-agent '${input.description}' launched.\n\nTask: ${input.prompt}\n\nThe agent will search the codebase, read files, and return findings. Results will be delivered as a single summary message.`,
          subagentType: input.subagent_type,
        };
      }

      if (input.subagent_type === "statusline-setup") {
        return {
          message: `Status line configuration agent launched.\n\nTask: ${input.prompt}`,
          subagentType: input.subagent_type,
        };
      }

      if (input.subagent_type === "output-style-setup") {
        return {
          message: `Output style configuration agent launched.\n\nTask: ${input.prompt}`,
          subagentType: input.subagent_type,
        };
      }

      return {
        message: `Unknown sub-agent type: ${input.subagent_type}`,
        subagentType: input.subagent_type,
      };
    },
  });

  return [todoWriteTool, exitPlanModeTool, slashCommandTool, taskTool];
}

export function getTodoState(): TodoState {
  return todoState;
}

export function resetTodoState(): void {
  todoState = { todos: [], updatedAt: 0 };
}
