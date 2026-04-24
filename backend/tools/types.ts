import type { ToolContext } from "../types/index.js";

export type InterruptBehavior = "cancel" | "block";

export interface ToolProgressEvent {
  type: "progress";
  toolUseId: string;
  progress: number;
  message?: string;
}

export interface ToolCapability {
  isConcurrencySafe: (input: unknown) => boolean;
  isReadOnly: (input: unknown) => boolean;
  isDestructive?: (input: unknown) => boolean;
  validateInput?: (input: unknown, ctx: ToolContext) => Promise<ValidationResult>;
  checkPermissions?: (input: unknown, ctx: ToolContext) => Promise<PermissionCheckResult>;
  interruptBehavior?: () => InterruptBehavior;
  getToolUseSummary?: (input: unknown) => string | null;
  isSearchOrReadCommand?: (input: unknown) => SearchReadInfo;
  preparePermissionMatcher?: (input: unknown) => Promise<(pattern: string) => boolean>;
}

export interface SearchReadInfo {
  isSearch: boolean;
  isRead: boolean;
  isList?: boolean;
}

export interface ValidationResult {
  result: true;
}

export interface ValidationFailure {
  result: false;
  message: string;
  errorCode?: number;
}

export type ValidationOutcome = ValidationResult | ValidationFailure;

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresUserInteraction?: boolean;
}

export interface ToolExecutionContext {
  toolUseId: string;
  parentMessageId?: string;
  startTime: number;
  attempt: number;
  maxAttempts?: number;
}

export interface ToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    recoverable?: boolean;
  };
  newMessages?: ToolResultMessage[];
  contextModifiers?: Array<(ctx: ToolContext) => ToolContext>;
}

export interface ToolResultMessage {
  role: "user" | "assistant" | "system";
  content: string;
  type?: "tool_result" | "text";
  toolUseId?: string;
}

export type ToolExecutorFn<T = unknown> = (
  input: unknown,
  ctx: ToolContext,
  executionCtx: ToolExecutionContext,
  onProgress?: (event: ToolProgressEvent) => void
) => Promise<ToolCallResult<T>>;

export interface EnhancedToolDefinition {
  name: string;
  description: string;
  aliases?: string[];
  inputSchema: unknown;
  outputSchema?: unknown;
  handler: ToolExecutorFn;

  isConcurrencySafe: (input: unknown) => boolean;
  isReadOnly: (input: unknown) => boolean;
  isDestructive?: (input: unknown) => boolean;
  validateInput?: (input: unknown, ctx: ToolContext) => Promise<ValidationOutcome>;
  interruptBehavior?: () => InterruptBehavior;
  getToolUseSummary?: (input: unknown) => string | null;
  isSearchOrReadCommand?: (input: unknown) => SearchReadInfo;

  maxResultSizeChars?: number;
  maxRetries?: number;
  timeoutMs?: number;
  alwaysLoad?: boolean;
  shouldDefer?: boolean;
}

export interface TrackedTool {
  id: string;
  name: string;
  input: unknown;
  status: "queued" | "executing" | "completed" | "error" | "cancelled";
  isConcurrencySafe: boolean;
  promise?: Promise<void>;
  result?: ToolCallResult;
  progressEvents: ToolProgressEvent[];
  startTime?: number;
  endTime?: number;
}

export interface ConcurrencyConfig {
  maxConcurrent: number;
  maxConcurrentReadOnly: number;
  allowMixedConcurrency: boolean;
}

export const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyConfig = {
  maxConcurrent: 10,
  maxConcurrentReadOnly: 5,
  allowMixedConcurrency: false,
};
