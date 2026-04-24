import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentConfig } from "../types/index.js";

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "ai-coding-agent")
  : join(homedir(), ".ai-coding-agent");

const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export async function loadConfig(): Promise<AgentConfig> {
  const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";

  const provider = process.env.API_PROVIDER as 'anthropic' | 'openai' | 'dashscope' | undefined;
  const resolvedProvider = provider || (dashscopeApiKey && !anthropicApiKey ? 'dashscope' : undefined);

  const defaults: AgentConfig = {
    apiKey: dashscopeApiKey || anthropicApiKey,
    model: process.env.MODEL || process.env.ANTHROPIC_MODEL || "qwen3-32b",
    provider: resolvedProvider,
    maxTokens: 8192,
    maxTurns: 50,
    tokenBudget: 200000,
    moneyBudgetUsd: 10,
    permissionMode: "acceptEdits",
    compactionThreshold: 100000,
    maxCompactionFailures: 3,
    baseUrl: process.env.ANTHROPIC_BASE_URL || process.env.DASHSCOPE_BASE_URL,
  };

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, "utf-8");
      const saved = JSON.parse(raw);
      return { ...defaults, ...saved };
    } catch {
      return defaults;
    }
  }

  return defaults;
}

export async function saveConfig(config: Partial<AgentConfig>): Promise<void> {
  try {
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }
    await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}
