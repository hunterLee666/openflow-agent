import { cwd } from 'process';
import { join } from 'path';

let currentCwd = cwd();
let originalCwd = cwd();

export function getCwd(): string {
  return currentCwd;
}

export function getOriginalCwd(): string {
  return originalCwd;
}

export function setCwd(_path: string): void {
  currentCwd = _path;
}

export function setOriginalCwd(_path: string): void {
  originalCwd = _path;
}

export function resolvePath(_path: string): string {
  return join(currentCwd, _path);
}