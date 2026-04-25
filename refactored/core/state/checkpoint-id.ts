import { randomBytes } from "node:crypto";

export enum CheckpointType {
  SESSION = "ses",
  FILE = "file",
}

export interface CheckpointIdParts {
  type: CheckpointType;
  timestamp: number;
  nonce: string;
}

export function generateCheckpointId(
  type: CheckpointType,
  timestamp?: number
): string {
  const ts = timestamp ?? Date.now();
  const nonce = randomBytes(3).toString("hex");
  return `cp_${type}_${ts}_${nonce}`;
}

export function parseCheckpointId(id: string): CheckpointIdParts | null {
  const parts = id.split("_");
  if (parts.length !== 4 || parts[0] !== "cp") return null;

  const type = parts[1] as CheckpointType;
  if (type !== CheckpointType.SESSION && type !== CheckpointType.FILE) return null;

  const timestamp = Number(parts[2]);
  if (!Number.isFinite(timestamp)) return null;

  return { type, timestamp, nonce: parts[3]! };
}

export function isValidCheckpointId(id: string): boolean {
  return parseCheckpointId(id) !== null;
}

export function extractCheckpointTimestamp(id: string): number | null {
  const parts = parseCheckpointId(id);
  return parts?.timestamp ?? null;
}
