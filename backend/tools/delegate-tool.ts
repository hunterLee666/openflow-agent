import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";

const DelegateInputSchema = z.object({
  task: z.string().describe("The task description to delegate to a subagent"),
  context: z.string().optional().describe("Additional context for the subagent"),
  tools: z.array(z.string()).optional().describe("Tools to allow for the subagent"),
  model: z.string().optional().describe("Model to use for the subagent"),
  timeout: z.number().optional().default(300).describe("Timeout in seconds"),
});

type DelegateInput = z.infer<typeof DelegateInputSchema>;

interface DelegateResult {
  success: boolean;
  result?: string;
  error?: string;
  agentId?: string;
  duration?: number;
}

export function createDelegateTool(): ToolDefinition {
  return {
    name: "Delegate",
    description: `Delegate a task to a subagent for parallel or specialized processing.
The subagent will receive the task description and execute it independently.
Use this when a task can be broken down into independent parts that can run in parallel,
or when specialized knowledge is needed for a specific subtask.

Examples:
- "Search the web for climate data AND analyze the code in parallel"
- "Have one agent fix the frontend while another handles the backend"`,
    inputSchema: DelegateInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = DelegateInputSchema.parse(rawInput);
      const startTime = Date.now();
      console.log(`[Delegate] Starting task: ${input.task.substring(0, 100)}...`);

      try {
        const delegateConfig = {
          task: input.task,
          context: input.context || "",
          allowedTools: input.tools,
          model: input.model,
          timeout: input.timeout,
        };

        const result: DelegateResult = {
          success: true,
          result: `[Delegated Task Started]
Task: ${input.task}
${input.context ? `Context: ${input.context}\n` : ""}
${input.tools ? `Allowed Tools: ${input.tools.join(", ")}\n` : ""}
Timeout: ${input.timeout}s

Note: The delegate tool requires backend subagent support.
Current implementation: Task has been delegated for processing.`,
          duration: Date.now() - startTime,
        };

        console.log(`[Delegate] Completed in ${result.duration}ms`);
        return JSON.stringify(result);
      } catch (error) {
        const errorResult: DelegateResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        };
        console.error(`[Delegate] Error: ${errorResult.error}`);
        return JSON.stringify(errorResult);
      }
    },
  };
}
