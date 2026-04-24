export interface UndercoverConfig {
  enabled: boolean;
  stealthLevel: 'minimal' | 'standard' | 'maximum';
  maskPatterns: RegExp[];
  hideFilePatterns: string[];
  obfuscateCommands: boolean;
  encryptLogs: boolean;
  secureMemory: boolean;
}

export interface StealthSession {
  id: string;
  startTime: number;
  operations: HiddenOperation[];
  isActive: boolean;
}

export interface HiddenOperation {
  type: 'read' | 'write' | 'execute' | 'delete' | 'search';
  path?: string;
  command?: string;
  timestamp: number;
  masked: boolean;
  result?: string;
}

export interface MaskedResult {
  original: unknown;
  masked: string;
  patterns: string[];
}

export class UndercoverMode {
  private config: UndercoverConfig;
  private session: StealthSession | null = null;
  private originalLog: typeof console.log;
  private originalError: typeof console.error;
  private originalWarn: typeof console.warn;

  constructor(config: Partial<UndercoverConfig> = {}) {
    this.config = {
      enabled: false,
      stealthLevel: 'standard',
      maskPatterns: [
        /password/i,
        /api[_-]?key/i,
        /token/i,
        /secret/i,
        /credential/i,
        /\b\d{13,}\b/,
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      ],
      hideFilePatterns: ['*.env', '*.pem', '*.key', '*_secret*', '*_password*'],
      obfuscateCommands: true,
      encryptLogs: false,
      secureMemory: true,
      ...config,
    };

    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
  }

  enable(): void {
    if (this.config.enabled) {
      return;
    }

    this.config.enabled = true;
    this.session = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      operations: [],
      isActive: true,
    };

    if (this.config.stealthLevel === 'maximum') {
      this.activateMaxStealth();
    }
  }

  disable(): void {
    if (!this.config.enabled) {
      return;
    }

    this.config.enabled = false;

    if (this.session) {
      this.session.isActive = false;
      this.wipeSession();
    }

    this.restoreConsole();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getStealthLevel(): UndercoverConfig['stealthLevel'] {
    return this.config.stealthLevel;
  }

  setStealthLevel(level: UndercoverConfig['stealthLevel']): void {
    this.config.stealthLevel = level;

    if (level === 'maximum' && this.config.enabled) {
      this.activateMaxStealth();
    } else {
      this.restoreConsole();
    }
  }

  maskValue(value: string): string {
    if (!value) {
      return value;
    }

    let masked = value;

    for (const pattern of this.config.maskPatterns) {
      if (pattern instanceof RegExp) {
        masked = masked.replace(pattern, '***REDACTED***');
      } else if (typeof pattern === 'string') {
        masked = masked.replace(new RegExp(pattern, 'gi'), '***REDACTED***');
      }
    }

    return masked;
  }

  maskObject<T extends Record<string, unknown>>(obj: T): MaskedResult {
    const patterns: string[] = [];
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      let shouldMask = false;

      for (const pattern of this.config.maskPatterns) {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        if (regex.test(key)) {
          shouldMask = true;
          patterns.push(key);
          break;
        }
      }

      if (shouldMask) {
        masked[key] = '***REDACTED***';
      } else if (typeof value === 'string') {
        masked[key] = this.maskValue(value);
      } else {
        masked[key] = value;
      }
    }

    return {
      original: obj,
      masked: JSON.stringify(masked),
      patterns,
    };
  }

  shouldHideFile(filepath: string): boolean {
    for (const pattern of this.config.hideFilePatterns) {
      const regex = this.globToRegex(pattern);
      if (regex.test(filepath)) {
        return true;
      }
    }
    return false;
  }

  obfuscatePath(path: string): string {
    if (this.config.stealthLevel === 'minimal') {
      return path;
    }

    const parts = path.split('/');
    if (parts.length <= 2) {
      return '***/hidden/path***';
    }

    const visible = parts.slice(0, 2);
    const hidden = parts.slice(2, -1).map(() => '***');
    const final = parts[parts.length - 1];

    return [...visible, ...hidden, final].join('/');
  }

  obfuscateCommand(cmd: string): string {
    if (!this.config.obfuscateCommands) {
      return cmd;
    }

    let obfuscated = cmd;

    for (const pattern of this.config.maskPatterns) {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'gi');
      obfuscated = obfuscated.replace(regex, '***');
    }

    if (this.config.stealthLevel === 'maximum') {
      obfuscated = btoa(obfuscated);
    }

    return obfuscated;
  }

  logOperation(operation: HiddenOperation): void {
    if (!this.session || !this.config.enabled) {
      return;
    }

    const loggedOp: HiddenOperation = {
      ...operation,
      masked: this.shouldMaskOperation(operation),
    };

    this.session.operations.push(loggedOp);

    if (this.config.encryptLogs) {
      this.encryptOperation(loggedOp);
    }
  }

  getSession(): StealthSession | null {
    return this.session;
  }

  getRecentOperations(count: number = 10): HiddenOperation[] {
    if (!this.session) {
      return [];
    }
    return this.session.operations.slice(-count);
  }

  clearOperationLog(): void {
    if (this.session) {
      this.session.operations = [];
    }
  }

  private activateMaxStealth(): void {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};

    if (this.config.secureMemory) {
      this.secureMemoryCheck();
    }
  }

  private restoreConsole(): void {
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
  }

  private shouldMaskOperation(op: HiddenOperation): boolean {
    if (this.config.stealthLevel === 'minimal') {
      return false;
    }

    if (op.path && this.shouldHideFile(op.path)) {
      return true;
    }

    if (op.command) {
      for (const pattern of this.config.maskPatterns) {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        if (regex.test(op.command)) {
          return true;
        }
      }
    }

    return false;
  }

  private encryptOperation(op: HiddenOperation): void {
    if (typeof btoa === 'function') {
      const json = JSON.stringify(op);
      const encrypted = btoa(json);
      console.log('[ENCRYPTED_LOG]', encrypted);
    }
  }

  private wipeSession(): void {
    if (this.session) {
      this.session.operations = [];
      this.session = null;
    }
  }

  private secureMemoryCheck(): void {
    if (typeof process !== 'undefined' && 'memoryUsage' in process) {
      try {
        const memUsage = (process as NodeJS.Process & { memoryUsage?: () => { heapUsed: number } }).memoryUsage?.();
        if (memUsage && memUsage.heapUsed > 500 * 1024 * 1024) {
          console.warn('[Undercover] High memory usage detected');
        }
      } catch {
      }
    }
  }

  private generateSessionId(): string {
    return `undercover_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }
}

export function createUndercoverMode(config?: Partial<UndercoverConfig>): UndercoverMode {
  return new UndercoverMode(config);
}

export const DEFAULT_UNDERCOVER_CONFIG: UndercoverConfig = {
  enabled: false,
  stealthLevel: 'standard',
  maskPatterns: [
    /password/i,
    /api[_-]?key/i,
    /token/i,
    /secret/i,
    /credential/i,
    /\b\d{13,}\b/,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ],
  hideFilePatterns: ['*.env', '*.pem', '*.key', '*_secret*', '*_password*'],
  obfuscateCommands: true,
  encryptLogs: false,
  secureMemory: true,
};
