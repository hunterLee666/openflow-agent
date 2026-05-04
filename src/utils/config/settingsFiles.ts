import type { SettingsFile, SettingsFileWithPermissions } from './types';
import type { ToolPermissionUpdateDestination } from '@openflow-types/toolPermissionContext';

export function getSettingsFileCandidates(options?: {
  destination?: ToolPermissionUpdateDestination;
  projectDir?: string;
  homeDir?: string;
}): { primary?: string; secondary?: string; legacy?: string } | null {
  // Simplified: No persistent settings files
  return null;
}

export function loadSettingsWithLegacyFallback<T>(_candidates?: any, _defaultValue?: T): T | null {
  return null;
}

export function saveSettingsToPrimaryAndSyncLegacy(_settings: any, _candidates?: any, _legacyPath?: string): void {
  // no-op
}

export function createDefaultSettingsFile(_options?: any): SettingsFile {
  return {};
}

export function validateSettingsFile(_file: SettingsFile): { valid: boolean; errors?: string[] } {
  return { valid: true };
}
