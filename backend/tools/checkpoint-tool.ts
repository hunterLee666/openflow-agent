import { z } from "zod";
import { mkdir, readFile, writeFile, readdir, unlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ToolDefinition } from "../types/index.js";

const TASK_CHECKPOINT_DIR = join(homedir(), ".openflow", "task-checkpoints");
const MAX_CHECKPOINTS = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const CheckpointInputSchema = z.object({
  action: z.enum(["save", "restore", "list", "delete"]).describe("Action: save, restore, list, or delete a checkpoint"),
  checkpointId: z.string().optional().describe("Checkpoint ID for restore/delete actions"),
  taskName: z.string().optional().describe("Name of the task for save action"),
  data: z.string().optional().describe("Data to save (JSON string) for save action"),
  description: z.string().optional().describe("Description for the checkpoint"),
  tags: z.array(z.string()).optional().describe("Tags for organizing checkpoints"),
});

type CheckpointInput = z.infer<typeof CheckpointInputSchema>;

interface TaskCheckpoint {
  taskName: string;
  data: string;
  description: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface CheckpointResult {
  success: boolean;
  checkpointId?: string;
  data?: string;
  checkpoints?: Array<{
    id: string;
    taskName: string;
    description: string;
    tags: string[];
    createdAt: string;
  }>;
  message?: string;
  error?: string;
}

class TaskCheckpointStore {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(TASK_CHECKPOINT_DIR, { recursive: true });
    await this.cleanup();
    this.initialized = true;
  }

