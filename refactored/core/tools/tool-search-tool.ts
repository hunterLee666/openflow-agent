import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { ToolManualRegistry, type ToolManualEntry } from "./tool-manual-registry.js";
import { createReadOnlyTool } from "./tool-factory.js";

export const ToolSearchToolConfigSchema = z.object({
  manualRegistry: z.instanceof(ToolManualRegistry),
  maxResults: z.number().int().positive().optional(),
});

export type ToolSearchToolConfig = z.infer<typeof ToolSearchToolConfigSchema>;

const ToolSearchInputSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  toolName: z.string().optional(),
});

const ToolSearchOutputSchema = z.object({
  message: z.string(),
  success: z.boolean().optional(),
});

export function createToolSearchTool(config: ToolSearchToolConfig): ToolDefinition {
  const { manualRegistry, maxResults = 5 } = config;

  return createReadOnlyTool({
    name: "ToolSearch",
    description: "Search tool manuals and documentation on demand. Use this to find detailed usage instructions, examples, and safety notes for any available tool.",
    inputSchema: ToolSearchInputSchema,
    outputSchema: ToolSearchOutputSchema,
    handler: async (input) => {
      try {
        if (input.toolName) {
          const manual = await manualRegistry.getManual(input.toolName);
          if (!manual) {
            return { message: `Tool "${input.toolName}" not found in manual registry.\n\nAvailable tools: ${manualRegistry.getAllToolNames().slice(0, 20).join(", ")}`, success: false };
          }
          return { message: formatToolManual(manual, true), success: true };
        }

        if (input.query) {
          const results = await manualRegistry.search(input.query, {
            category: input.category,
            limit: maxResults,
          });

          if (results.length === 0) {
            const categories = manualRegistry.getAllCategories();
            return { message: `No tools found matching "${input.query}".\n\nAvailable categories: ${categories.join(", ") || "none"}`, success: true };
          }

          const formatted = results.map((m) => formatToolManual(m, false)).join("\n\n---\n\n");
          return { message: `Found ${results.length} tool(s) matching "${input.query}":\n\n${formatted}`, success: true };
        }

        if (input.category) {
          const manuals = await manualRegistry.getManualsByCategory(input.category);
          if (manuals.length === 0) {
            return { message: `No tools found in category "${input.category}".\n\nAvailable categories: ${manualRegistry.getAllCategories().join(", ")}`, success: true };
          }

          const formatted = manuals.map((m) => formatToolManual(m, false)).join("\n\n---\n\n");
          return { message: `Tools in category "${input.category}":\n\n${formatted}`, success: true };
        }

        const allTools = manualRegistry.getAllToolNames();
        const categories = manualRegistry.getAllCategories();

        return { message: `Tool Manual Registry Stats:\n- Total tools: ${allTools.length}\n- Categories: ${categories.join(", ")}\n\nUse ToolSearch with query, toolName, or category to retrieve tool documentation.`, success: true };
      } catch (error) {
        return { message: `Error searching tool manuals: ${(error as Error).message}`, success: false };
      }
    },
  });
}

function formatToolManual(manual: ToolManualEntry, full: boolean): string {
  const lines: string[] = [];

  lines.push(`## ${manual.name}`);
  lines.push(manual.description);
  lines.push("");

  if (full) {
    lines.push(`### Usage`);
    lines.push(manual.usage);
    lines.push("");

    if (manual.examples.length > 0) {
      lines.push(`### Examples`);
      for (const example of manual.examples) {
        lines.push(`- ${example}`);
      }
      lines.push("");
    }

    if (manual.safetyNotes && manual.safetyNotes.length > 0) {
      lines.push(`### Safety Notes`);
      for (const note of manual.safetyNotes) {
        lines.push(`- ⚠️ ${note}`);
      }
      lines.push("");
    }

    if (manual.concurrencyInfo) {
      lines.push(`### Concurrency`);
      lines.push(`- Safe for parallel execution: ${manual.concurrencyInfo.isSafe ? "Yes" : "No"}`);
      if (manual.concurrencyInfo.resourceKeys?.length) {
        lines.push(`- Resource keys: ${manual.concurrencyInfo.resourceKeys.join(", ")}`);
      }
      lines.push("");
    }
  } else {
    lines.push(`Usage: ${manual.usage}`);
    if (manual.concurrencyInfo) {
      lines.push(`Concurrency: ${manual.concurrencyInfo.isSafe ? "Safe" : "Not safe"}`);
    }
  }

  return lines.join("\n");
}
