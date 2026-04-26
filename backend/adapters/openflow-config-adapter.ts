import { readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { z } from "zod";

export const OpenflowSettingsSchema = z.object({
  model: z.string().optional(),
  modelOverrides: z.record(z.string(), z.string()).optional(),
  availableModels: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  permissions: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  }).optional(),
  effortLevel: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  apiKeyHelper: z.string().optional(),
}).passthrough();

export type OpenflowSettings = z.infer<typeof OpenflowSettingsSchema>;

export const ModelAliasSchema = z.object({
  alias: z.string(),
  description: z.string(),
  resolveTo: z.string(),
});

export type ModelAlias = z.infer<typeof ModelAliasSchema>;

export const ConfigSourceSchema = z.object({
  path: z.string(),
  priority: z.number(),
  settings: OpenflowSettingsSchema,
});

export type ConfigSource = z.infer<typeof ConfigSourceSchema>;

export const MergedConfigSchema = z.object({
  model: z.string().optional(),
  modelOverrides: z.record(z.string(), z.string()),
  availableModels: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()),
  sources: z.array(ConfigSourceSchema),
});

export type MergedConfig = z.infer<typeof MergedConfigSchema>;

const CONFIG_FOLDERS = [".openflow"];
const SETTINGS_FILE = "settings.json";

export class OpenflowConfigAdapter {
  private configDirs: string[];
  private mergedConfig: MergedConfig | null = null;
  private modelAliases: Record<string, ModelAlias>;

  constructor(projectDir: string, customAliases?: Record<string, ModelAlias>) {
    this.configDirs = this.buildConfigDirs(projectDir);
    this.modelAliases = customAliases || {};
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
        const rawSettings = JSON.parse(content);
        const settings = OpenflowSettingsSchema.parse(rawSettings);

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
    const envModel = process.env.OPENFLOW_MODEL;
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
      "OPENFLOW_MODEL",
      "OPENFLOW_PROVIDER",
      "OPENFLOW_BASE_URL",
      "OPENFLOW_API_KEY",
      "OPENFLOW_SUBAGENT_MODEL",
      "OPENFLOW_EFFORT_LEVEL",
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

export async function loadOpenflowConfig(projectDir: string): Promise<OpenflowConfigAdapter | null> {
  const adapter = new OpenflowConfigAdapter(projectDir);
  const mergedConfig = await adapter.load();

  if (mergedConfig) {
    return adapter;
  }

  return null;
}
