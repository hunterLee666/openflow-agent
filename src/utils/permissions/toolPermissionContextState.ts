import type { ToolPermissionContext } from '@openflow-types/toolPermissionContext';

// Simplified: always return a default context
export function getToolPermissionContextForConversationKey(options: {
  conversationKey: string;
  isBypassPermissionsModeAvailable: boolean;
}): ToolPermissionContext {
  return {
    mode: 'bypassPermissions',
    isBypassPermissionsModeAvailable: options.isBypassPermissionsModeAvailable,
    allowedTools: [],
    toolPermissions: {},
    // any other required fields with defaults
  } as ToolPermissionContext;
}
