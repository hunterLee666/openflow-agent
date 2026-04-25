import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { ClaudeCodeConfigAdapter, loadClaudeCodeConfig, MODEL_ALIASES } from "../adapters/llm-config-adapter.js";
import type { ProviderConfig } from "./types.js";

export interface LLMConfig {
  providers: Record<string, ProviderConfig>;
  defaultProvider: string;
  defaultModel: string;
  fallbackProviders: string[];
  budgetUsd?: number;
  maxLatencyMs?: number;
  modelAliases?: Record<string, string>;
  modelOverrides?: Record<string, string>;
  availableModels?: string[];
}

export interface LLMConfigFile {
  version: string;
  providers: Record<string, Omit<ProviderConfig, "name">>;
  defaultProvider: string;
  defaultModel: string;
  fallbackProviders: string[];
  budgetUsd?: number;
  maxLatencyMs?: number;
  modelAliases?: Record<string, string>;
  modelOverrides?: Record<string, string>;
  availableModels?: string[];
}

const DEFAULT_CONFIG_FILE = "llm-config.json";

export class LLMConfigManager {
  private config: LLMConfig;
  private configPath: string;
  private claudeAdapter: ClaudeCodeConfigAdapter | null = null;
  private projectDir: string;

  constructor(configDir: string, configFile = DEFAULT_CONFIG_FILE, projectDir?: string) {
    this.configPath = join(resolve(configDir), configFile);
    this.projectDir = projectDir || resolve(configDir);
    this.config = {
      providers: {},
      defaultProvider: "",
      defaultModel: "",
      fallbackProviders: [],
      budgetUsd: 10,
      maxLatencyMs: 5000,
      modelAliases: {},
      modelOverrides: {},
      availableModels: [],
    };
  }

  async initialize(): Promise<void> {
    await this.load();

    this.claudeAdapter = await loadClaudeCodeConfig(this.projectDir);

    if (Object.keys(this.config.providers).length === 0) {
      await this.createDefaultConfig();
    }
  }

  async load(): Promise<void> {
    if (!existsSync(this.configPath)) {
      return;
    }

    try {
      const content = await readFile(this.configPath, "utf-8");
      const fileConfig: LLMConfigFile = JSON.parse(content);

      this.config = {
        providers: {},
        defaultProvider: fileConfig.defaultProvider,
        defaultModel: fileConfig.defaultModel,
        fallbackProviders: fileConfig.fallbackProviders || [],
        budgetUsd: fileConfig.budgetUsd,
        maxLatencyMs: fileConfig.maxLatencyMs,
        modelAliases: fileConfig.modelAliases || {},
        modelOverrides: fileConfig.modelOverrides || {},
        availableModels: fileConfig.availableModels || [],
      };

      for (const [key, provider] of Object.entries(fileConfig.providers)) {
        this.config.providers[key] = {
          name: key,
          ...provider,
        };
      }

      if (this.claudeAdapter) {
        await this.mergeClaudeCodeConfig();
      }
    } catch (error) {
      console.warn(`Failed to load LLM config from ${this.configPath}:`, error);
    }
  }

  private async mergeClaudeCodeConfig(): Promise<void> {
    if (!this.claudeAdapter) return;

    const claudeModel = this.claudeAdapter.getEffectiveModel();
    if (claudeModel) {
      const resolvedModel = this.claudeAdapter.resolveModelWithOverrides(claudeModel);
      this.config.defaultModel = resolvedModel;
    }

    const claudeOverrides = this.claudeAdapter.getModelOverrides();
    if (Object.keys(claudeOverrides).length > 0) {
      this.config.modelOverrides = {
        ...this.config.modelOverrides,
        ...claudeOverrides,
      };
    }

    const claudeAvailableModels = this.claudeAdapter.getAvailableModels();
    if (claudeAvailableModels && claudeAvailableModels.length > 0) {
      this.config.availableModels = claudeAvailableModels;
    }

    const claudeEnv = this.claudeAdapter.getEffectiveEnv();
    if (claudeEnv.ANTHROPIC_API_KEY && this.config.providers.anthropic) {
      this.config.providers.anthropic.apiKey = claudeEnv.ANTHROPIC_API_KEY;
    }
    if (claudeEnv.OPENAI_API_KEY && this.config.providers.openai) {
      this.config.providers.openai.apiKey = claudeEnv.OPENAI_API_KEY;
    }
  }

  async save(): Promise<void> {
    const dir = this.configPath.substring(0, this.configPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });

    const fileConfig: LLMConfigFile = {
      version: "1.0.0",
      providers: {},
      defaultProvider: this.config.defaultProvider,
      defaultModel: this.config.defaultModel,
      fallbackProviders: this.config.fallbackProviders,
      budgetUsd: this.config.budgetUsd,
      maxLatencyMs: this.config.maxLatencyMs,
      modelAliases: this.config.modelAliases,
      modelOverrides: this.config.modelOverrides,
      availableModels: this.config.availableModels,
    };

    for (const [key, provider] of Object.entries(this.config.providers)) {
      const { name, ...rest } = provider;
      fileConfig.providers[key] = rest;
    }

