import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export interface ClaudeCodeSettings {
  model?: string;
  modelOverrides?: Record<string, string>;
  availableModels?: string[];
  env?: Record<string, string>;
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  effortLevel?: "low" | "medium" | "high" | "xhigh" | "max";
  apiKeyHelper?: string;
  [key: string]: unknown;
}

export interface ModelAlias {
  alias: string;
  description: string;
  resolveTo: string;
}

export const MODEL_ALIASES: Record<string, ModelAlias> = {
  default: {
    alias: "default",
    description: "System default model for your account type",
    resolveTo: "sonnet",
  },
  best: {
    alias: "best",
    description: "Most capable available model",
    resolveTo: "opus",
  },
  sonnet: {
    alias: "sonnet",
    description: "Latest Sonnet model for daily coding tasks",
    resolveTo: "claude-sonnet-4-20250514",
  },
  opus: {
    alias: "opus",
    description: "Latest Opus model for complex reasoning tasks",
    resolveTo: "claude-opus-4-5-20250514",
  },
  haiku: {
    alias: "haiku",
    description: "Fast and efficient Haiku model for simple tasks",
    resolveTo: "claude-3-haiku-20240307",
  },
  "sonnet[1m]": {
    alias: "sonnet[1m]",
    description: "Sonnet with 1 million token context window",
    resolveTo: "claude-sonnet-4-20250514",
  },
  "opus[1m]": {
    alias: "opus[1m]",
    description: "Opus with 1 million token context window",
    resolveTo: "claude-opus-4-5-20250514",
  },
};

export interface ConfigSource {
  path: string;
  priority: number;
  settings: ClaudeCodeSettings;
}

export interface MergedConfig {
  model?: string;
  modelOverrides: Record<string, string>;
  availableModels?: string[];
  env: Record<string, string>;
  sources: ConfigSource[];
}

const CONFIG_FOLDERS = [".openflow"];
const SETTINGS_FILE = "settings.json";

export class ClaudeCodeConfigAdapter {
  private configDirs: string[];
  private mergedConfig: MergedConfig | null = null;
  private modelAliases: Record<string, ModelAlias>;

  constructor(projectDir: string, customAliases?: Record<string, ModelAlias>) {
    this.configDirs = this.buildConfigDirs(projectDir);
    this.modelAliases = { ...MODEL_ALIASES, ...(customAliases || {}) };
  }

  private buildConfigDirs(projectDir: string): string[] {
    const dirs: string[] = [];

    const resolvedProject = resolve(projectDir);

    for (const folder of CONFIG_FOLDERS) {
      const configDir = join(resolvedProject, folder);
      if (existsSync(configDir)) {
        dirs.push(configDir);
      }
    }

    let currentDir = resolvedProject;
    const root = dirname(currentDir);

    while (currentDir !== root) {
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;

      for (const folder of CONFIG_FOLDERS) {
        const parentConfigDir = join(currentDir, folder);
        if (existsSync(parentConfigDir)) {
          dirs.push(parentConfigDir);
        }
      }
    }

    const homeDir = homedir();
    for (const folder of CONFIG_FOLDERS) {
      const homeConfigDir = join(homeDir, folder);
      if (existsSync(homeConfigDir)) {
        dirs.push(homeConfigDir);
      }
    }

    return [...new Set(dirs)];
  }

  async load(): Promise<MergedConfig | null> {
    const sources: ConfigSource[] = [];
    let priority = 0;

    for (const dir of this.configDirs) {
      const settingsPath = join(dir, SETTINGS_FILE);

      if (!existsSync(settingsPath)) {
        continue;
      }

      try {
        const content = await readFile(settingsPath, "utf-8");
        const settings = JSON.parse(content) as ClaudeCodeSettings;

        sources.push({
          path: settingsPath,
          priority,
          settings,
        });

        priority++;
      } catch (error) {
        console.warn(`Failed to load settings from ${settingsPath}:`, error);
      }
    }

    if (sources.length === 0) {
      return null;
    }

    this.mergedConfig = this.mergeConfigs(sources);
    return this.mergedConfig;
  }

