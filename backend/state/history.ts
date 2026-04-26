import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, readFile, writeFile, rename, appendFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { generateCheckpointId, CheckpointType } from "./checkpoint-id.js";

export interface SessionMeta {
  sessionId: string;
  projectPath: string;
  cwd: string;
  cliVersion: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  parentSessionId?: string;
}

export interface TranscriptLine {
  ts: string;
  role: "user" | "assistant" | "tool" | "system";
  payload: Record<string, unknown>;
}

export interface Checkpoint {
  id: string;
  atMessageIndex: number;
  summary: string;
  artifactRefs?: string[];
}

export interface LoadResult {
  meta: SessionMeta;
  checkpoint: Checkpoint | null;
  tail: TranscriptLine[];
}

const HISTORY_ROOT = join(homedir(), ".openflow", "history");

function sessionDir(sessionId: string): string {
  return join(HISTORY_ROOT, "sessions", sessionId);
}

function transcriptPath(sessionId: string): string {
  return join(sessionDir(sessionId), "transcript.jsonl");
}

function metaPath(sessionId: string): string {
  return join(sessionDir(sessionId), "meta.json");
}

function checkpointDir(sessionId: string): string {
  return join(sessionDir(sessionId), "checkpoints");
}

export async function createSession(meta: SessionMeta): Promise<void> {
  const dir = sessionDir(meta.sessionId);
  await mkdir(dir, { recursive: true });
  await mkdir(checkpointDir(meta.sessionId), { recursive: true });
  await writeFile(metaPath(meta.sessionId), JSON.stringify(meta, null, 2), "utf8");
  await writeFile(transcriptPath(meta.sessionId), "", "utf8");
}

export async function updateSessionMeta(
  sessionId: string,
  patch: Partial<SessionMeta>
): Promise<void> {
  const p = metaPath(sessionId);
  if (!existsSync(p)) return;

  const raw = await readFile(p, "utf8");
  const meta = JSON.parse(raw) as SessionMeta;
  Object.assign(meta, patch, { updatedAt: new Date().toISOString() });
  await writeFile(p, JSON.stringify(meta, null, 2), "utf8");
}

export async function appendTranscriptLine(
  sessionId: string,
  line: TranscriptLine
): Promise<void> {
  const p = transcriptPath(sessionId);
  await appendFile(p, JSON.stringify(line) + "\n", "utf8");

  const metaPath_ = metaPath(sessionId);
  if (existsSync(metaPath_)) {
    const raw = await readFile(metaPath_, "utf8");
    const meta = JSON.parse(raw) as SessionMeta;
    meta.updatedAt = new Date().toISOString();
    await writeFile(metaPath_, JSON.stringify(meta, null, 2), "utf8");
  }
}

export async function saveCheckpoint(
  sessionId: string,
  checkpoint: Omit<Checkpoint, "id">
): Promise<Checkpoint> {
  const id = generateCheckpointId(CheckpointType.SESSION);
  const fullCheckpoint: Checkpoint = { ...checkpoint, id };

  const dir = checkpointDir(sessionId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(fullCheckpoint, null, 2), "utf8");
  await rename(tmp, path);
  return fullCheckpoint;
}

export async function loadLatestCheckpoint(sessionId: string): Promise<Checkpoint | null> {
  const dir = checkpointDir(sessionId);
  if (!existsSync(dir)) return null;

  const files = await listFiles(dir);
  if (files.length === 0) return null;

  const sorted = files.sort().reverse();
  const latest = sorted[0];
  if (!latest) return null;

  try {
    const raw = await readFile(join(dir, latest), "utf8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

export async function readTranscriptTail(
  sessionId: string,
  afterIndex?: number
): Promise<TranscriptLine[]> {
  const p = transcriptPath(sessionId);
  if (!existsSync(p)) return [];

  const raw = await readFile(p, "utf8");
  const lines = raw.split("\n").filter(Boolean);

  if (afterIndex === undefined || afterIndex === 0) {
    return lines.map((l) => JSON.parse(l) as TranscriptLine);
  }

  return lines
    .slice(afterIndex)
    .map((l) => {
      try {
        return JSON.parse(l) as TranscriptLine;
      } catch {
        return null;
      }
    })
    .filter((l): l is TranscriptLine => l !== null);
}

export async function loadSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const p = metaPath(sessionId);
  if (!existsSync(p)) return null;

  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

export async function listSessions(projectRoot?: string): Promise<SessionMeta[]> {
  const sessionsDir = join(HISTORY_ROOT, "sessions");
  if (!existsSync(sessionsDir)) return [];

  const dirs = await listDirectories(sessionsDir);
  const metas: SessionMeta[] = [];

  for (const dir of dirs) {
    const meta = await loadSessionMeta(dir);
    if (meta) {
      if (projectRoot && meta.projectPath !== projectRoot) continue;
      metas.push(meta);
    }
  }

  return metas;
}

export async function findLatestResumableSession(
  projectRoot: string
): Promise<SessionMeta | null> {
  const sessions = await listSessions(projectRoot);
  const sorted = sessions.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );

  for (const m of sorted) {
    if (await isSessionHealthy(m)) return m;
  }

  return null;
}

export async function isSessionHealthy(meta: SessionMeta): Promise<boolean> {
  const metaP = metaPath(meta.sessionId);
  if (!existsSync(metaP)) return false;

  const transcriptP = transcriptPath(meta.sessionId);
  if (!existsSync(transcriptP)) return false;

  try {
    const raw = await readFile(transcriptP, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length > 0) {
      JSON.parse(lines[lines.length - 1]!);
    }
    return true;
  } catch {
    return false;
  }
}

export async function continueSession(meta: SessionMeta): Promise<LoadResult> {
  const cp = await loadLatestCheckpoint(meta.sessionId);
  const tail = await readTranscriptTail(meta.sessionId, cp?.atMessageIndex);
  return { meta, checkpoint: cp, tail };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const dir = sessionDir(sessionId);
  await rm(dir, { recursive: true, force: true });
}

async function listFiles(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  return readdir(dir);
}

async function listDirectories(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = join(sessionDir(sessionId), ".lock");
  let fileHandle: import("node:fs/promises").FileHandle | null = null;

  try {
    const { open } = await import("node:fs/promises");
    fileHandle = await open(lockPath, "wx");
  } catch {
    throw new Error("session busy");
  }

  try {
    return await fn();
  } finally {
    const { rm } = await import("node:fs/promises");
    await fileHandle.close();
    await rm(lockPath).catch(() => {});
  }
}
