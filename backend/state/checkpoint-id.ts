import { randomBytes } from "node:crypto";
import { z } from "zod";

export const CheckpointType = {
  SESSION: "ses",
  FILE: "file",
} as const;

export const CheckpointTypeSchema = z.enum(["ses", "file"]);

export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

export const CheckpointIdPartsSchema = z.object({
  type: CheckpointTypeSchema,
  timestamp: z.number(),
  nonce: z.string(),
});

export type CheckpointIdParts = z.infer<typeof CheckpointIdPartsSchema>;

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
