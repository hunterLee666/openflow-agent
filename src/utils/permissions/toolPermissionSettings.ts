import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
  ToolPermissionUpdateDestination,
} from '@openflow-types/toolPermissionContext';
import { createDefaultToolPermissionContext, isPersistableToolPermissionDestination } from '@openflow-types/toolPermissionContext';
import { getCwd } from '@utils/state';

export function loadToolPermissionContextFromDisk(options?: {
  projectDir?: string;
  homeDir?: string;
  includeOpenFlowProjectConfig?: boolean;
  isBypassPermissionsModeAvailable?: boolean;
}): ToolPermissionContext {
  const projectDir = options?.projectDir ?? getCwd();
  const base = createDefaultToolPermissionContext({
    isBypassPermissionsModeAvailable: options?.isBypassPermissionsModeAvailable ?? false,
  });
  // Simplified: always return fresh default, no disk loading
  return base;
}

export function persistToolPermissionUpdateToDisk(
  _ctx: ToolPermissionContext,
  _destination?: ToolPermissionUpdateDestination,
): boolean {
  // Simplified: always succeed but don't actually persist
  return true;
}

export function saveSettingsToPrimaryAndSyncLegacy() {
  // No-op in simplified mode
}

export function getSettingsFileCandidates(_destination?: ToolPermissionUpdateDestination, _projectDir?: string, _homeDir?: string) {
  return null;
}
