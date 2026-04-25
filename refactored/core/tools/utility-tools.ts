import type { ToolDefinition } from "../types/index.js";

export interface TodoItem {
  content: string;
  activeForm: string;
  status: "pending" | "in_progress" | "completed";
  priority?: "high" | "medium" | "low";
}

export interface TodoWriteInput {
  todos: TodoItem[];
}

export interface ExitPlanModeInput {
  plan: string;
}

export interface SlashCommandInput {
  command: string;
}

export interface TaskInput {
  subagent_type: "general-purpose" | "statusline-setup" | "output-style-setup";
  description: string;
  prompt: string;
}

interface TodoState {
  todos: TodoItem[];
  updatedAt: number;
}

let todoState: TodoState = { todos: [], updatedAt: 0 };

export function createUtilityTools(): ToolDefinition[] {
  return [
    {
      name: "TodoWrite",
      description: "Create and manage structured task lists for tracking progress. Use for complex multi-step tasks (3+ steps). EXACTLY ONE task must be 'in_progress' at any time.",
      inputSchema: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string", description: "Task description in imperative form" },
                activeForm: { type: "string", description: "Present continuous form (e.g., 'Running tests')" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["content", "activeForm", "status"],
            },
          },
        },
        required: ["todos"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as TodoWriteInput;

        const inProgressCount = typed.todos.filter((t) => t.status === "in_progress").length;
        if (inProgressCount !== 1) {
          return `Error: EXACTLY ONE task must be 'in_progress' at any time. Found ${inProgressCount}.`;
        }

        todoState = {
          todos: typed.todos,
          updatedAt: Date.now(),
        };

        const summary = typed.todos
          .map((t) => {
            const icon = t.status === "completed" ? "✅" : t.status === "in_progress" ? "🔄" : "⏳";
            return `${icon} ${t.content}`;
          })
          .join("\n");

        return `Todo list updated (${typed.todos.length} items):\n\n${summary}`;
      },
    },
    {
      name: "ExitPlanMode",
      description: "Exit plan mode after presenting an implementation plan. Only use for tasks requiring code implementation planning.",
      inputSchema: {
        type: "object",
        properties: {
          plan: { type: "string", description: "The implementation plan (supports markdown)" },
        },
        required: ["plan"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as ExitPlanModeInput;
        return `Plan submitted:\n\n${typed.plan}`;
      },
    },
    {
      name: "SlashCommand",
      description: "Execute slash commands within the conversation. Only available commands can be executed.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Slash command with arguments (e.g., '/review-pr 123')" },
        },
        required: ["command"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as SlashCommandInput;

        if (!typed.command.startsWith("/")) {
          return "Error: Command must start with '/'";
        }

        const commandName = typed.command.split(" ")[0].slice(1);
        const availableCommands = ["help", "clear", "status", "models", "budget", "plugins", "hooks", "memory"];

        if (!availableCommands.includes(commandName)) {
          return `Unknown command: ${commandName}\nAvailable commands: ${availableCommands.join(", ")}`;
        }

        return `Executing: ${typed.command}`;
      },
    },
    {
      name: "Task",
      description: "Launch specialized sub-agents for complex, multi-step tasks. Available types: general-purpose (research, code search), statusline-setup, output-style-setup.",
      inputSchema: {
        type: "object",
        properties: {
          subagent_type: { type: "string", enum: ["general-purpose", "statusline-setup", "output-style-setup"], description: "Which agent type to use" },
          description: { type: "string", description: "Short 3-5 word description of the task" },
          prompt: { type: "string", description: "Detailed task description for the agent" },
        },
        required: ["subagent_type", "description", "prompt"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as TaskInput;

        if (typed.subagent_type === "general-purpose") {
          return `Sub-agent '${typed.description}' launched.\n\nTask: ${typed.prompt}\n\nThe agent will search the codebase, read files, and return findings. Results will be delivered as a single summary message.`;
        }

        if (typed.subagent_type === "statusline-setup") {
          return `Status line configuration agent launched.\n\nTask: ${typed.prompt}`;
        }

        if (typed.subagent_type === "output-style-setup") {
          return `Output style configuration agent launched.\n\nTask: ${typed.prompt}`;
        }

        return `Unknown sub-agent type: ${typed.subagent_type}`;
      },
    },
  ];
}

export function getTodoState(): TodoState {
  return todoState;
}

export function resetTodoState(): void {
  todoState = { todos: [], updatedAt: 0 };
}
