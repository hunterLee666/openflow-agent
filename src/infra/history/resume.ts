import { getHistory, History } from './History'
import type { SessionMeta, TranscriptLine, Checkpoint } from './History'

export interface ResumeResult {
  meta: SessionMeta
  checkpoint: Checkpoint | null
  tail: TranscriptLine[]
}

export async function resumeSession(projectPath: string, sessionId?: string): Promise<ResumeResult | null> {
  const history = getHistory()
  
  let meta: SessionMeta | null
  if (sessionId) {
    meta = await history.loadMeta(projectPath, sessionId)
  } else {
    meta = await history.findLatestResumableSession(projectPath)
  }

  if (!meta) return null

  const checkpoint = await history.loadLatestCheckpoint(projectPath, meta.sessionId)
  const tail = await history.readTranscriptTail(
    projectPath,
    meta.sessionId,
    checkpoint ? 50 : 100
  )

  return { meta, checkpoint, tail }
}

export async function continueFromCheckpoint(
  projectPath: string,
  sessionId: string,
  checkpointId: string
): Promise<ResumeResult | null> {
  const history = getHistory()
  
  const meta = await history.loadMeta(projectPath, sessionId)
  if (!meta) return null

  const checkpoint = await history.loadCheckpoint(projectPath, sessionId, checkpointId)
  if (!checkpoint) return null

  const tail = await history.readTranscript(
    projectPath,
    sessionId,
    checkpoint.atMessageIndex
  )

  return { meta, checkpoint, tail }
}

export async function forkSession(
  projectPath: string,
  parentSessionId: string,
  newSessionId: string,
  meta: Omit<SessionMeta, 'sessionId' | 'parentSessionId' | 'createdAt' | 'updatedAt' | 'messageCount' | 'checkpointCount'>
): Promise<SessionMeta | null> {
  const history = getHistory()
  
  const parentMeta = await history.loadMeta(projectPath, parentSessionId)
  if (!parentMeta) return null

  const newMeta = await history.createSession({
    ...meta,
    sessionId: newSessionId,
    parentSessionId,
  })

  const transcript = await history.readTranscript(projectPath, parentSessionId)
  for (const line of transcript) {
    await history.appendTranscriptLine(projectPath, newSessionId, line)
  }

  return newMeta
}

export async function pruneOldSessions(projectPath: string, maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
  const history = getHistory()
  const sessions = await history.listSessions(projectPath)
  const cutoff = Date.now() - maxAge
  let deleted = 0

  for (const meta of sessions) {
    const updatedAt = new Date(meta.updatedAt).getTime()
    if (updatedAt < cutoff) {
      if (await history.deleteSession(projectPath, meta.sessionId)) {
        deleted++
      }
    }
  }

  return deleted
}

export async function exportSession(projectPath: string, sessionId: string): Promise<{
  meta: SessionMeta
  transcript: TranscriptLine[]
  checkpoints: Checkpoint[]
} | null> {
  const history = getHistory()
  
  const meta = await history.loadMeta(projectPath, sessionId)
  if (!meta) return null

  const transcript = await history.readTranscript(projectPath, sessionId)
  const checkpoints = await history.listCheckpoints(projectPath, sessionId)

  return { meta, transcript, checkpoints }
}

export async function importSession(
  projectPath: string,
  data: {
    meta: SessionMeta
    transcript: TranscriptLine[]
    checkpoints: Checkpoint[]
  }
): Promise<SessionMeta | null> {
  const history = getHistory()
  
  const meta = await history.createSession({
    sessionId: data.meta.sessionId,
    projectPath: data.meta.projectPath,
    cwd: data.meta.cwd,
    cliVersion: data.meta.cliVersion,
    model: data.meta.model,
    provider: data.meta.provider,
  })

  for (const line of data.transcript) {
    await history.appendTranscriptLine(projectPath, data.meta.sessionId, line)
  }

  for (const checkpoint of data.checkpoints) {
    await history.saveCheckpoint(projectPath, data.meta.sessionId, checkpoint)
  }

  return meta
}
