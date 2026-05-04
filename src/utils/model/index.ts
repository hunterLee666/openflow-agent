// Model utilities
import type { GlobalConfig } from '../../types';
import { getGlobalConfig as loadGlobalConfig, saveGlobalConfig } from '@utils/config';

export function isDefaultSlowAndCapableModel(_model: string): boolean {
  return false;
}
export function getModelInfo(_model: string): any {
  return null;
}

// Singleton instance (used by getModelManager)
let defaultModelManager: ModelManager | null = null;

export function getModelManager(): ModelManager {
  if (!defaultModelManager) {
    const cfg = loadGlobalConfig();
    defaultModelManager = new ModelManager(cfg);
  }
  return defaultModelManager;
}

export function reloadModelManager(): void {
  defaultModelManager = null;
}

export class ModelManager {
  // No hardcoded models; all models come from user configuration

  constructor(private config: GlobalConfig) {}

  getModelName(pointer?: string): string {
    const model = this.config.model;
    if (pointer === 'main' || !pointer) {
      return model || '';
    }
    return model || '';
  }

  getActiveModelProfiles(): Array<{ modelName: string; provider: string; isActive: boolean; capabilities?: string[]; maxTokens?: number }> {
    const model = this.config.model;
    if (!model) return [];
    const provider = this.getProviderForModel(model);
    return [{
      modelName: model,
      provider,
      isActive: true,
      capabilities: ['tool_calling', 'streaming'],
      maxTokens: 16384,
    }];
  }

  resolveModelWithInfo(modelId: string): { success: boolean; profile: any | null } {
    const model = this.resolveModel(modelId);
    if (model) {
      return { success: true, profile: { ...model, isActive: true, provider: model.provider } };
    }
    return { success: true, profile: null };
  }

  resolveModel(modelId: string): { modelName: string; provider: string; isActive: boolean } | null {
    if (modelId === 'main' || modelId === 'default') {
      const model = this.config.model;
      if (!model) return null;
      return { modelName: model, provider: this.getProviderForModel(model), isActive: true };
    }
    return null;
  }

  getModel(pointer: string): { modelName: string; provider: string; isActive: boolean; name: string } | null {
    if (pointer === 'main' || pointer === 'default') {
      const model = this.config.model;
      if (!model) return null;
      return {
        modelName: model,
        provider: this.getProviderForModel(model),
        isActive: true,
        name: this.getDisplayName(model),
      };
    }
    return null;
  }

  async addModel(config: { modelName?: string; name?: string }): Promise<string> {
    const modelName = config.modelName || config.name || '';
    if (!modelName) return 'custom';
    // Add model to global config's models array
    const cfg = loadGlobalConfig();
    if (!cfg.models) cfg.models = [];
    if (!cfg.models.includes(modelName)) {
      cfg.models.push(modelName);
      saveGlobalConfig(cfg);
      reloadModelManager();
    }
    return modelName;
  }

  getModelSwitchingDebugInfo(): { enabled: boolean; totalModels: number; activeModels: number } {
    const models = this.getAllModels();
    const activeCount = this.config.model ? 1 : 0;
    return { enabled: true, totalModels: models.length, activeModels: activeCount };
  }

  getAllAvailableModelNames(): string[] {
    return this.getAllModels();
  }

  getAvailableModels(): Array<{ modelName: string; provider: string; isActive: boolean; displayName?: string; capabilities?: string[]; maxTokens?: number }> {
    const models = this.getAllModels();
    const currentModel = this.config.model;
    return models.map(model => ({
      modelName: model,
      provider: this.getProviderForModel(model),
      isActive: model === currentModel,
      displayName: this.getDisplayName(model),
      capabilities: ['tool_calling', 'streaming'],
      maxTokens: 16384,
    }));
  }

  async removeModel(modelName: string): Promise<boolean> {
    const cfg = loadGlobalConfig();
    if (!cfg.models) return false;
    const index = cfg.models.indexOf(modelName);
    if (index === -1) return false;
    cfg.models.splice(index, 1);
    // If removing the currently active model, unset it
    if (cfg.model === modelName) {
      cfg.model = undefined;
    }
    saveGlobalConfig(cfg);
    reloadModelManager();
    return true;
  }

  switchToNextModel(_currentTokens: number): { success: boolean; modelName?: string; message?: string; blocked?: boolean } {
    const models = this.getAllModels();
    if (models.length <= 1) {
      return { success: false, message: 'Need at least 2 models to switch. Use /model add to add more.' };
    }
    const currentModel = this.config.model;
    const currentIndex = currentModel ? models.indexOf(currentModel) : -1;
    let nextModel: string;
    if (currentIndex === -1) {
      nextModel = models[0];
    } else {
      const nextIdx = (currentIndex + 1) % models.length;
      nextModel = models[nextIdx];
    }
    this.setModel(nextModel);
    return { success: true, modelName: nextModel };
  }

  private getAllModels(): string[] {
    // Use configured model list; if none, return empty array (no defaults)
    const cfg = this.config;
    const configuredModels = cfg.models || [];
    // Ensure current model is in the list if it exists
    if (cfg.model && !configuredModels.includes(cfg.model)) {
      return [...configuredModels, cfg.model];
    }
    return configuredModels;
  }

  private setModel(model: string): void {
    // Update global config
    const cfg = loadGlobalConfig();
    cfg.model = model;
    saveGlobalConfig(cfg);
    // Update instance config
    this.config.model = model;
    // Reset singleton to force reload with new config
    reloadModelManager();
  }

  private getProviderForModel(model: string): string {
    if (model.startsWith('claude-') || model.startsWith('anthropic-')) {
      return 'anthropic';
    }
    if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-') || model.startsWith('o4-') || model.startsWith('deepseek') || model.startsWith('qwen') || model.startsWith('yi-') || model.startsWith('glm') || model.startsWith('mistral') || model.startsWith('gemma')) {
      return 'openai';
    }
    return 'custom';
  }

  private getDisplayName(model: string): string {
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('opus')) return 'Opus';
    if (model.includes('gpt-4')) return 'GPT-4';
    if (model.includes('gpt-3.5')) return 'GPT-3.5';
    return model;
  }
}

// Bedrock / Vertex flags
export const USE_BEDROCK = false;
export const USE_VERTEX = false;
export function getVertexRegionForModel(_model: string): string {
  return 'us-east-1';
}
