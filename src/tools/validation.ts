import { z } from "zod";

export interface ToolValidationError {
  type: "input" | "output" | "validation";
  message: string;
  issues?: z.ZodIssue[];
  recoverable: boolean;
}

export interface ValidationResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: ToolValidationError;
}

export interface ToolValidationContext {
  workspaceRoot: string;
  sessionId?: string;
  userId?: string;
}

export type InputValidator<I> = (
  input: I,
  ctx: ToolValidationContext
) => Promise<ValidationResult<I>> | ValidationResult<I>;

export function createInputValidationError(
  issues: z.ZodIssue[],
  recoverable = true
): ToolValidationError {
  return {
    type: "input",
    message: `Input validation failed: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    issues,
    recoverable,
  };
}

export function createOutputValidationError(
  issues: z.ZodIssue[],
  recoverable = false
): ToolValidationError {
  return {
    type: "output",
    message: `Output validation failed: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    issues,
    recoverable,
  };
}

export function createValidationFailure(
  type: "input" | "output" | "validation",
  message: string,
  recoverable = true
): ValidationResult<never> {
  return {
    ok: false,
    error: {
      type,
      message,
      recoverable,
    },
  };
}

export function createValidationSuccess<T>(data: T): ValidationResult<T> {
  return {
    ok: true,
    data,
  };
}

export function validateWithZod<I>(
  schema: z.ZodType<I>,
  raw: unknown
): ValidationResult<I> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    return createValidationFailure(
      "input",
      `Input validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      true
    );
  }
  return createValidationSuccess(result.data);
}

export function validateOutputWithZod<O>(
  schema: z.ZodType<O>,
  raw: unknown
): ValidationResult<O> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    return createValidationFailure(
      "output",
      `Output validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      false
    );
  }
  return createValidationSuccess(result.data);
}

export function formatValidationForModel(error: ToolValidationError): string {
  if (error.issues && error.issues.length > 0) {
    const details = error.issues
      .map((i) => `- Field "${i.path.join(".") || "(root)"}": ${i.message}`)
      .join("\n");
    return `Tool input validation error:\n${details}\n\nPlease correct the parameters and try again.`;
  }
  return error.message;
}