    await writeFile(this.configPath, JSON.stringify(fileConfig, null, 2), "utf-8");
  }

  async addProvider(key: string, config: Omit<ProviderConfig, "name">): Promise<void> {
    this.config.providers[key] = {
      name: key,
      ...config,
    };

    await this.save();
  }

  async removeProvider(key: string): Promise<void> {
    delete this.config.providers[key];

    if (this.config.defaultProvider === key) {
      const providers = Object.keys(this.config.providers);
      this.config.defaultProvider = providers.length > 0 ? providers[0] : "";
    }

    await this.save();
  }

  getProvider(key: string): ProviderConfig | undefined {
    return this.config.providers[key];
  }

  getAllProviders(): Record<string, ProviderConfig> {
    return { ...this.config.providers };
  }

  getDefaultProvider(): ProviderConfig | undefined {
    if (!this.config.defaultProvider) {
      return undefined;
    }
    return this.config.providers[this.config.defaultProvider];
  }

  async setDefaultProvider(key: string): Promise<void> {
    if (!this.config.providers[key]) {
      throw new Error(`Provider "${key}" not found`);
    }

    this.config.defaultProvider = key;
    this.config.defaultModel = this.config.providers[key].defaultModel;

    await this.save();
  }

  async setDefaultModel(provider: string, model: string): Promise<void> {
    if (!this.config.providers[provider]) {
      throw new Error(`Provider "${provider}" not found`);
    }

    this.config.providers[provider].defaultModel = model;
    this.config.defaultProvider = provider;
    this.config.defaultModel = model;

    await this.save();
  }

  async setFallbackProviders(fallbacks: string[]): Promise<void> {
    this.config.fallbackProviders = fallbacks;
    await this.save();
  }

  async setBudget(budgetUsd: number): Promise<void> {
    this.config.budgetUsd = budgetUsd;
    await this.save();
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  hasProvider(key: string): boolean {
    return key in this.config.providers;
  }

  getProviderKeys(): string[] {
    return Object.keys(this.config.providers);
  }

  async setModelAlias(alias: string, model: string): Promise<void> {
    if (!this.config.modelAliases) {
      this.config.modelAliases = {};
    }
    this.config.modelAliases[alias] = model;
    await this.save();
  }

  async removeModelAlias(alias: string): Promise<void> {
    if (this.config.modelAliases) {
      delete this.config.modelAliases[alias];
      await this.save();
    }
  }

  resolveModelAlias(alias: string): string {
    if (this.config.modelAliases && this.config.modelAliases[alias]) {
      return this.config.modelAliases[alias];
    }

    if (alias in MODEL_ALIASES) {
      return MODEL_ALIASES[alias].resolveTo;
    }

    return alias;
  }

  async setModelOverride(anthropicModelId: string, providerModelId: string): Promise<void> {
    if (!this.config.modelOverrides) {
      this.config.modelOverrides = {};
    }
    this.config.modelOverrides[anthropicModelId] = providerModelId;
    await this.save();
  }

  async removeModelOverride(anthropicModelId: string): Promise<void> {
    if (this.config.modelOverrides) {
      delete this.config.modelOverrides[anthropicModelId];
      await this.save();
    }
  }

  resolveModelWithOverrides(modelOrAlias: string): string {
    const resolvedModel = this.resolveModelAlias(modelOrAlias);

    if (this.config.modelOverrides && this.config.modelOverrides[resolvedModel]) {
      return this.config.modelOverrides[resolvedModel];
    }

    return resolvedModel;
  }

  async setAvailableModels(models: string[]): Promise<void> {
    this.config.availableModels = models;
    await this.save();
  }

  isModelAllowed(modelOrAlias: string): boolean {
    if (!this.config.availableModels || this.config.availableModels.length === 0) {
      return true;
    }

    const resolvedModel = this.resolveModelAlias(modelOrAlias);

    return this.config.availableModels.some((allowed) => {
      const resolvedAllowed = this.resolveModelAlias(allowed);
      return resolvedModel === resolvedAllowed || modelOrAlias === allowed;
    });
  }

  validateModel(modelOrAlias: string): { valid: boolean; reason?: string } {
    if (!this.isModelAllowed(modelOrAlias)) {
      return {
        valid: false,
        reason: `Model "${modelOrAlias}" is not in the allowed models list: ${this.config.availableModels?.join(", ")}`,
      };
    }

    return { valid: true };
  }

  getModelAliases(): Record<string, string> {
    return { ...this.config.modelAliases };
  }

  getModelOverrides(): Record<string, string> {
    return { ...this.config.modelOverrides };
  }

  getAvailableModels(): string[] {
    return [...(this.config.availableModels || [])];
  }

  getClaudeAdapter(): ClaudeCodeConfigAdapter | null {
    return this.claudeAdapter;
  }

  private async createDefaultConfig(): Promise<void> {
    const defaultConfig: LLMConfigFile = {
      version: "1.0.0",
      providers: {
        anthropic: {
          baseUrl: "https://api.anthropic.com",
          apiKey: "",
          defaultModel: "claude-sonnet-4-20250514",
          supportedModels: [
            "claude-opus-4-5-20250514",
            "claude-sonnet-4-20250514",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-haiku-20240307",
          ],
          supportsStreaming: true,
          requiresThinkingFlag: false,
          costPer1kInput: 0.015,
          costPer1kOutput: 0.075,
          maxTokens: 8192,
          contextWindow: 200000,
        },
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "",
          defaultModel: "gpt-4o",
          supportedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
          supportsStreaming: true,
          requiresThinkingFlag: false,
          costPer1kInput: 0.01,
          costPer1kOutput: 0.03,
          maxTokens: 16384,
          contextWindow: 128000,
        },
        deepseek: {
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "",
          defaultModel: "deepseek-chat",
          supportedModels: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
          supportsStreaming: true,
          requiresThinkingFlag: false,
          costPer1kInput: 0.001,
          costPer1kOutput: 0.002,
          maxTokens: 8192,
          contextWindow: 64000,
        },
      },
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4-20250514",
      fallbackProviders: ["openai", "deepseek"],
      budgetUsd: 10,
      maxLatencyMs: 5000,
    };

    const dir = this.configPath.substring(0, this.configPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(this.configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");

    await this.load();
  }
}
