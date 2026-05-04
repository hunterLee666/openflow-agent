import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getCwd } from '../state';

const PROJECT_CONFIG_FILE = '.openflow.json';

export function getProjectConfigPath(cwd?: string): string {
  return join(cwd || getCwd(), PROJECT_CONFIG_FILE);
}

export function getCurrentProjectConfig(cwd?: string): any {
  const path = getProjectConfigPath(cwd);
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveCurrentProjectConfig(config: any, cwd?: string): void {
  const path = getProjectConfigPath(cwd);
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}
