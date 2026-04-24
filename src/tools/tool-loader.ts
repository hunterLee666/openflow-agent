import { feature, type FeatureName } from "../flags/index.js";
import type {
  ConditionalTool,
  EnhancedToolRegistry,
  ToolCategory,
  ToolDefinition,
  ToolMetadata,
} from "./enhanced-registry.js";

export interface BuiltInTool {
  name: string;
  description: string;
  category: ToolCategory;
  factory: () => ToolDefinition;
  featureFlag?: FeatureName;
}

export interface ToolLoaderConfig {
  registry: EnhancedToolRegistry;
  tools: BuiltInTool[];
}

export function createToolLoader(config: ToolLoaderConfig): {
  loadAll: () => void;
  loadByCategory: (category: ToolCategory) => void;
  loadByFeature: (flag: FeatureName) => void;
  getAvailableTools: () => BuiltInTool[];
  getLoadedTools: () => ToolDefinition[];
} {
  const { registry, tools } = config;

  const toolMap = new Map<string, BuiltInTool>();
  const categoryMap = new Map<ToolCategory, BuiltInTool[]>();
  const featureMap = new Map<FeatureName, BuiltInTool[]>();

  for (const tool of tools) {
    toolMap.set(tool.name, tool);

    if (!categoryMap.has(tool.category)) {
      categoryMap.set(tool.category, []);
    }
    categoryMap.get(tool.category)!.push(tool);

    if (tool.featureFlag) {
      if (!featureMap.has(tool.featureFlag)) {
        featureMap.set(tool.featureFlag, []);
      }
      featureMap.get(tool.featureFlag)!.push(tool);
    }
  }

  function loadTool(tool: BuiltInTool): void {
    if (!registry.isLoaded(tool.name)) {
      const definition = tool.factory();
      registry.register(definition);
    }
  }

  function shouldLoadTool(tool: BuiltInTool): boolean {
    if (!tool.featureFlag) {
      return true;
    }
    return feature(tool.featureFlag);
  }

  return {
    loadAll(): void {
      for (const tool of tools) {
        if (shouldLoadTool(tool)) {
          loadTool(tool);
        }
      }
    },

    loadByCategory(category: ToolCategory): void {
      const categoryTools = categoryMap.get(category) || [];
      for (const tool of categoryTools) {
        if (shouldLoadTool(tool)) {
          loadTool(tool);
        }
      }
    },

    loadByFeature(flag: FeatureName): void {
      const featureTools = featureMap.get(flag) || [];
      for (const tool of featureTools) {
        if (shouldLoadTool(tool)) {
          loadTool(tool);
        }
      }
    },

    getAvailableTools(): BuiltInTool[] {
      return tools.filter(shouldLoadTool);
    },

    getLoadedTools(): ToolDefinition[] {
      return registry.list();
    },
  };
}

export function createConditionalTool<T extends ToolDefinition>(
  metadata: ToolMetadata,
  factory: () => T,
  condition?: {
    featureFlag?: FeatureName;
    envVar?: string;
    envValue?: string;
    customCheck?: () => boolean;
  }
): ConditionalTool {
  return {
    metadata,
    loader: async () => {
      return factory();
    },
    condition: condition
      ? {
          featureFlag: condition.featureFlag,
          envVar: condition.envVar,
          envValue: condition.envValue,
          customCheck: condition.customCheck,
        }
      : undefined,
  };
}

export function lazyLoadTool<T extends ToolDefinition>(
  factory: () => Promise<T>
): () => Promise<T> {
  let cached: T | null = null;
  return async () => {
    if (cached) {
      return cached;
    }
    cached = await factory();
    return cached;
  };
}

export interface ToolPlugin {
  name: string;
  version: string;
  tools: ToolDefinition[];
  dependencies?: string[];
  initialize?: () => Promise<void>;
  destroy?: () => Promise<void>;
}

export class ToolPluginManager {
  private plugins = new Map<string, ToolPlugin>();
  private registry: EnhancedToolRegistry;

  constructor(registry: EnhancedToolRegistry) {
    this.registry = registry;
  }

  async registerPlugin(plugin: ToolPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }

    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin ${plugin.name} requires ${dep} to be registered first`);
        }
      }
    }

    if (plugin.initialize) {
      await plugin.initialize();
    }

    for (const tool of plugin.tools) {
      this.registry.register(tool);
    }

    this.plugins.set(plugin.name, plugin);
  }

  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not registered`);
    }

    for (const tool of plugin.tools) {
      this.registry.unregister(tool.name);
    }

    if (plugin.destroy) {
      await plugin.destroy();
    }

    this.plugins.delete(name);
  }

  getPlugin(name: string): ToolPlugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }
}
