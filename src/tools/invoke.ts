import type { ToolDefinition, ToolContext } from "../types/index.js";
import {
  safeValidateInput,
  safeValidateOutput,
  formatValidationError,
  type SafeParseResult,
} from "./validation.js";

export interface ToolInvokeResult {
  type: "ok" | "invalid_input" | "invalid_output" | "error";
  data?: unknown;
  error?: {
    message: string;
    issues?: Array<{ path: (string | number)[]; message: string; code: string }>;
  };
}

export async function invokeTool(
  tool: ToolDefinition,
  rawInput: unknown,
  ctx: ToolContext
): Promise<ToolInvokeResult> {
  const inputResult = safeValidateInput(tool.inputSchema, rawInput);

  if (!inputResult.ok) {
    return {
      type: "invalid_input",
      error: {
        message: "Input validation failed",
        issues: inputResult.error.issues,
      },
    };
  }

  let rawOutput: unknown;
  try {
    rawOutput = await tool.handler(inputResult.data, ctx);
  } catch (e) {
    return {
      type: "error",
      error: {
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  if (tool.outputSchema) {
    const outputResult = safeValidateOutput(tool.outputSchema, rawOutput);

    if (!outputResult.ok) {
      return {
        type: "invalid_output",
        error: {
          message: "Output validation failed",
          issues: outputResult.error.issues,
        },
      };
    }

    return {
      type: "ok",
      data: outputResult.data,
    };
  }

  return {
    type: "ok",
    data: rawOutput,
  };
}

export function formatToolError(result: ToolInvokeResult): string {
  if (result.type === "ok") {
    return "";
  }

  if (result.type === "invalid_input") {
    return `Tool input validation failed:\n${formatValidationError({
      ok: false,
      error: { issues: result.error?.issues || [] },
    })}`;
  }

  if (result.type === "invalid_output") {
    return `Tool output validation failed:\n${formatValidationError({
      ok: false,
      error: { issues: result.error?.issues || [] },
    })}`;
  }

  return `Tool execution error: ${result.error?.message || "Unknown error"}`;
}
