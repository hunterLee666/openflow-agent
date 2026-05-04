import type { z } from 'zod';

// Common types
export type UUID = string;

// Tool-related types
export interface ToolUseContext {
  cwd: string;
  abortController: AbortController;
  toolUseId?: string;
  messageId?: string;
  conversationKey?: string;
  options?: Record<string, any>;
  readFileTimestamps?: Record<string, number>;
  [key: string]: any;
}

export interface Tool<In = any, Out = any> {
  name: string;
  description?: string | (() => Promise<string>);
  inputSchema: z.ZodType<In>;
  call: (input: In, context: ToolUseContext) => AsyncGenerator<any, void, unknown>;
  isEnabled: () => boolean | Promise<boolean>;
  isReadOnly: (input?: In) => boolean;
  isConcurrencySafe?: (input?: In) => boolean;
  validateInput?: (input: In, context: ToolUseContext) => Promise<{ result: boolean; message?: string }>;
  renderResultForAssistant?: (data: Out) => string | any[];

  // UI helpers (optional)
  userFacingName?: (input?: In) => string;
  renderToolUseMessage?: (input: In, options?: { verbose?: boolean }) => string;
  renderToolUseRejectedMessage?: () => any;
  renderToolResultMessage?: (output: Out, options?: { verbose?: boolean }) => any;
  prompt?: () => Promise<string>;
  needsPermissions?: () => boolean;
  requiresUserInteraction?: () => boolean;
  // Compatibility with SDK built-in tools
  cachedDescription?: string;
}

// Message types (internal)
export interface UserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | Array<{ type: 'tool_result'; tool_use_id: string; content: any; is_error?: boolean }>;
  };
  uuid: UUID;
  options?: any;
  toolUseResult?: any;
}

export interface AssistantMessage {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: any }>;
    model: string;
    stop_reason: string;
    stop_sequence: string | null;
    usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  };
  uuid: UUID;
  costUSD?: number;
  durationMs?: number;
  isApiErrorMessage?: boolean;
}

export interface ProgressMessage {
  type: 'progress';
  content: AssistantMessage;
  normalizedMessages: any[];
  siblingToolUseIDs: Set<string>;
  tools: Tool[];
  toolUseID: string;
  uuid: UUID;
}

export type Message = UserMessage | AssistantMessage | ProgressMessage;

// Permission types
export type PermissionMode = 'bypassPermissions' | 'ask' | 'auto' | 'acceptEdits' | 'dontAsk' | 'plan' | 'default';

export interface ToolPermissionContext {
  mode: PermissionMode;
  allowedTools?: string[];
  allowedPaths?: string[];
  restrictions?: Record<string, any>;
  metadata?: Record<string, any>;
  isBypassPermissionsModeAvailable?: boolean;
  [key: string]: any;
}

export interface ToolPermissionContextUpdate {
  [key: string]: any;
}

// Config types
export interface GlobalConfig {
  APIKey?: string;
  model?: string;
  verbose?: boolean;
  safeMode?: boolean;
  maxThinkingTokens?: number;
  hasAcknowledgedCostThreshold?: boolean;
  [key: string]: any;
}

export interface ProjectConfig {
  [key: string]: any;
}

// Model config types
export interface ModelProfile {
  modelName: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  capabilities?: string[];
  maxTokens?: number;
  [key: string]: any;
}

export interface ModelPointer {
  main: string;
  [key: string]: any;
}
export type ModelPointerType = ModelPointer;

// Log types
export interface ToolExecutionLog {
  [key: string]: any;
}

// Theme types
export interface Theme {
  primary: string;
  info: string;
  secondary: string;
  success: string;
  error: string;
  warning: string;
  border: string;
  bgSurface: string;
  bgSurfaceHighlight: string;
  text: string;
  textMuted: string;
  textDim: string;
  secondaryText: string;
  diff: { added: string; removed: string; addedDimmed: string; removedDimmed: string };
  // Additional
  bashBorder?: string;
  openflow?: string;
  noting?: string;
  notingBorder?: string;
  permission?: string;
  autoAccept?: string;
  planMode?: string;
  inputBorder?: string;
  suggestion?: string;
  secondaryBorder?: string;
}

// Messages helpers
export type BinaryFeedbackResult = {
  type: 'thumbs' | 'heart';
  value: boolean;
};
