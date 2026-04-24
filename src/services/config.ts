import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentConfig } from "../types/index.js";

const CONFIG_PATH = join(homedir(), ".ai-coding-agent", "config.json");

export async function loadConfig(): Promise<AgentConfig> {
  const defaults: AgentConfig = {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    maxTokens: 8192,
    maxTurns: 50,
    tokenBudget: 200000,
    moneyBudgetUsd: 10,
    permissionMode: "acceptEdits",
    compactionThreshold: 100000,
    maxCompactionFailures: 3,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
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
  const dir = join(homedir(), ".ai-coding-agent");
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}
