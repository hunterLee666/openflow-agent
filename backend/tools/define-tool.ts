import { z } from "zod";
import type { ToolContext } from "../types/index.js";

type ZodSchema<T> = z.ZodType<T>;

type BaseToolConfig<I, O> = {
  name: string;
  description: string;
  inputSchema: ZodSchema<I>;
  outputSchema?: ZodSchema<O>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
  validateInput?: (input: I, ctx: ToolContext) => Promise<{ result: boolean; message?: string }>;
  getToolUseSummary?: (input: Partial<I>) => string | null;
  maxResultSizeChars?: number;
  maxRetries?: number;
  timeoutMs?: number;
};

type ReadOnlyToolConfig<I, O> = BaseToolConfig<I, O> & {
  isReadOnly: true;
  isConcurrencySafe: boolean;
  isDestructive?: never;
};

type ReadWriteToolConfig<I, O> = BaseToolConfig<I, O> & {
  isReadOnly: false;
  isConcurrencySafe: false;
  isDestructive?: (input: I) => boolean;
};

type ToolConfig<I, O> = ReadOnlyToolConfig<I, O> | ReadWriteToolConfig<I, O>;

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

export function defineTool<I, O>(config: ToolConfig<I, O>) {
  return {
    name: config.name,
    description: config.description,
    inputSchema: toJsonSchema(config.inputSchema),
    outputSchema: config.outputSchema ? toJsonSchema(config.outputSchema) : undefined,
    isReadOnly: config.isReadOnly,
    isConcurrencySafe: config.isConcurrencySafe,
    isDestructive: config.isDestructive,
    validateInput: config.validateInput
      ? async (input: unknown, ctx: ToolContext) => config.validateInput!(input as I, ctx)
      : undefined,
    getToolUseSummary: config.getToolUseSummary
      ? (input: unknown) => config.getToolUseSummary!(input as Partial<I>)
      : undefined,
    maxResultSizeChars: config.maxResultSizeChars,
    handler: async (input: unknown, ctx: ToolContext) => {
      const parsed = config.inputSchema.parse(input);
      return config.handler(parsed as I, ctx) as unknown;
    },
  };
}

export const ReadOnlyTool: {
  <I, O>(config: Omit<ReadOnlyToolConfig<I, O>, "isReadOnly">): ToolConfig<I, O>;
} = <I, O>(config: Omit<ReadOnlyToolConfig<I, O>, "isReadOnly">): ToolConfig<I, O> => {
  return { ...config, isReadOnly: true } as ReadOnlyToolConfig<I, O>;
};

export const ReadWriteTool: {
  <I, O>(config: Omit<ReadWriteToolConfig<I, O>, "isReadOnly" | "isConcurrencySafe">): ToolConfig<I, O>;
} = <I, O>(config: Omit<ReadWriteToolConfig<I, O>, "isReadOnly" | "isConcurrencySafe">): ToolConfig<I, O> => {
  return {
    ...config,
    isReadOnly: false,
    isConcurrencySafe: false,
  } as ReadWriteToolConfig<I, O>;
};

export function defineBashTool<I, O>(config: BaseToolConfig<I, O> & { isReadOnly: boolean; isDestructive?: (input: I) => boolean }) {
  if (config.isReadOnly) {
    return defineTool({
      ...config,
      isReadOnly: true,
      isConcurrencySafe: true,
    } as ReadOnlyToolConfig<I, O>);
  }
  return defineTool({
    ...config,
    isReadOnly: false,
    isConcurrencySafe: false,
  } as ReadWriteToolConfig<I, O>);
}

export function defineSearchTool<I, O>(config: BaseToolConfig<I, O>) {
  return defineTool({
    ...config,
    isReadOnly: true,
    isConcurrencySafe: true,
    getToolUseSummary: config.getToolUseSummary ?? ((input) => {
      const partial = input as Partial<I> & { command?: string; path?: string; pattern?: string };
      return partial.command ?? partial.path ?? partial.pattern ?? null;
    }),
  });
}
