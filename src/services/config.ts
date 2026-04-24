import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentConfig } from "../types/index.js";
import { ApiProvider, PROVIDER_CONFIGS, resolveProvider } from "./api/providers.js";

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "ai-coding-agent")
  : join(homedir(), ".ai-coding-agent");

const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const ENV_API_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: 'anthropic',
  OPENAI_API_KEY: 'openai',
  DASHSCOPE_API_KEY: 'dashscope',
  ZHIPU_API_KEY: 'zhipu',
  DEEPSEEK_API_KEY: 'deepseek',
  MOONSHOT_API_KEY: 'moonshot',
  OPENROUTER_API_KEY: 'openrouter',
  NVIDIA_API_KEY: 'nvidia',
};

const ENV_BASE_URLS: Record<string, string> = {
  ANTHROPIC_BASE_URL: 'anthropic',
  OPENAI_BASE_URL: 'openai',
  DASHSCOPE_BASE_URL: 'dashscope',
  ZHIPU_BASE_URL: 'zhipu',
  DEEPSEEK_BASE_URL: 'deepseek',
  MOONSHOT_BASE_URL: 'moonshot',
  OPENROUTER_BASE_URL: 'openrouter',
  NVIDIA_BASE_URL: 'nvidia',
};

function getApiKey(): string {
  for (const [envKey] of Object.entries(ENV_API_KEYS)) {
    const key = process.env[envKey];
    if (key) return key;
  }
  return process.env.ANTHROPIC_API_KEY || "";
}

function getBaseUrl(provider: ApiProvider): string | undefined {
  for (const [envKey, p] of Object.entries(ENV_BASE_URLS)) {
    if (p === provider) {
      const url = process.env[envKey];
      if (url) return url;
    }
  }
  return PROVIDER_CONFIGS[provider].baseUrl;
}

export async function loadConfig(): Promise<AgentConfig> {
  const apiKey = getApiKey();
  const envProvider = process.env.API_PROVIDER;
  const provider = resolveProvider(apiKey, envProvider);
  const config = PROVIDER_CONFIGS[provider];

  const model = process.env.MODEL ||
    process.env.ANTHROPIC_MODEL ||
    config.defaultModel;

  const defaults: AgentConfig = {
    apiKey,
    model,
    provider,
    baseUrl: getBaseUrl(provider),
    maxTokens: 8192,
    maxTurns: 50,
    tokenBudget: 200000,
    moneyBudgetUsd: 10,
    permissionMode: "acceptEdits",
    compactionThreshold: 100000,
    maxCompactionFailures: 3,
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
