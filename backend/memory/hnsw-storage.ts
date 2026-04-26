import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export interface StorageBackend {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<boolean>;
  list(): Promise<string[]>;
  exists(key: string): Promise<boolean>;
}

export class InMemoryStorage implements StorageBackend {
  private store = new Map<string, Uint8Array>();

  async write(key: string, data: Uint8Array): Promise<void> {
    this.store.set(key, data);
  }

  async read(key: string): Promise<Uint8Array | null> {
    return this.store.get(key) || null;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}

export class FileSystemStorage implements StorageBackend {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }
  }

  private getKeyPath(key: string): string {
    return join(this.basePath, `${key}.json`);
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    const path = this.getKeyPath(key);
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, data);
  }

  async read(key: string): Promise<Uint8Array | null> {
    const path = this.getKeyPath(key);
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path);
  }

  async delete(key: string): Promise<boolean> {
    const path = this.getKeyPath(key);
    if (!existsSync(path)) {
      return false;
    }
    unlinkSync(path);
    return true;
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.basePath)) {
      return [];
    }
    const files = readdirSync(this.basePath);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  async exists(key: string): Promise<boolean> {
    const path = this.getKeyPath(key);
    return existsSync(path);
  }
}
