import { platform as osPlatform } from 'os';
import { homedir } from 'os';
import { join } from 'path';

const baseDir = join(homedir(), '.config', 'openflow');

export function getOpenflowBaseDir(): string {
  return baseDir;
}

export function getGlobalConfigFilePath(): string {
  return join(baseDir, 'config.json');
}

export const env = {
  terminal: process.env.TERM_PROGRAM || process.env.TERM || '',
  platform: osPlatform(),
  isCI: !!process.env.CI,
};
