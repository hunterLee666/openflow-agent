import { readFileSync, writeFileSync, mkdirSync } from 'fs';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

export class FileStorage implements StorageAdapter {
  private filePath: string;
  private store: Map<string, string> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      if (content) {
        const data = JSON.parse(content) as Record<string, string>;
        this.store = new Map(Object.entries(data));
      }
    } catch {
      this.store = new Map();
    }
  }

  private save(): void {
    const data = Object.fromEntries(this.store);
    try {
      const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
      if (dir) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
    }
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
    this.save();
  }

  removeItem(key: string): void {
    this.store.delete(key);
    this.save();
  }
}

export class SecureStorage implements StorageAdapter {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  getItem(key: string): string | null {
    const value = this.storage.getItem(key);
    if (!value) return null;
    try {
      return Buffer.from(value, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    const encoded = Buffer.from(value).toString('base64');
    this.storage.setItem(key, encoded);
  }

  removeItem(key: string): void {
    this.storage.removeItem(key);
  }
}

export function createSessionStorage(): StorageAdapter {
  return new MemoryStorage();
}

export function createPersistentStorage(path?: string): StorageAdapter {
  if (path) {
    return new FileStorage(path);
  }
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return new FileStorage(`${home}/.openflow/auth.json`);
}