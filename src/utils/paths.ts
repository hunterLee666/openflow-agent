import { join } from "node:path";
import { homedir } from "node:os";

export const APP_CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "ai-coding-agent")
  : join(homedir(), ".ai-coding-agent");

export const APP_DATA_DIR = process.env.XDG_DATA_HOME
  ? join(process.env.XDG_DATA_HOME, "ai-coding-agent")
  : join(homedir(), ".ai-coding-agent");

export const APP_CACHE_DIR = process.env.XDG_CACHE_HOME
  ? join(process.env.XDG_CACHE_HOME, "ai-coding-agent")
  : join(homedir(), ".ai-coding-agent", "cache");

export const APP_SESSIONS_DIR = join(APP_DATA_DIR, "sessions");
export const APP_SEMANTIC_DIR = join(APP_DATA_DIR, "semantic");
export const APP_EPISODES_DIR = join(APP_DATA_DIR, "episodes");
export const APP_KNOWLEDGE_DIR = join(APP_DATA_DIR, "knowledge");
export const APP_PROJECT_DIR = join(APP_DATA_DIR, "projects");