import path from "node:path";
import { homedir } from "node:os";
import fs from "node:fs";

export const APP_CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, "ai-coding-agent")
  : path.join(homedir(), ".ai-coding-agent");

export const APP_DATA_DIR = process.env.XDG_DATA_HOME
  ? path.join(process.env.XDG_DATA_HOME, "ai-coding-agent")
  : path.join(homedir(), ".ai-coding-agent");

export const APP_CACHE_DIR = process.env.XDG_CACHE_HOME
  ? path.join(process.env.XDG_CACHE_HOME, "ai-coding-agent")
  : path.join(homedir(), ".ai-coding-agent", "cache");

export const APP_SESSIONS_DIR = path.join(APP_DATA_DIR, "sessions");
export const APP_SEMANTIC_DIR = path.join(APP_DATA_DIR, "semantic");
export const APP_EPISODES_DIR = path.join(APP_DATA_DIR, "episodes");
export const APP_KNOWLEDGE_DIR = path.join(APP_DATA_DIR, "knowledge");
export const APP_PROJECT_DIR = path.join(APP_DATA_DIR, "projects");

export function findRepoRoot(cwd: string): string | null {
  let dir = cwd;
  const root = path.parse(dir).root;

  while (dir !== root) {
    try {
      const gitDir = path.join(dir, ".git");
      if (fs.existsSync(gitDir)) {
        return dir;
      }
    } catch {
      // ignore
    }
    const parent = path.join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  if (fs.existsSync(path.join(root, ".git"))) {
    return root;
  }

  return null;
}
