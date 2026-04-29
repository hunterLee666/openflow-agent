import * as fs from 'node:fs/promises'
import * as fsp from 'node:fs'
import * as path from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

export interface SessionMeta {
  sessionId: string
  projectPath: string
  cwd: string
  cliVersion: string
  model: string
  provider: string
  createdAt: string
  updatedAt: string
  parentSessionId?: string
  messageCount: number
  checkpointCount: number
}

export interface TranscriptLine {
  ts: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  payload: Record<string, unknown>
  invocationId?: string
}

export interface Checkpoint {
  id: string
  atMessageIndex: number
  summary: string
  artifactRefs?: string[]
  timestamp: number
  tokenCount?: number
}

export interface HistoryConfig {
  root?: string
  maxCheckpoints?: number
  checkpointInterval?: number
}

const DEFAULT_MAX_CHECKPOINTS = 10
const DEFAULT_CHECKPOINT_INTERVAL = 50

export class History {
  private root: string
  private maxCheckpoints: number
  private checkpointInterval: number

  constructor(config: HistoryConfig = {}) {
    this.root = config.root ?? path.join(homedir(), '.agent', 'history')
    this.maxCheckpoints = config.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS
    this.checkpointInterval = config.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL
  }

  private getProjectDir(projectPath: string): string {
    const hash = createHash('sha256').update(projectPath).digest('hex').slice(0, 16)
    return path.join(this.root, 'projects', hash)
  }

  private getSessionDir(projectPath: string, sessionId: string): string {
    return path.join(this.getProjectDir(projectPath), 'sessions', sessionId)
  }

  private getMetaPath(projectPath: string, sessionId: string): string {
    return path.join(this.getSessionDir(projectPath, sessionId), 'meta.json')
  }

  private getTranscriptPath(projectPath: string, sessionId: string): string {
    return path.join(this.getSessionDir(projectPath, sessionId), 'transcript.jsonl')
  }

  private getCheckpointsDir(projectPath: string, sessionId: string): string {
    return path.join(this.getSessionDir(projectPath, sessionId), 'checkpoints')
  }

