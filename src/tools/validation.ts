import { z, ZodSchema, ZodError } from "zod";

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

function convertJsonSchemaToZod(jsonSchema: Record<string, unknown>): ZodSchema {
  const type = jsonSchema.type as string | undefined;

  if (!type) {
    return z.any();
  }

  switch (type) {
    case "string":
      return buildStringSchema(jsonSchema);
    case "number":
    case "integer":
      return buildNumberSchema(jsonSchema);
    case "boolean":
      return z.boolean();
    case "array":
      return buildArraySchema(jsonSchema);
    case "object":
      return buildObjectSchema(jsonSchema);
    default:
      return z.any();
  }
}

function buildStringSchema(schema: Record<string, unknown>): ZodSchema {
  let s = z.string();

  if (schema.minLength !== undefined) {
    s = s.min(schema.minLength as number);
  }
  if (schema.maxLength !== undefined) {
    s = s.max(schema.maxLength as number);
  }
  if (schema.pattern) {
    s = s.regex(new RegExp(schema.pattern as string));
  }
  if (schema.format === "email") {
    s = s.email();
  }
  if (schema.enum) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  return s;
}

function buildNumberSchema(schema: Record<string, unknown>): ZodSchema {
  let n = schema.type === "integer" ? z.number().int() : z.number();

  if (schema.minimum !== undefined) {
    n = n.min(schema.minimum as number);
  }
  if (schema.maximum !== undefined) {
    n = n.max(schema.maximum as number);
  }
  if (schema.exclusiveMinimum !== undefined) {
    n = n.min((schema.exclusiveMinimum as number) + 0.001);
  }
  if (schema.exclusiveMaximum !== undefined) {
    n = n.max((schema.exclusiveMaximum as number) - 0.001);
  }

  return n;
}

function buildArraySchema(schema: Record<string, unknown>): ZodSchema {
  const minItems = schema.minItems as number | undefined;
  const maxItems = schema.maxItems as number | undefined;

  if (schema.items) {
    const itemSchema = convertJsonSchemaToZod(schema.items as Record<string, unknown>);
    let a = z.array(itemSchema);
    if (minItems !== undefined) a = a.min(minItems);
    if (maxItems !== undefined) a = a.max(maxItems);
    return a;
  }

  let a = z.array(z.unknown());
  if (minItems !== undefined) a = a.min(minItems);
  if (maxItems !== undefined) a = a.max(maxItems);
  return a;
}

function buildObjectSchema(schema: Record<string, unknown>): ZodSchema {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = schema.required as string[] | undefined;

  if (!properties) {
    return z.any();
  }

  const shape: Record<string, ZodSchema> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    shape[key] = convertJsonSchemaToZod(propSchema as Record<string, unknown>);
  }

  let obj = z.object(shape);

  if (required) {
    const requiredSet = new Set(required);
    const allKeys = Object.keys(properties);
    const optionalKeys = allKeys.filter((k) => !requiredSet.has(k));

    if (optionalKeys.length > 0) {
      const optionalShape: Record<string, ZodSchema> = {};
      for (const key of optionalKeys) {
        optionalShape[key] = shape[key].optional();
      }
      obj = z.object({ ...shape, ...optionalShape });
    }
  }

  return obj;
}

export function formatValidationError(error: ValidationError): string {
  return error.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

export function isValidationError(result: SafeParseResult): result is ValidationError {
  return !result.ok;
}
