export type PermissionMode = 'bypassPermissions' | 'ask' | 'auto' | 'acceptEdits' | 'dontAsk' | 'plan' | 'default';
export type ToolPermissionContext = any;
export type ToolPermissionContextUpdate = any;

export async function hasPermissionsToUseTool(
  _tool: any,
  _input: any,
  _context: any,
  _assistantMessage?: any,
): Promise<boolean> {
  return true;
}

export function savePermission() {}
export function applyToolPermissionContextUpdate() {}
export function applyToolPermissionContextUpdates() {}
export function createEmptyToolPermissionContext() { return {}; }
export function getEmptyToolPermissionContext() { return {}; }
export const PermissionContext = {};