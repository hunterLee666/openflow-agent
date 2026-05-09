import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { GlobalConfig } from '../../types';

const CONFIG_DIR = join(require('os').homedir(), '.config', 'openflow');
const GLOBAL_CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadGlobalConfigFromDisk(): GlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(GLOBAL_CONFIG_FILE, 'utf-8');
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

// In-memory global config
let globalConfig = loadGlobalConfigFromDisk();

export function getGlobalConfig(): GlobalConfig {
  const envModel = process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL;
  const envConfig: GlobalConfig = envModel ? { model: envModel } : {};
  return { ...DEFAULT_GLOBAL_CONFIG, ...globalConfig, ...envConfig };
}

export function saveGlobalConfig(config: GlobalConfig): void {
  globalConfig = { ...config };
  ensureConfigDir();
  writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(globalConfig, null, 2), 'utf-8');
}

export function loadGlobalConfigAtStartup(): GlobalConfig {
  globalConfig = loadGlobalConfigFromDisk();
  return globalConfig;
}

// Re-export CLI helpers
export {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
  getProjectConfigPath,
  getProjectMcpServerDefinitions,
  getCustomApiKeyStatus,
  normalizeApiKeyForConfig,
  setConfigForCLI,
  getConfigForCLI,
  listConfigForCLI,
  deleteConfigForCLI,
  enableConfigs,
  validateAndRepairAllGPT5Profiles,
  getAnthropicApiKey,
} from './cli';

// Types
export interface McpServerConfig {
  [key: string]: any;
}

export interface ModelProfile {
  modelName: string;
  displayName: string;
  description?: string;
  isActive: boolean;
  capabilities?: string[];
  maxTokens?: number;
  [key: string]: any;
}

export interface ModelPointer {
  main: string;
  [key: string]: any;
}
export type ModelPointerType = ModelPointer;

// Default global config
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  // model: 默认不设置，需用户通过 config 命令或环境变量指定
  model: undefined,
  verbose: false,
  safeMode: false,
};

// Testing helper (keep minimal)
export function addMcprcServerForTesting(_name: string, _config: any): void {}
export function removeMcprcServerForTesting(_name: string): void {}

// Trust dialog and misc config helpers
export function checkHasTrustDialogAccepted(): boolean {
  return true;
}
export function markTrustDialogAsAccepted(): void {}
export function setHasTrustDialogAccepted(_value: boolean): void {}

// Simplified model pointer helpers
export function setModelPointer(_pointer: string, _model: string): void {}
export function setAllPointersToModel(_model: string): void {}
export function getModelPointer(_name?: string): string | undefined {
  return getGlobalConfig().model;
}
