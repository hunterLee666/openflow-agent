import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";

export class Memdir {
  private root: string;

  constructor(baseDir?: string) {
    this.root = baseDir ?? join(homedir(), ".openflow", "mem");
  }

  getRoot(): string {
    return this.root;
  }

  private resolve(rel: string): string {
    const full = join(this.root, rel);
    if (!full.startsWith(this.root)) {
      throw new Error("path traversal detected");
    }
    return full;
  }

  async readText(rel: string): Promise<string | null> {
    try {
      return await readFile(this.resolve(rel), "utf8");
    } catch {
      return null;
    }
  }

  async readJson<T extends Record<string, unknown>>(rel: string): Promise<T | null> {
    const raw = await this.readText(rel);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async writeTextAtomic(rel: string, body: string): Promise<void> {
    const target = this.resolve(rel);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, body, "utf8");
    await rename(tmp, target);
  }

  async writeJsonAtomic(rel: string, data: unknown): Promise<void> {
    await this.writeTextAtomic(rel, JSON.stringify(data, null, 2));
  }

  async mergeJson(rel: string, patch: Record<string, unknown>): Promise<void> {
    const raw = (await this.readText(rel)) ?? "{}";
    const cur = JSON.parse(raw) as Record<string, unknown>;
    const next = { ...cur, ...patch };
    await this.writeJsonAtomic(rel, next);
  }

  async delete(rel: string): Promise<void> {
    const target = this.resolve(rel);
    await rm(target, { force: true, recursive: true });
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await readFile(this.resolve(rel));
      return true;
    } catch {
      return false;
    }
  }
}

export function createMemdir(baseDir?: string): Memdir {
  return new Memdir(baseDir);
}
