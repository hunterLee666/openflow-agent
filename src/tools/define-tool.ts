import { z } from "zod";
import type { ToolDefinition, ToolContext } from "../types/index.js";

type ZodSchema<T> = z.ZodType<T>;

type ReadOnlyTool<I, O> = {
  isReadOnly: true;
  isConcurrencySafe: boolean;
  name: string;
  description: string;
  inputSchema: ZodSchema<I>;
  outputSchema?: ZodSchema<O>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
};

type ReadWriteTool<I, O> = {
  isReadOnly: false;
  isConcurrencySafe: false;
  name: string;
  description: string;
  inputSchema: ZodSchema<I>;
  outputSchema?: ZodSchema<O>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
};

type ToolConfig<I, O> = ReadOnlyTool<I, O> | ReadWriteTool<I, O>;

function toJsonSchema(schema: ZodSchema<unknown>): Record<string, unknown> {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
  if (!shape) return { type: "string" };

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    const typeName = getZodTypeName(zodType);

    properties[key] = { type: typeName };

    if (!(value as z.ZodOptional<z.ZodTypeAny>).isOptional && !(value as z.ZodNullable<z.ZodTypeAny>).isNullable) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function getZodTypeName(zodType: z.ZodTypeAny): string {
  if (zodType instanceof z.ZodString) return "string";
  if (zodType instanceof z.ZodNumber) return "number";
  if (zodType instanceof z.ZodBoolean) return "boolean";
  if (zodType instanceof z.ZodArray) return "array";
  if (zodType instanceof z.ZodObject) return "object";
  if (zodType instanceof z.ZodEnum) return "string";
  return "string";
}

export function defineTool<I, O>(config: ToolConfig<I, O>): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: toJsonSchema(config.inputSchema),
    outputSchema: config.outputSchema ? toJsonSchema(config.outputSchema) : undefined,
    isReadOnly: config.isReadOnly,
    isConcurrencySafe: config.isConcurrencySafe,
    handler: async (input: unknown, ctx: ToolContext) => {
      const parsed = config.inputSchema.parse(input);
      return config.handler(parsed as I, ctx) as unknown;
    },
  };
}

export const ReadOnlyTool: {
  <I, O>(config: Omit<ReadOnlyTool<I, O>, "isReadOnly">): ToolConfig<I, O>;
} = <I, O>(config: Omit<ReadOnlyTool<I, O>, "isReadOnly">): ToolConfig<I, O> => {
  return { ...config, isReadOnly: true };
};

export const ReadWriteTool: {
  <I, O>(config: Omit<ReadWriteTool<I, O>, "isReadOnly" | "isConcurrencySafe">): ToolConfig<I, O>;
} = <I, O>(config: Omit<ReadWriteTool<I, O>, "isReadOnly" | "isConcurrencySafe">): ToolConfig<I, O> => {
  return { ...config, isReadOnly: false, isConcurrencySafe: false };
};