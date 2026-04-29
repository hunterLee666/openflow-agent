import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { nanoid } from 'nanoid'
import type { MemoryEntry } from './types'

export class JarvisMemory {
  private memoryDir: string
  private maxMemorySize: number
  private cache: MemoryEntry[] = []
  private dailyLogPath: string

  constructor(memoryDir?: string, maxMemorySize: number = 10000) {
    this.memoryDir = memoryDir ?? join(homedir(), '.openflow', 'jarvis', 'memory')
    this.maxMemorySize = maxMemorySize
    this.dailyLogPath = this.getDailyLogPath()
    this.ensureMemoryDir()
  }

  private ensureMemoryDir(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true })
    }
    const logsDir = join(this.memoryDir, 'logs')
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true })
    }
  }

  private getDailyLogPath(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const logsDir = join(this.memoryDir, 'logs')
    return join(logsDir, `${year}`, `${month}`, `${year}-${month}-${day}.md`)
  }

  private formatMemoryEntry(entry: MemoryEntry): string {
    const timestamp = entry.timestamp.toISOString()
    const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : ''
    return `## [${timestamp}] ${entry.type.toUpperCase()}${metadata}\n\n${entry.content}\n\n---\n\n`
  }

  async append(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    const fullEntry: MemoryEntry = {
      ...entry,
      id: nanoid(),
      timestamp: new Date(),
    }

    this.cache.push(fullEntry)
    if (this.cache.length > this.maxMemorySize) {
      this.cache = this.cache.slice(-this.maxMemorySize)
    }

    this.dailyLogPath = this.getDailyLogPath()
    const dir = join(this.dailyLogPath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const formatted = this.formatMemoryEntry(fullEntry)
    appendFileSync(this.dailyLogPath, formatted, 'utf-8')

    return fullEntry
  }

  async getRecent(count: number = 100): Promise<MemoryEntry[]> {
    return this.cache.slice(-count)
  }

  getRecentSync(count: number = 100): MemoryEntry[] {
    return this.cache.slice(-count)
  }

  async search(query: string, limit: number = 50): Promise<MemoryEntry[]> {
    const lowerQuery = query.toLowerCase()
    return this.cache
      .filter(entry => entry.content.toLowerCase().includes(lowerQuery))
      .slice(-limit)
  }

  async getByType(type: MemoryEntry['type']): Promise<MemoryEntry[]> {
    return this.cache.filter(entry => entry.type === type)
  }

  async getDailyLog(date?: Date): Promise<string> {
    const targetDate = date ?? new Date()
    const year = targetDate.getFullYear()
    const month = String(targetDate.getMonth() + 1).padStart(2, '0')
    const day = String(targetDate.getDate()).padStart(2, '0')
    const logPath = join(this.memoryDir, 'logs', `${year}`, `${month}`, `${year}-${month}-${day}.md`)
    
    if (existsSync(logPath)) {
      return readFileSync(logPath, 'utf-8')
    }
    return ''
  }

  async getLongTermMemory(): Promise<string> {
    const memoryPath = join(this.memoryDir, 'MEMORY.md')
    if (existsSync(memoryPath)) {
      return readFileSync(memoryPath, 'utf-8')
    }
    return ''
  }

  async setLongTermMemory(content: string): Promise<void> {
    const memoryPath = join(this.memoryDir, 'MEMORY.md')
    writeFileSync(memoryPath, content, 'utf-8')
  }

  async getIdentity(): Promise<string> {
    const identityPath = join(this.memoryDir, 'IDENTITY.md')
    if (existsSync(identityPath)) {
      return readFileSync(identityPath, 'utf-8')
    }
    return ''
  }

  async setIdentity(content: string): Promise<void> {
    const identityPath = join(this.memoryDir, 'IDENTITY.md')
    writeFileSync(identityPath, content, 'utf-8')
  }

  async getSoul(): Promise<string> {
    const soulPath = join(this.memoryDir, 'SOUL.md')
    if (existsSync(soulPath)) {
      return readFileSync(soulPath, 'utf-8')
    }
    return ''
  }

  async setSoul(content: string): Promise<void> {
    const soulPath = join(this.memoryDir, 'SOUL.md')
    writeFileSync(soulPath, content, 'utf-8')
  }

  async compact(): Promise<void> {
    const thoughts = await this.getByType('thought')
    const reflections = await this.getByType('reflection')
    
    const summary = `# Memory Summary\n\nGenerated at ${new Date().toISOString()}\n\n## Key Thoughts\n${thoughts.slice(-10).map(t => `- ${t.content}`).join('\n')}\n\n## Reflections\n${reflections.slice(-5).map(r => `- ${r.content}`).join('\n')}\n`
    
    await this.setLongTermMemory(summary)
  }

  getMemoryDir(): string {
    return this.memoryDir
  }
}
