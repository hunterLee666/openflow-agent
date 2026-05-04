// Permission mode definitions for OpenFlow
export type PermissionMode = 'bypassPermissions' | 'ask' | 'auto' | 'acceptEdits' | 'dontAsk' | 'plan' | 'default';

// 模式配置：描述每个模式的行为
export interface ModeConfig {
  label: string;              // 用户界面显示的名称
  description: string;        // 简短描述
  requiresApproval: boolean;  // 是否需要用户批准危险操作
  allowedTools?: string[];    // 允许的工具列表（空表示全部）
  restrictions?: Record<string, any>; // 额外限制
}

export const MODE_CONFIGS: Record<PermissionMode, ModeConfig> = {
  bypassPermissions: {
    label: 'Bypass',
    description: 'All tools run without confirmation. Use with caution.',
    requiresApproval: false,
  },
  ask: {
    label: 'Ask',
    description: 'Ask before running tools that modify system state.',
    requiresApproval: true,
  },
  auto: {
    label: 'Auto',
    description: 'Automatically allow safe tools; ask for risky ones.',
    requiresApproval: true,
  },
  acceptEdits: {
    label: 'Accept Edits',
    description: 'Allow file edits but ask for system commands.',
    requiresApproval: true,
    restrictions: {
      denyTools: ['Bash', 'KillShell', 'RemoteTrigger'],
    },
  },
  dontAsk: {
    label: "Don't Ask",
    description: 'Read-only mode; no modifications without explicit permission.',
    requiresApproval: true,
    restrictions: {
      allowedTools: ['Read', 'Glob', 'Grep', 'LSP', 'ListMcpResources', 'ReadMcpResource', 'Config', 'TodoRead'],
    },
  },
  plan: {
    label: 'Plan',
    description: 'Plan mode: design changes before execution. No tools run automatically.',
    requiresApproval: true,
    restrictions: {
      requirePlanExit: true,
    },
  },
  default: {
    label: 'Default',
    description: 'Project default permissions (may request per operation).',
    requiresApproval: true,
  },
};

export function getNextPermissionMode(current: PermissionMode): PermissionMode {
  const order: PermissionMode[] = [
    'bypassPermissions',
    'ask',
    'auto',
    'acceptEdits',
    'dontAsk',
    'plan',
    'default',
  ];
  const currentIndex = order.indexOf(current);
  if (currentIndex === -1) {
    return order[0];
  }
  const nextIndex = (currentIndex + 1) % order.length;
  return order[nextIndex];
}

export function parsePermissionMode(mode: any): PermissionMode {
  const validModes: PermissionMode[] = [
    'bypassPermissions',
    'ask',
    'auto',
    'acceptEdits',
    'dontAsk',
    'plan',
    'default',
  ];
  if (typeof mode === 'string' && validModes.includes(mode as PermissionMode)) {
    return mode as PermissionMode;
  }
  return 'default';
}

// 会话级别的权限模式存储
const permissionModeByConversationKey = new Map<string, PermissionMode>();
const DEFAULT_CONVERSATION_KEY = 'default';

export function getPermissionModeForConversationKey(options: {
  conversationKey: string;
  isBypassPermissionsModeAvailable: boolean;
}): PermissionMode {
  const key = options.conversationKey || DEFAULT_CONVERSATION_KEY;
  const stored = permissionModeByConversationKey.get(key);
  if (stored) {
    return stored;
  }
  return options.isBypassPermissionsModeAvailable ? 'bypassPermissions' : 'ask';
}

export function setPermissionModeForConversationKey(options: {
  conversationKey: string;
  mode: PermissionMode;
}): void {
  const key = options.conversationKey || DEFAULT_CONVERSATION_KEY;
  permissionModeByConversationKey.set(key, options.mode);
}

export function getPermissionMode(context?: { conversationKey?: string; isBypassPermissionsModeAvailable?: boolean }): PermissionMode {
  if (!context) {
    return 'default';
  }
  return getPermissionModeForConversationKey({
    conversationKey: context.conversationKey || DEFAULT_CONVERSATION_KEY,
    isBypassPermissionsModeAvailable: context.isBypassPermissionsModeAvailable ?? false,
  });
}

export function setPermissionMode(context: { conversationKey?: string }, mode: PermissionMode): void {
  setPermissionModeForConversationKey({
    conversationKey: context.conversationKey || DEFAULT_CONVERSATION_KEY,
    mode,
  });
}

export function __resetPermissionModeStateForTests(): void {
  permissionModeByConversationKey.clear();
}