  async save(id: string, checkpoint: TaskCheckpoint): Promise<void> {
    await this.initialize();
    const path = this.getCheckpointPath(id);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(checkpoint, null, 2), "utf8");
    await rename(tmp, path);
  }

  async load(id: string): Promise<TaskCheckpoint | null> {
    await this.initialize();
    try {
      const path = this.getCheckpointPath(id);
      const content = await readFile(path, "utf8");
      return JSON.parse(content) as TaskCheckpoint;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize();
    try {
      const path = this.getCheckpointPath(id);
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<Array<{ id: string; checkpoint: TaskCheckpoint }>> {
    await this.initialize();
    const entries = await readdir(TASK_CHECKPOINT_DIR);
    const checkpoints: Array<{ id: string; checkpoint: TaskCheckpoint }> = [];

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const id = entry.replace(".json", "");
      const checkpoint = await this.load(id);
      if (checkpoint) {
        checkpoints.push({ id, checkpoint });
      }
    }

    return checkpoints.sort((a, b) => b.checkpoint.createdAt - a.checkpoint.createdAt);
  }

  async cleanup(): Promise<void> {
    const checkpoints = await this.list();
    const now = Date.now();
    const toDelete: string[] = [];

    if (checkpoints.length > MAX_CHECKPOINTS) {
      for (const cp of checkpoints.slice(MAX_CHECKPOINTS)) {
        toDelete.push(cp.id);
      }
    }

    for (const cp of checkpoints) {
      if (now - cp.checkpoint.createdAt > MAX_AGE_MS) {
        toDelete.push(cp.id);
      }
    }

    for (const id of toDelete) {
      await this.delete(id);
    }
  }

  private getCheckpointPath(id: string): string {
    return join(TASK_CHECKPOINT_DIR, `${id}.json`);
  }
}

const checkpointStore = new TaskCheckpointStore();

function generateCheckpointId(): string {
  return `chk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createCheckpointTool(): ToolDefinition {
  return {
    name: "Checkpoint",
    description: `Save and restore task state checkpoints.
Use this tool to:
- save: Save current progress/state before risky operations
- restore: Resume from a previously saved checkpoint
- list: View all available checkpoints
- delete: Remove a checkpoint when no longer needed

Checkpoints are useful for:
- Long-running tasks that may be interrupted
- Allowing rollback after failed experiments
- Sharing partial results between sessions`,
    inputSchema: CheckpointInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = CheckpointInputSchema.parse(rawInput);
      console.log(`[Checkpoint] Action: ${input.action}`);

      try {
        switch (input.action) {
          case "save": {
            const checkpointId = input.checkpointId || generateCheckpointId();
            const now = Date.now();
            const existing = await checkpointStore.load(checkpointId);

            const checkpoint: TaskCheckpoint = {
              taskName: input.taskName || "Untitled",
              data: input.data || "{}",
              description: input.description || "",
              tags: input.tags || [],
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            };

            await checkpointStore.save(checkpointId, checkpoint);

            const result: CheckpointResult = {
              success: true,
              checkpointId,
              message: `[Checkpoint Saved]
Checkpoint ID: ${checkpointId}
Task: ${input.taskName || "Untitled"}
${input.description ? `Description: ${input.description}\n` : ""}
${input.tags?.length ? `Tags: ${input.tags.join(", ")}\n` : ""}
Created: ${new Date(checkpoint.createdAt).toISOString()}`,
            };
            console.log(`[Checkpoint] Saved: ${checkpointId}`);
            return JSON.stringify(result);
          }

          case "restore": {
            if (!input.checkpointId) {
              return JSON.stringify({ success: false, error: "checkpointId is required for restore action" });
            }
            const checkpoint = await checkpointStore.load(input.checkpointId);
            if (!checkpoint) {
              return JSON.stringify({ success: false, error: `Checkpoint ${input.checkpointId} not found` });
            }

            const result: CheckpointResult = {
              success: true,
              checkpointId: input.checkpointId,
              data: checkpoint.data,
              message: `[Checkpoint Restored]
Checkpoint ID: ${input.checkpointId}
Task: ${checkpoint.taskName}
Description: ${checkpoint.description}
Created: ${new Date(checkpoint.createdAt).toISOString()}
Updated: ${new Date(checkpoint.updatedAt).toISOString()}`,
            };
            console.log(`[Checkpoint] Restored: ${input.checkpointId}`);
            return JSON.stringify(result);
          }

          case "list": {
            const checkpoints = await checkpointStore.list();
            const checkpointList = checkpoints.map(({ id, checkpoint: cp }) => ({
              id,
              taskName: cp.taskName,
              description: cp.description,
              tags: cp.tags,
              createdAt: new Date(cp.createdAt).toISOString(),
            }));

            const result: CheckpointResult = {
              success: true,
              checkpoints: checkpointList,
              message: `[Checkpoints List]
Total: ${checkpointList.length}
${checkpointList.length === 0 ? "No checkpoints available" : ""}
${checkpointList.map(c => `
${c.id}
  Task: ${c.taskName}
  ${c.description ? `Description: ${c.description}` : ""}
  ${c.tags.length ? `Tags: ${c.tags.join(", ")}` : ""}
  Created: ${c.createdAt}`).join("\n")}`,
            };
            return JSON.stringify(result);
          }

          case "delete": {
            if (!input.checkpointId) {
              return JSON.stringify({ success: false, error: "checkpointId is required for delete action" });
            }
            const existed = await checkpointStore.load(input.checkpointId);
            if (!existed) {
              return JSON.stringify({ success: false, error: `Checkpoint ${input.checkpointId} not found` });
            }

            await checkpointStore.delete(input.checkpointId);
            const result: CheckpointResult = {
              success: true,
              checkpointId: input.checkpointId,
              message: `Checkpoint ${input.checkpointId} has been deleted`,
            };
            console.log(`[Checkpoint] Deleted: ${input.checkpointId}`);
            return JSON.stringify(result);
          }

          default:
            return JSON.stringify({ success: false, error: `Unknown action: ${input.action}` });
        }
      } catch (error) {
        const errorResult: CheckpointResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        console.error(`[Checkpoint] Error: ${errorResult.error}`);
        return JSON.stringify(errorResult);
      }
    },
  };
}
