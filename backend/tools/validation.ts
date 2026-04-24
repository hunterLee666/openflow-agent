import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export interface ValidationResult {
  ok: true;
  data: unknown;
}

export interface ValidationError {
  ok: false;
  error: {
    issues: Array<{
      path: (string | number)[];
      message: string;
      code: string;
    }>;
  };
}

export type SafeParseResult = ValidationResult | ValidationError;

export function safeValidateInput(
  schema: unknown,
  rawInput: unknown
): SafeParseResult {
  if (!schema || typeof schema !== "object") {
    return { ok: true, data: rawInput };
  }

  try {
    const zodSchema = convertJsonSchemaToZod(schema as Record<string, unknown>);
    const result = zodSchema.safeParse(rawInput);

    if (result.success) {
      return { ok: true, data: result.data };
    }

    return {
      ok: false,
      error: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path as (string | number)[],
          message: issue.message,
          code: issue.code,
        })),
      },
    };
  } catch {
    return { ok: true, data: rawInput };
  }
}

export function safeValidateOutput(
  schema: unknown,
  rawOutput: unknown
): SafeParseResult {
  return safeValidateInput(schema, rawOutput);
}

export function formatValidationError(result: ValidationError): string {
  return result.error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("\n");
}

function convertJsonSchemaToZod(schema: Record<string, unknown>): z.ZodType<unknown> {
  const type = schema.type as string;

  if (type === "string") {
    return z.string();
  }
  if (type === "number") {
    return z.number();
  }
  if (type === "boolean") {
    return z.boolean();
  }
  if (type === "array") {
    const items = schema.items as Record<string, unknown>;
    return z.array(convertJsonSchemaToZod(items || {}));
  }
  if (type === "object") {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const required = schema.required as string[] || [];
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, propSchema] of Object.entries(properties || {})) {
      let field = convertJsonSchemaToZod(propSchema);
      if (!required.includes(key)) {
        field = field.optional();
      }
      shape[key] = field;
    }

    return z.object(shape);
  }

  return z.unknown();
}

export function isZodSchema(schema: unknown): schema is z.ZodType<unknown> {
  return schema instanceof z.ZodType;
}