  private mergeConfigs(sources: ConfigSource[]): MergedConfig {
    const sortedSources = [...sources].sort((a, b) => b.priority - a.priority);

    let model: string | undefined;
    const modelOverrides: Record<string, string> = {};
    let availableModels: string[] | undefined;
    const env: Record<string, string> = {};

    for (const source of sortedSources) {
      const settings = source.settings;

      if (settings.model && !model) {
        model = settings.model;
      }

      if (settings.modelOverrides) {
        Object.assign(modelOverrides, settings.modelOverrides);
      }

      if (settings.availableModels) {
        if (!availableModels) {
          availableModels = [];
        }
        availableModels = [...new Set([...settings.availableModels, ...availableModels])];
      }

      if (settings.env) {
        Object.assign(env, settings.env);
      }
    }

    return {
      model,
      modelOverrides,
      availableModels,
      env,
      sources,
    };
  }

  getMergedConfig(): MergedConfig | null {
    return this.mergedConfig;
  }

  getModel(): string | undefined {
    return this.mergedConfig?.model;
  }

  getModelOverrides(): Record<string, string> {
    return this.mergedConfig?.modelOverrides || {};
  }

  getAvailableModels(): string[] | undefined {
    return this.mergedConfig?.availableModels;
  }

  getEnv(): Record<string, string> {
    return this.mergedConfig?.env || {};
  }

  getConfigSources(): ConfigSource[] {
    return this.mergedConfig?.sources || [];
  }

  resolveModelAlias(alias: string): string {
    if (alias in this.modelAliases) {
      return this.modelAliases[alias].resolveTo;
    }

    if (alias.endsWith("[1m]")) {
      const baseAlias = alias.replace("[1m]", "");
      if (baseAlias in this.modelAliases) {
        return this.modelAliases[baseAlias].resolveTo;
      }
    }

    return alias;
  }

  resolveModelWithOverrides(modelOrAlias: string): string {
    const resolvedAlias = this.resolveModelAlias(modelOrAlias);

    const overrides = this.getModelOverrides();
    if (overrides && resolvedAlias in overrides) {
      return overrides[resolvedAlias];
    }

    return resolvedAlias;
  }

  getEffectiveModel(): string | undefined {
    const envModel = process.env.ANTHROPIC_MODEL;
    if (envModel) {
      return this.resolveModelWithOverrides(envModel);
    }

    const settingsModel = this.getModel();
    if (settingsModel) {
      return this.resolveModelWithOverrides(settingsModel);
    }

    return undefined;
  }

  getEffectiveEnv(): Record<string, string> {
    const settingsEnv = this.getEnv();
    const mergedEnv = { ...settingsEnv };

    const envVars = [
      "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "CLAUDE_CODE_SUBAGENT_MODEL",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "CLAUDE_CODE_EFFORT_LEVEL",
    ];

    for (const envVar of envVars) {
      if (process.env[envVar]) {
        mergedEnv[envVar] = process.env[envVar]!;
      }
    }

    return mergedEnv;
  }

  isModelAllowed(modelOrAlias: string): boolean {
    const availableModels = this.getAvailableModels();

    if (!availableModels || availableModels.length === 0) {
      return true;
    }

    const resolvedModel = this.resolveModelAlias(modelOrAlias);

    return availableModels.some((allowed) => {
      const resolvedAllowed = this.resolveModelAlias(allowed);
      return resolvedModel === resolvedAllowed || modelOrAlias === allowed;
    });
  }

  validateModel(modelOrAlias: string): { valid: boolean; reason?: string } {
    if (!this.isModelAllowed(modelOrAlias)) {
      return {
        valid: false,
        reason: `Model "${modelOrAlias}" is not in the allowed models list: ${this.getAvailableModels()?.join(", ")}`,
      };
    }

    return { valid: true };
  }
}

export async function loadClaudeCodeConfig(projectDir: string): Promise<ClaudeCodeConfigAdapter | null> {
  const adapter = new ClaudeCodeConfigAdapter(projectDir);
  const mergedConfig = await adapter.load();

  if (mergedConfig) {
    return adapter;
  }

  return null;
}
