// Simplified permission stub - permissions are bypassed in simplified mode
export type PermissionMode = 'bypassPermissions' | 'ask' | 'auto' | 'acceptEdits' | 'dontAsk';
export type ToolPermissionContext = any;
export function applyToolPermissionContextUpdate() {}
export function createEmptyToolPermissionContext() { return {}; }
export function getEmptyToolPermissionContext() { return {}; }
export const PermissionContext = {};