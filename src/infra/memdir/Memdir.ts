import * as fs from 'node:fs/promises'
import * as fsp from 'node:fs'
import * as path from 'node:path'
import { homedir } from 'node:os'

export interface MemdirConfig {
  root?: string
}

export interface MemdirEntry {
  path: string
  content: string
  mtime: number
}

export class Memdir {
  private root: string

  constructor(config: MemdirConfig = {}) {
    this.root = config.root ?? path.join(homedir(), '.agent', 'mem')
  }

  private resolve(rel: string): string {
    const full = path.resolve(this.root, rel)
    if (!full.startsWith(this.root)) {
      throw new Error('Path traversal detected: ' + rel)
    }
    return full
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(rel))
      return true
    } catch {
      return false
    }
  }

  async readText(rel: string): Promise<string | null> {
    try {
      return await fs.readFile(this.resolve(rel), 'utf8')
    } catch {
      return null
    }
  }

  async writeTextAtomic(rel: string, body: string): Promise<void> {
    const target = this.resolve(rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmp, body, 'utf8')
    await fs.rename(tmp, target)
  }

  async readJson<T = unknown>(rel: string): Promise<T | null> {
    const raw = await this.readText(rel)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async writeJsonAtomic(rel: string, data: unknown): Promise<void> {
    await this.writeTextAtomic(rel, JSON.stringify(data, null, 2))
  }

  async mergeJson(rel: string, patch: Record<string, unknown>): Promise<void> {
    const raw = (await this.readText(rel)) ?? '{}'
    let cur: Record<string, unknown>
    try {
      cur = JSON.parse(raw) as Record<string, unknown>
    } catch {
      cur = {}
    }
    const next = { ...cur, ...patch }
    await this.writeJsonAtomic(rel, next)
  }

  async delete(rel: string): Promise<boolean> {
    try {
      await fs.unlink(this.resolve(rel))
      return true
    } catch {
      return false
    }
  }

  async list(rel: string = ''): Promise<string[]> {
    const target = this.resolve(rel)
    try {
      const entries = await fs.readdir(target, { withFileTypes: true })
      return entries.map((e) => e.name)
    } catch {
      return []
    }
  }

  async listRecursive(rel: string = ''): Promise<string[]> {
    const target = this.resolve(rel)
    const results: string[] = []

    async function walk(dir: string, base: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relPath = path.join(base, entry.name)
          if (entry.isDirectory()) {
            await walk(fullPath, relPath)
          } else {
            results.push(relPath)
          }
        }
      } catch {}
    }

    await walk(target, rel)
    return results
  }

  async readAll(rel: string = ''): Promise<MemdirEntry[]> {
    const files = await this.listRecursive(rel)
    const entries: MemdirEntry[] = []

    for (const file of files) {
      const content = await this.readText(file)
      if (content !== null) {
        const stat = await fs.stat(this.resolve(file))
        entries.push({
          path: file,
          content,
          mtime: stat.mtimeMs,
        })
      }
    }

    return entries
  }

  async ensureDir(rel: string): Promise<void> {
    await fs.mkdir(this.resolve(rel), { recursive: true })
  }

  getRoot(): string {
    return this.root
  }

  async exportAll(): Promise<Record<string, string>> {
    const files = await this.listRecursive()
    const result: Record<string, string> = {}

    for (const file of files) {
      const content = await this.readText(file)
      if (content !== null) {
        result[file] = content
      }
    }

    return result
  }

  async importAll(data: Record<string, string>): Promise<void> {
    for (const [rel, content] of Object.entries(data)) {
      await this.writeTextAtomic(rel, content)
    }
  }
}

let defaultMemdir: Memdir | null = null

export function getMemdir(): Memdir {
  if (!defaultMemdir) {
    defaultMemdir = new Memdir()
  }
  return defaultMemdir
}

export function setMemdir(memdir: Memdir): void {
  defaultMemdir = memdir
}

export function resetMemdir(): void {
  defaultMemdir = null
}
