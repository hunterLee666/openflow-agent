import type { PermissionMode } from '@openflow-types/permissionMode';
import { getCwd } from '@utils/state';

// 定义权限模式的循环顺序
const PERMISSION_MODE_ORDER: PermissionMode[] = [
  'bypassPermissions',
  'ask',
  'auto',
  'acceptEdits',
  'dontAsk',
  'plan',
  'default',
];

const DEFAULT_CONVERSATION_KEY = 'default';
const permissionModeByConversationKey = new Map<string, PermissionMode>();

export function getNextPermissionMode(current: PermissionMode): PermissionMode {
  const currentIndex = PERMISSION_MODE_ORDER.indexOf(current);
  if (currentIndex === -1) {
    return PERMISSION_MODE_ORDER[0];
  }
  const nextIndex = (currentIndex + 1) % PERMISSION_MODE_ORDER.length;
  return PERMISSION_MODE_ORDER[nextIndex];
}

export function parsePermissionMode(mode: any): PermissionMode {
  if (typeof mode === 'string' && PERMISSION_MODE_ORDER.includes(mode as PermissionMode)) {
    return mode as PermissionMode;
  }
  return 'default';
}

export function getPermissionModeForConversationKey(options: {
  conversationKey: string;
  isBypassPermissionsModeAvailable: boolean;
}): PermissionMode {
  const key = options.conversationKey || DEFAULT_CONVERSATION_KEY;
  const stored = permissionModeByConversationKey.get(key);
  if (stored) {
    return stored;
  }
  // 如果 bypass 可用，默认使用它；否则使用 ask
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