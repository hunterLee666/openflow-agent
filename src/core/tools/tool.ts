import { z } from 'zod'

/** Minimal tool interface used by OpenFlow */
export interface Tool<In = any, Out = any> {
  name: string;
  description?: string;
  inputSchema: z.ZodType<In>;
  call: (input: In, context: ToolUseContext) => AsyncGenerator<any, void, unknown>;
  isEnabled: () => boolean | Promise<boolean>;
  isReadOnly: (input?: In) => boolean;
  isConcurrencySafe?: (input?: In) => boolean;
  validateInput?: (
    input: In,
    context: ToolUseContext,
  ) => Promise<{ result: boolean; message?: string }>;
  renderResultForAssistant?: (data: Out) => string | any[];
}

/** Context passed to tool execution */
export interface ToolUseContext {
  cwd: string;
  abortController: AbortController;
  toolUseId?: string;
  messageId?: string;
  conversationKey?: string;
  options?: any; // Various options: safeMode, verbose, tools, etc.
  readFileTimestamps?: Record<string, number>;
  [key: string]: any;
}

/** Validation result */
export type ValidationResult = {
  result: boolean;
  message?: string;
};

/** Helper to get tool description */
export function getToolDescription(tool: Tool): string {
  return (tool as any).cachedDescription || (tool as any).description || `Tool: ${tool.name}`;
}
