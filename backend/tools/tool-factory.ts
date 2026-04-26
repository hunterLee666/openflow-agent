import { z } from "zod";
import type { ToolDefinition } from "../types/capability.js";
import type { InputValidator, ToolValidationContext, ValidationResult } from "./validation.js";
import { validateWithZod, validateOutputWithZod } from "./validation.js";

export interface ToolConfig<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema?: z.ZodType<O>;
  handler: (input: I, ctx: unknown) => Promise<O>;
  validateInput?: InputValidator<I>;
  resourceKeys?: string[];
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
}

export function defineTool<I = unknown, O = unknown>(
  config: ToolConfig<I, O>
): ToolDefinition {
  const {
    name,
    description,
    inputSchema,
    outputSchema,
    handler,
    validateInput,
    isReadOnly,
    isConcurrencySafe,
    resourceKeys,
  } = config;

  const wrappedHandler: ToolDefinition["handler"] = async (
    rawInput: unknown,
    ctx: unknown
  ) => {
    const inputResult = validateWithZod(inputSchema, rawInput);
    if (!inputResult.ok || !inputResult.data) {
      throw new Error(
        inputResult.error?.message || "Input validation failed"
      );
    }

    const validatedInput = inputResult.data;

    if (validateInput) {
      const validationCtx: ToolValidationContext = {
        workspaceRoot: (ctx as any)?.workspaceRoot || "",
        sessionId: (ctx as any)?.sessionId,
        userId: (ctx as any)?.userId,
      };

      const customResult = await validateInput(validatedInput, validationCtx);
      if (!customResult.ok) {
        throw new Error(
          customResult.error?.message || "Custom validation failed"
        );
      }
    }

    const rawOutput = await handler(validatedInput, ctx);

    if (outputSchema) {
      const outputResult = validateOutputWithZod(outputSchema, rawOutput);
      if (!outputResult.ok || !outputResult.data) {
        throw new Error(
          outputResult.error?.message || "Output validation failed"
        );
      }
      return outputResult.data;
    }

    return rawOutput;
  };

  return {
    name,
    description,
    inputSchema: inputSchema,
    handler: wrappedHandler,
    isReadOnly,
    isConcurrencySafe,
    resourceKeys,
  };
}

export function createReadOnlyTool<I = unknown, O = unknown>(
  config: Omit<ToolConfig<I, O>, "isReadOnly" | "isConcurrencySafe"> & {
    isConcurrencySafe?: boolean;
  }
): ToolDefinition {
  return defineTool<I, O>({
    ...config,
    isReadOnly: true,
    isConcurrencySafe: config.isConcurrencySafe ?? true,
  });
}

export function createWriteTool<I = unknown, O = unknown>(
  config: Omit<ToolConfig<I, O>, "isReadOnly" | "isConcurrencySafe">
): ToolDefinition {
  return defineTool<I, O>({
    ...config,
    isReadOnly: false,
    isConcurrencySafe: false,
  });
}