  async createSession(meta: Omit<SessionMeta, 'createdAt' | 'updatedAt' | 'messageCount' | 'checkpointCount'>): Promise<SessionMeta> {
    const sessionDir = this.getSessionDir(meta.projectPath, meta.sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.mkdir(this.getCheckpointsDir(meta.projectPath, meta.sessionId), { recursive: true })

    const fullMeta: SessionMeta = {
      ...meta,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      checkpointCount: 0,
    }

    await fs.writeFile(this.getMetaPath(meta.projectPath, meta.sessionId), JSON.stringify(fullMeta, null, 2))
    return fullMeta
  }

  async loadMeta(projectPath: string, sessionId: string): Promise<SessionMeta | null> {
    try {
      const data = await fs.readFile(this.getMetaPath(projectPath, sessionId), 'utf8')
      return JSON.parse(data) as SessionMeta
    } catch {
      return null
    }
  }

  async updateMeta(projectPath: string, sessionId: string, updates: Partial<SessionMeta>): Promise<void> {
    const meta = await this.loadMeta(projectPath, sessionId)
    if (!meta) return

    const updated = {
      ...meta,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const metaPath = this.getMetaPath(projectPath, sessionId)
    const tmp = `${metaPath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(updated, null, 2))
    await fs.rename(tmp, metaPath)
  }

  async appendTranscriptLine(projectPath: string, sessionId: string, line: TranscriptLine): Promise<void> {
    const transcriptPath = this.getTranscriptPath(projectPath, sessionId)
    const lineData = JSON.stringify(line) + '\n'
    await fs.appendFile(transcriptPath, lineData, 'utf8')

    await this.updateMeta(projectPath, sessionId, {
      messageCount: (await this.loadMeta(projectPath, sessionId))?.messageCount ?? 0 + 1,
    })
  }

  async readTranscript(projectPath: string, sessionId: string, sinceIndex?: number): Promise<TranscriptLine[]> {
    const transcriptPath = this.getTranscriptPath(projectPath, sessionId)
    const lines: TranscriptLine[] = []

    try {
      const content = await fs.readFile(transcriptPath, 'utf8')
      const allLines = content.trim().split('\n')
      const start = sinceIndex ?? 0

      for (let i = start; i < allLines.length; i++) {
        if (allLines[i].trim()) {
          try {
            lines.push(JSON.parse(allLines[i]) as TranscriptLine)
          } catch {}
        }
      }
    } catch {}

    return lines
  }

  async readTranscriptTail(projectPath: string, sessionId: string, count: number): Promise<TranscriptLine[]> {
    const transcriptPath = this.getTranscriptPath(projectPath, sessionId)
    
    try {
      const content = await fs.readFile(transcriptPath, 'utf8')
      const allLines = content.trim().split('\n').filter(l => l.trim())
      const start = Math.max(0, allLines.length - count)
      
      return allLines.slice(start).map(line => {
        try {
          return JSON.parse(line) as TranscriptLine
        } catch {
          return null
        }
      }).filter((l): l is TranscriptLine => l !== null)
    } catch {
      return []
    }
  }

  async saveCheckpoint(projectPath: string, sessionId: string, checkpoint: Checkpoint): Promise<void> {
    const checkpointsDir = this.getCheckpointsDir(projectPath, sessionId)
    const checkpointPath = path.join(checkpointsDir, `${checkpoint.id}.json`)
    const tmp = `${checkpointPath}.tmp`

    await fs.writeFile(tmp, JSON.stringify(checkpoint, null, 2))
    await fs.rename(tmp, checkpointPath)

    await this.updateMeta(projectPath, sessionId, {
      checkpointCount: (await this.loadMeta(projectPath, sessionId))?.checkpointCount ?? 0 + 1,
    })

    await this.pruneOldCheckpoints(projectPath, sessionId)
  }

  async loadCheckpoint(projectPath: string, sessionId: string, checkpointId: string): Promise<Checkpoint | null> {
    const checkpointPath = path.join(this.getCheckpointsDir(projectPath, sessionId), `${checkpointId}.json`)
    try {
      const data = await fs.readFile(checkpointPath, 'utf8')
      return JSON.parse(data) as Checkpoint
    } catch {
      return null
    }
  }

  async loadLatestCheckpoint(projectPath: string, sessionId: string): Promise<Checkpoint | null> {
    const checkpointsDir = this.getCheckpointsDir(projectPath, sessionId)
    
    try {
      const files = await fs.readdir(checkpointsDir)
      const checkpointFiles = files.filter(f => f.endsWith('.json')).sort().reverse()

      if (checkpointFiles.length === 0) return null

      const latest = checkpointFiles[0]
      const data = await fs.readFile(path.join(checkpointsDir, latest), 'utf8')
      return JSON.parse(data) as Checkpoint
    } catch {
      return null
    }
  }

  async listCheckpoints(projectPath: string, sessionId: string): Promise<Checkpoint[]> {
    const checkpointsDir = this.getCheckpointsDir(projectPath, sessionId)
    const checkpoints: Checkpoint[] = []

    try {
      const files = await fs.readdir(checkpointsDir)
      for (const file of files.filter(f => f.endsWith('.json')).sort()) {
        try {
          const data = await fs.readFile(path.join(checkpointsDir, file), 'utf8')
          checkpoints.push(JSON.parse(data) as Checkpoint)
        } catch {}
      }
    } catch {}

    return checkpoints
  }

  private async pruneOldCheckpoints(projectPath: string, sessionId: string): Promise<void> {
    const checkpoints = await this.listCheckpoints(projectPath, sessionId)
    
    if (checkpoints.length > this.maxCheckpoints) {
      const toDelete = checkpoints.slice(0, checkpoints.length - this.maxCheckpoints)
      const checkpointsDir = this.getCheckpointsDir(projectPath, sessionId)

      for (const cp of toDelete) {
        try {
          await fs.unlink(path.join(checkpointsDir, `${cp.id}.json`))
        } catch {}
      }
    }
  }

  async listSessions(projectPath: string): Promise<SessionMeta[]> {
    const projectDir = this.getProjectDir(projectPath)
    const sessions: SessionMeta[] = []

    try {
      const sessionsDir = path.join(projectDir, 'sessions')
      const dirs = await fs.readdir(sessionsDir)

      for (const dir of dirs) {
        const meta = await this.loadMeta(projectPath, dir)
        if (meta) {
          sessions.push(meta)
        }
      }
    } catch {}

    return sessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  async findLatestResumableSession(projectPath: string): Promise<SessionMeta | null> {
    const sessions = await this.listSessions(projectPath)

    for (const meta of sessions) {
      if (await this.isSessionHealthy(projectPath, meta.sessionId)) {
        return meta
      }
    }

    return null
  }

  async isSessionHealthy(projectPath: string, sessionId: string): Promise<boolean> {
    const meta = await this.loadMeta(projectPath, sessionId)
    if (!meta) return false

    try {
      const transcriptPath = this.getTranscriptPath(projectPath, sessionId)
      await fs.access(transcriptPath)
      return true
    } catch {
      return false
    }
  }

  async deleteSession(projectPath: string, sessionId: string): Promise<boolean> {
    try {
      const sessionDir = this.getSessionDir(projectPath, sessionId)
      await fs.rm(sessionDir, { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }

  shouldCreateCheckpoint(messageCount: number, lastCheckpointIndex: number): boolean {
    return messageCount - lastCheckpointIndex >= this.checkpointInterval
  }
}

let defaultHistory: History | null = null

export function getHistory(): History {
  if (!defaultHistory) {
    defaultHistory = new History()
  }
  return defaultHistory
}

export function setHistory(history: History): void {
  defaultHistory = history
}

export function resetHistory(): void {
  defaultHistory = null
}
