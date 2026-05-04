import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
  getProjectConfigPath,
} from './project';

export { getCurrentProjectConfig, saveCurrentProjectConfig, getProjectConfigPath };

// MCP server definitions - returns { servers: Record<string, any>; sources?: Record<string, string> }
export function getProjectMcpServerDefinitions(): { servers: Record<string, any>; sources?: Record<string, string> } {
  const config = getCurrentProjectConfig();
  const servers = config.mcpServers || {};
  // Assume all servers originate from .mcp.json (simplified)
  const sources: Record<string, string> = {};
  for (const name of Object.keys(servers)) {
    sources[name] = '.mcp.json';
  }
  return { servers, sources };
}

// API key handling
export function getCustomApiKeyStatus(): string {
  const config = getGlobalConfig();
  return config.APIKey ? 'set' : 'none';
}

export function normalizeApiKeyForConfig(key: string): string {
  return key.trim();
}

import { getGlobalConfig, saveGlobalConfig } from './index';

// CLI config helpers
export function setConfigForCLI(key: string, value: string): void {
  const config = getGlobalConfig();
  (config as any)[key] = value;
  saveGlobalConfig(config);
}

export function getConfigForCLI(key: string): string | undefined {
  return getGlobalConfig()[key];
}

export function listConfigForCLI(): Record<string, any> {
  return getGlobalConfig();
}

export function deleteConfigForCLI(key: string): void {
  const config = getGlobalConfig();
  delete (config as any)[key];
  saveGlobalConfig(config);
}

// Placeholder for configs that were removed in simplified mode
export function enableConfigs(): void {
  // No-op
}

export function validateAndRepairAllGPT5Profiles(): Promise<void> {
  return Promise.resolve();
}
