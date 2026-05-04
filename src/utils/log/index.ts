import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { getOpenflowBaseDir } from '@utils/config/env';
import { getCwd } from '@utils/state';

const LOGS_DIR = join(getOpenflowBaseDir(), 'logs');
const SESSION_LOG_DIR = join(LOGS_DIR, 'sessions');

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function ensureSessionLogDir(): void {
  ensureLogsDir();
  if (!existsSync(SESSION_LOG_DIR)) {
    mkdirSync(SESSION_LOG_DIR, { recursive: true });
  }
}

// Simple error logger (stub)
export function logError(..._args: any[]): void {
  // Could write to a dedicated error log file
  console.error(..._args);
}

export function dateToFilename(date: Date): string {
  return date.toISOString();
}

export function parseLogFilename(_filename: string): Date | null {
  return new Date();
}

export function getNextAvailableLogForkNumber(_cwd: string, _baseName: string): number {
  return 0;
}

export function loadLogList(_cwd: string, _includeForks?: boolean): any[] {
  return [];
}

export function getLogsDir(): string {
  ensureLogsDir();
  return LOGS_DIR;
}

export function getSessionLogDir(): string {
  ensureSessionLogDir();
  return SESSION_LOG_DIR;
}

export const SESSION_ID = 'cli-session';

export function getLogPath(logName: string): string {
  ensureLogsDir();
  return join(LOGS_DIR, `${logName}.jsonl`);
}

export function getMessagesPath(logName: string): string {
  return join(SESSION_LOG_DIR, `${logName}.json`);
}

export function writeLog(logName: string, message: any): void {
  const path = getLogPath(logName);
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...message,
  });
  try {
    appendFileSync(path, line + '\n', 'utf8');
  } catch (e) {
    // ignore
  }
}

export function readLog(logName: string): any[] {
  const path = getLogPath(logName);
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function overwriteLog(logName: string, messages: any[]): void {
  const path = getLogPath(logName);
  try {
    const content = messages.map(msg => JSON.stringify(msg)).join('\n');
    writeFileSync(path, content + '\n', 'utf8');
  } catch (e) {
    // ignore
  }
}

export function getInMemoryErrors(): any[] {
  // Simplified: return empty array
  return [];
}

export function formatDate(date: Date | string): string {
  return new Date(date).toISOString();
}

export function dateToFilename(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-').split('T')[0];
}

export function parseLogFilename(filename: string): { date: Date; name: string } | null {
  // Simplified parsing
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!match) return null;
  return {
    date: new Date(match[1]),
    name: match[2],
  };
}

export function getLogForkPath(baseName: string): string {
  const n = getNextAvailableLogForkNumber();
  return `${baseName}-fork-${n}`;
}

export function getNextAvailableLogForkNumber(): number {
  const dir = SESSION_LOG_DIR;
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const numbers = files
    .map(f => f.match(/fork-(\d+)/))
    .filter(Boolean)
    .map(m => parseInt(m![1], 10))
    .filter(n => !isNaN(n));
  return numbers.length;
}

// Simplified sidechain number getter (used by TaskTool)
export function getNextAvailableLogSidechainNumber(_baseName: string, _forkNumber: number): number {
  // Simplified: just return forkNumber + 1
  return _forkNumber + 1;
}

export function loadLogList(): any[] {
  const dir = SESSION_LOG_DIR;
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const path = join(dir, f);
      try {
        const stat = (statSync(path) as any);
        const parsed = parseLogFilename(f.replace('.json', ''));
        return {
          name: f.replace('.json', ''),
          path,
          size: stat.size,
          modified: stat.mtime,
          date: parsed?.date || null,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return files.sort((a, b) => (b?.modified || 0) - (a?.modified || 0));
}

// Cache paths
export const CACHE_PATHS = {
  global: join(getOpenflowBaseDir(), 'cache'),
  session: join(getOpenflowBaseDir(), 'cache', 'sessions'),
  tools: join(getOpenflowBaseDir(), 'cache', 'tools'),
};

export { getOpenflowBaseDir } from '@utils/config/env';

// Additional logging helpers
export function logMCPError(_error: any): void {}
