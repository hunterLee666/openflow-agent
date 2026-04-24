export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreCompact'
  | 'PostCompact'
  | 'SessionStart'
  | 'SessionEnd'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'Setup'
  | 'Stop'
  | 'StopFailure'
  | 'UserPromptSubmit';

export const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'Setup',
  'Stop',
  'StopFailure',
  'UserPromptSubmit',
];

export interface HookContext {
  toolName?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: unknown;
  prompt?: string;
  cwd?: string;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
  error?: Error;
  result?: unknown;
  args?: Record<string, unknown>;
  type?: string;
  reason?: string;
}

export type HookFn = (context: HookContext) => HookResult | Promise<HookResult>;

export interface HookResult {
  action?: 'allow' | 'deny' | 'block' | 'continue' | 'modify';
  modifiedInput?: Record<string, unknown>;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type SyncHookFn = (context: HookContext) => HookResult;
export type AsyncHookFn = (context: HookContext) => Promise<HookResult>;

export interface HookRegistration {
  id: string;
  event: HookEvent;
  fn: HookFn;
  source: 'shell' | 'http' | 'agent' | 'builtin';
  timeout?: number;
  enabled?: boolean;
}

export interface HookExecutionResult {
  hookId: string;
  success: boolean;
  result?: HookResult;
  error?: Error;
  durationMs: number;
}

export interface PreToolUseHookContext extends HookContext {
  toolName: string;
  toolInput: Record<string, unknown>;
  canUseTool: boolean;
}

export interface PostToolUseHookContext extends HookContext {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: unknown;
  success: boolean;
}

export interface SessionHookContext extends HookContext {
  sessionId: string;
  startTime?: number;
  endTime?: number;
}

export interface SubagentHookContext extends HookContext {
  agentId: string;
  agentType: string;
  parentAgentId?: string;
}

export interface TaskHookContext extends HookContext {
  taskId: string;
  taskType: string;
  status: string;
}

export interface CompactHookContext extends HookContext {
  messageCount: number;
  tokenCount: number;
  messagesSummary?: string;
}

export function createHookId(prefix: string = 'hook'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function isAllowed(result: HookResult): boolean {
  return result.action === 'allow' || result.action === 'continue';
}

export function isDenied(result: HookResult): boolean {
  return result.action === 'deny' || result.action === 'block';
}

export interface HookMatcher {
  matcher?: string | string[];
  hooks: Array<{
    type: string;
    command?: string;
    timeout?: number;
  }>;
}

export type HooksSettings = Partial<Record<HookEvent, HookMatcher[]>>;
