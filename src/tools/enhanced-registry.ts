import { feature, type FeatureName } from "../flags/index.js";

export type ToolCategory =
  | "file"
  | "agent"
  | "shell"
  | "network"
  | "memory"
  | "task"
  | "search"
  | "mcp"
  | "experimental";

export interface ToolMetadata {
  name: string;
  description: string;
  category: ToolCategory;
  featureFlag?: FeatureName;
  deprecated?: boolean;
  deprecationMessage?: string;
  version?: string;
  author?: string;
}

export interface ToolLoadCondition {
  featureFlag?: FeatureName;
  envVar?: string;
  envValue?: string;
  customCheck?: () => boolean;
}

export interface ConditionalTool {
  metadata: ToolMetadata;
  loader: () => Promise<unknown>;
  condition?: ToolLoadCondition;
}

export interface ToolRegistryConfig {
  enableDynamicLoading?: boolean;
  enableFeatureGating?: boolean;
  toolDirectory?: string;
}

export class EnhancedToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private conditionalTools: ConditionalTool[] = [];
  private loadedTools = new Set<string>();
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig = {}) {
    this.config = {
      enableDynamicLoading: true,
      enableFeatureGating: true,
      ...config,
    };
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.loadedTools.add(tool.name);
  }

  registerConditional(tool: ConditionalTool): void {
    this.conditionalTools.push(tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByCategory(category: ToolCategory): ToolDefinition[] {
    return this.list().filter((tool) => {
      const metadata = (tool as unknown as { metadata?: ToolMetadata }).metadata;
      return metadata?.category === category;
    });
  }

  isLoaded(name: string): boolean {
    return this.loadedTools.has(name);
  }

  async loadConditionalTools(): Promise<void> {
    for (const tool of this.conditionalTools) {
      if (await this.shouldLoadTool(tool)) {
        await this.loadTool(tool);
      }
    }
  }

  private async shouldLoadTool(tool: ConditionalTool): Promise<boolean> {
    if (!this.config.enableFeatureGating || !tool.condition) {
      return true;
    }

    const { featureFlag, envVar, envValue, customCheck } = tool.condition;

    if (featureFlag && !feature(featureFlag)) {
      return false;
    }

    if (envVar) {
      const value = process.env[envVar];
      if (envValue !== undefined && value !== envValue) {
        return false;
      }
      if (envValue === undefined && value !== "1" && value !== "true") {
        return false;
      }
    }

    if (customCheck && !customCheck()) {
      return false;
    }

    return true;
  }

  private async loadTool(tool: ConditionalTool): Promise<void> {
    try {
      const loaded = await tool.loader();
      if (loaded && typeof loaded === "object" && "name" in loaded) {
        this.register(loaded as ToolDefinition);
      }
    } catch (error) {
      console.error(`Failed to load tool ${tool.metadata.name}:`, error);
    }
  }

  getConditionalTools(): ToolMetadata[] {
    return this.conditionalTools.map((t) => t.metadata);
  }

  getAvailableTools(): ToolMetadata[] {
    const availableTools: ToolMetadata[] = [];

    for (const tool of this.conditionalTools) {
      const metadata = { ...tool.metadata };
      if (tool.condition?.featureFlag) {
        metadata.featureFlag = tool.condition.featureFlag;
      }
      availableTools.push(metadata);
    }

    return availableTools;
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  clear(): void {
    this.tools.clear();
    this.loadedTools.clear();
  }

  getStats(): {
    total: number;
    loaded: number;
    conditional: number;
    byCategory: Record<ToolCategory, number>;
  } {
    const byCategory: Record<ToolCategory, number> = {
      file: 0,
      agent: 0,
      shell: 0,
      network: 0,
      memory: 0,
      task: 0,
      search: 0,
      mcp: 0,
      experimental: 0,
    };

    this.tools.forEach((tool) => {
      const metadata = (tool as unknown as { metadata?: ToolMetadata }).metadata;
      if (metadata?.category) {
        byCategory[metadata.category]++;
      }
    });

    return {
      total: this.tools.size,
      loaded: this.loadedTools.size,
      conditional: this.conditionalTools.length,
      byCategory,
    };
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (...args: unknown[]) => unknown;
  metadata?: ToolMetadata;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
}
