import type { Tool, ToolUseContext, ValidationResult } from './tool'
import type { z } from 'zod'
import type * as React from 'react'

export type SafetyFlags =
  | { isReadOnly: true; isConcurrencySafe: true }
  | { isReadOnly: true; isConcurrencySafe: false }
  | { isReadOnly: false; isConcurrencySafe: false }

export interface ToolSafetyMeta {
  isReadOnly: boolean
  isConcurrencySafe: boolean
}

export interface ToolDefinitionConfig<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> extends SafetyFlags {
  name: string
  description?: string | ((input?: z.infer<TInput>) => Promise<string>)
  inputSchema: TInput
  inputJSONSchema?: Record<string, unknown>
  prompt: (options?: { safeMode?: boolean }) => Promise<string>
  userFacingName?: (input?: z.infer<TInput>) => string
  needsPermissions?: (input?: z.infer<TInput>) => boolean
  requiresUserInteraction?: (input?: z.infer<TInput>) => boolean
  validateInput?: (
    input: z.infer<TInput>,
    context?: ToolUseContext,
  ) => Promise<ValidationResult>
  renderResultForAssistant: (output: TOutput) => string | any[]
  renderToolUseMessage: (
    input: z.infer<TInput>,
    options: { verbose: boolean },
  ) => string | React.ReactElement | null
  renderToolUseRejectedMessage?: (...args: any[]) => React.ReactElement
  renderToolResultMessage?: (
    output: TOutput,
    options: { verbose: boolean },
  ) => React.ReactNode
  call: (
    input: z.infer<TInput>,
    context: ToolUseContext,
  ) => AsyncGenerator<
    | {
        type: 'result'
        data: TOutput
        resultForAssistant?: string | any[]
        newMessages?: unknown[]
        contextModifier?: {
          modifyContext: (ctx: ToolUseContext) => ToolUseContext
        }
      }
    | {
        type: 'progress'
        content: any
        normalizedMessages?: any[]
        tools?: any[]
      },
    void,
    unknown
  >
  isEnabled?: () => Promise<boolean>
}

export interface ReadOnlyToolConfig<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> extends Omit<ToolDefinitionConfig<TInput, TOutput>, 'isReadOnly' | 'isConcurrencySafe'> {
  isConcurrencySafe?: boolean
}

export interface WriteToolConfig<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> extends Omit<ToolDefinitionConfig<TInput, TOutput>, 'isReadOnly' | 'isConcurrencySafe'> {}

function defaultIsEnabled(): Promise<boolean> {
  return Promise.resolve(true)
}

function defaultNeedsPermissions(): boolean {
  return false
}

export function defineTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
>(config: ToolDefinitionConfig<TInput, TOutput>): Tool<TInput, TOutput> {
  const isEnabled = config.isEnabled ?? defaultIsEnabled
  const needsPermissions = config.needsPermissions ?? defaultNeedsPermissions

  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    inputJSONSchema: config.inputJSONSchema,
    prompt: config.prompt,
    userFacingName: config.userFacingName,
    isEnabled,
    isReadOnly: () => config.isReadOnly,
    isConcurrencySafe: () => config.isConcurrencySafe,
    needsPermissions,
    requiresUserInteraction: config.requiresUserInteraction,
    validateInput: config.validateInput,
    renderResultForAssistant: config.renderResultForAssistant,
    renderToolUseMessage: config.renderToolUseMessage,
    renderToolUseRejectedMessage: config.renderToolUseRejectedMessage,
    renderToolResultMessage: config.renderToolResultMessage,
    call: config.call,
  }
}

export function defineReadOnlyTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
>(config: ReadOnlyToolConfig<TInput, TOutput>): Tool<TInput, TOutput> {
  return defineTool({
    ...config,
    isReadOnly: true,
    isConcurrencySafe: config.isConcurrencySafe ?? true,
  })
}

export function defineWriteTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
>(config: WriteToolConfig<TInput, TOutput>): Tool<TInput, TOutput> {
  return defineTool({
    ...config,
    isReadOnly: false,
    isConcurrencySafe: false,
  })
}

export function getToolSafetyMeta(tool: Tool): ToolSafetyMeta {
  return {
    isReadOnly: tool.isReadOnly(),
    isConcurrencySafe: tool.isConcurrencySafe(),
  }
}

export function isToolReadOnly(tool: Tool): boolean {
  return tool.isReadOnly()
}

export function isToolConcurrencySafe(tool: Tool): boolean {
  return tool.isConcurrencySafe()
}

export function validateToolSafetyFlags(
  tool: Tool,
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (typeof tool.isReadOnly !== 'function') {
    issues.push('Tool is missing isReadOnly method')
  }

  if (typeof tool.isConcurrencySafe !== 'function') {
    issues.push('Tool is missing isConcurrencySafe method')
  }

  if (!tool.isReadOnly() && tool.isConcurrencySafe()) {
    issues.push('Write tool should not be marked as concurrency safe')
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

export { Tool } from './tool'
