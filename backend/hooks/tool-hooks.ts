import { defaultHookRegistry, type PreToolUseHookContext, type PostToolUseHookContext } from './index.js';

export async function executePreToolHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: {
    cwd?: string;
    sessionId?: string;
    agentId?: string;
    taskId?: string;
    canUseTool?: boolean;
  } = {}
): Promise<{ allowed: boolean; modifiedInput?: Record<string, unknown>; message?: string }> {
  const hookContext: PreToolUseHookContext = {
    toolName,
    toolInput,
    cwd: context.cwd,
    sessionId: context.sessionId,
    agentId: context.agentId,
    taskId: context.taskId,
    canUseTool: context.canUseTool ?? true,
  };

  const results = await defaultHookRegistry.execute('PreToolUse', hookContext, {
    sessionId: context.sessionId,
    stopOnDeny: true,
  });

  const denied = results.find((r) => !r.success || r.result?.action === 'deny' || r.result?.action === 'block');
  if (denied) {
    return {
      allowed: false,
      message: denied.result?.message ?? `Tool ${toolName} was denied by hook ${denied.hookId}`,
    };
  }

  const modifyResult = results.find((r) => r.result?.action === 'modify' && r.result?.modifiedInput);
  if (modifyResult?.result?.modifiedInput) {
    return {
      allowed: true,
      modifiedInput: modifyResult.result.modifiedInput,
    };
  }

  return { allowed: true };
}

export async function executePostToolHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: unknown,
  context: {
    cwd?: string;
    sessionId?: string;
    agentId?: string;
    taskId?: string;
    success?: boolean;
  } = {}
): Promise<void> {
  const hookContext: PostToolUseHookContext = {
    toolName,
    toolInput,
    toolResult,
    cwd: context.cwd,
    sessionId: context.sessionId,
    agentId: context.agentId,
    taskId: context.taskId,
    success: context.success ?? true,
  };

  await defaultHookRegistry.execute('PostToolUse', hookContext, {
    sessionId: context.sessionId,
  });
}
