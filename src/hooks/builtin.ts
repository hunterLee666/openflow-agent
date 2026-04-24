import { type HookFn, type HookRegistration } from './types.js';

export function createBuiltinHooks(): HookRegistration[] {
  return [];
}

export function createPreToolHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_pre_tool',
    event: 'PreToolUse',
    fn,
    source: 'builtin',
  };
}

export function createPostToolHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_post_tool',
    event: 'PostToolUse',
    fn,
    source: 'builtin',
  };
}

export function createSessionStartHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_session_start',
    event: 'SessionStart',
    fn,
    source: 'builtin',
  };
}

export function createSessionEndHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_session_end',
    event: 'SessionEnd',
    fn,
    source: 'builtin',
  };
}

export function createTaskCreatedHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_task_created',
    event: 'TaskCreated',
    fn,
    source: 'builtin',
  };
}

export function createTaskCompletedHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_task_completed',
    event: 'TaskCompleted',
    fn,
    source: 'builtin',
  };
}

export function createSubagentStartHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_subagent_start',
    event: 'SubagentStart',
    fn,
    source: 'builtin',
  };
}

export function createSubagentStopHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_subagent_stop',
    event: 'SubagentStop',
    fn,
    source: 'builtin',
  };
}

export function createPreCompactHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_pre_compact',
    event: 'PreCompact',
    fn,
    source: 'builtin',
  };
}

export function createPostCompactHook(fn: HookFn): HookRegistration {
  return {
    id: 'builtin_post_compact',
    event: 'PostCompact',
    fn,
    source: 'builtin',
  };
}
