// Stub for tool permission context - simplified mode bypasses permissions
export type ToolPermissionContext = {
  mode: string;
  allowedTools?: string[];
  allowedPaths?: string[];
  restrictions?: any;
  metadata?: any;
  isBypassPermissionsModeAvailable?: boolean;
  [key: string]: any;
};
export type ToolPermissionContextUpdate = any;
export type ToolPermissionRuleBehavior = 'allow' | 'deny' | 'ask';
export type ToolPermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings';

export function applyToolPermissionContextUpdate(
  prev: ToolPermissionContext,
  _update: ToolPermissionContextUpdate,
): ToolPermissionContext {
  return prev;
}

export function applyToolPermissionContextUpdates() {}
export function createDefaultToolPermissionContext(options?: { isBypassPermissionsModeAvailable?: boolean }): ToolPermissionContext {
  return {
    mode: 'bypassPermissions',
    allowedTools: [],
    allowedPaths: [process.cwd()],
    restrictions: {},
    metadata: { transitionCount: 0 },
    isBypassPermissionsModeAvailable: options?.isBypassPermissionsModeAvailable ?? false,
  };
}
export function isPersistableToolPermissionDestination() { return false; }