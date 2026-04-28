import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool } from "./tool-factory.js";

const ClarifyInputSchema = z.object({
  question: z.string().min(1, "question 不能为空"),
  context: z.string().optional(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
});

const ClarifyOutputSchema = z.object({
  message: z.string(),
  question: z.string(),
  requiresResponse: z.boolean(),
});

export function createClarifyTools(): ToolDefinition[] {
  const clarifyTool = defineTool({
    name: "Clarify",
    description: `Request clarification from the user when the request is ambiguous, incomplete, or could have multiple interpretations. Use this tool when:

- The user's request has multiple possible interpretations
- Required information is missing (e.g., file path, specific values)
- You need to confirm details before proceeding with an action that could be destructive or irreversible
- The user asks about something unclear in the conversation history
- You want to verify your understanding before taking an important action

This tool presents a clear question to the user and waits for their response. The response will be injected back into the conversation.`,
    inputSchema: ClarifyInputSchema,
    outputSchema: ClarifyOutputSchema,
    isReadOnly: true,
    isConcurrencySafe: true,
    handler: async (input) => {
      const question = input.question;
      let contextMsg = "";

      if (input.context) {
        contextMsg = `\n\nContext:\n${input.context}`;
      }

      let optionsMsg = "";
      if (input.options && input.options.length > 0) {
        optionsMsg = "\n\nAvailable options:";
        for (const opt of input.options) {
          optionsMsg += `\n- ${opt.label}${opt.description ? `: ${opt.description}` : ""}`;
        }
      }

      const message = `🔔 **Clarification Needed**

${question}${contextMsg}${optionsMsg}

Please provide your clarification or select an option above.`;

      return {
        message,
        question,
        requiresResponse: true,
      };
    },
  });

  return [clarifyTool];
}