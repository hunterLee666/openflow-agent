import type { FeatureFlagRegistry, FeatureFlag, FlagCategory } from "./types.js";

export class DefaultFeatureFlagRegistry implements FeatureFlagRegistry {
  private flags = new Map<string, FeatureFlag>();
  private overrides = new Map<string, boolean>();

  constructor() {
    this.initDefaultFlags();
  }

  private initDefaultFlags(): void {
    const defaults: FeatureFlag[] = [
      // Core
      { name: "enable_streaming", description: "Enable streaming responses", defaultValue: true, category: "core", rolloutPercentage: 100, requiresRestart: false, experimental: false },
      { name: "enable_thinking", description: "Enable extended thinking mode", defaultValue: false, category: "core", rolloutPercentage: 50, requiresRestart: false, experimental: false },
      { name: "enable_parallel_tools", description: "Enable parallel tool execution", defaultValue: true, category: "core", rolloutPercentage: 100, requiresRestart: false, experimental: false },

      // UI
      { name: "enable_vim_mode", description: "Enable Vim key bindings", defaultValue: false, category: "ui", rolloutPercentage: 30, requiresRestart: true, experimental: false },
      { name: "enable_mouse", description: "Enable mouse support", defaultValue: true, category: "ui", rolloutPercentage: 100, requiresRestart: false, experimental: false },
      { name: "enable_osc8", description: "Enable OSC 8 hyperlinks", defaultValue: true, category: "ui", rolloutPercentage: 80, requiresRestart: false, experimental: false },

      // Memory
      { name: "enable_auto_memory", description: "Enable automatic memory extraction", defaultValue: true, category: "memory", rolloutPercentage: 100, requiresRestart: false, experimental: false },
      { name: "enable_kairos", description: "Enable KAIROS dreaming mode", defaultValue: false, category: "memory", rolloutPercentage: 20, requiresRestart: false, experimental: true },
      { name: "enable_semantic_search", description: "Enable semantic memory search", defaultValue: false, category: "memory", rolloutPercentage: 40, requiresRestart: false, experimental: true },

      // Tools
      { name: "enable_mcp", description: "Enable MCP tool integration", defaultValue: true, category: "tools", rolloutPercentage: 100, requiresRestart: true, experimental: false },
      { name: "enable_web_fetch", description: "Enable WebFetch tool", defaultValue: false, category: "tools", rolloutPercentage: 50, requiresRestart: false, experimental: false },
      { name: "enable_web_search", description: "Enable WebSearch tool", defaultValue: false, category: "tools", rolloutPercentage: 30, requiresRestart: false, experimental: true },
      { name: "enable_lsp", description: "Enable LSP integration", defaultValue: true, category: "tools", rolloutPercentage: 80, requiresRestart: true, experimental: false },

      // Performance
      { name: "enable_prompt_cache", description: "Enable prompt caching", defaultValue: true, category: "performance", rolloutPercentage: 100, requiresRestart: false, experimental: false },
      { name: "enable_prefetch", description: "Enable parallel prefetching", defaultValue: true, category: "performance", rolloutPercentage: 100, requiresRestart: false, experimental: false },
      { name: "enable_lazy_loading", description: "Enable tool lazy loading", defaultValue: true, category: "performance", rolloutPercentage: 100, requiresRestart: false, experimental: false },

      // Security
      { name: "enable_sandbox", description: "Enable sandbox execution", defaultValue: true, category: "security", rolloutPercentage: 100, requiresRestart: true, experimental: false },
      { name: "enable_permission_pipeline", description: "Enable permission pipeline", defaultValue: true, category: "security", rolloutPercentage: 100, requiresRestart: false, experimental: false },
      { name: "enable_git_safety", description: "Enable Git safety checks", defaultValue: true, category: "security", rolloutPercentage: 100, requiresRestart: false, experimental: false },

      // Experimental
      { name: "enable_swarm", description: "Enable Swarm multi-agent mode", defaultValue: false, category: "experimental", rolloutPercentage: 10, requiresRestart: true, experimental: true },
      { name: "enable_deep_planning", description: "Enable deep planning mode", defaultValue: false, category: "experimental", rolloutPercentage: 5, requiresRestart: false, experimental: true },
      { name: "enable_undercover", description: "Enable undercover mode", defaultValue: false, category: "experimental", rolloutPercentage: 0, requiresRestart: true, experimental: true },
    ];

    for (const flag of defaults) {
      this.flags.set(flag.name, flag);
    }
  }

  register(flag: FeatureFlag): void {
    this.flags.set(flag.name, flag);
  }

  isEnabled(name: string): boolean {
    const flag = this.flags.get(name);
    if (!flag) return false;

    // Check override first
    if (this.overrides.has(name)) {
      return this.overrides.get(name)!;
    }

    // Check rollout percentage (deterministic based on name hash)
    const hash = this.hashString(name);
    const inRollout = (hash % 100) < flag.rolloutPercentage;

    return flag.defaultValue && inRollout;
  }

  setEnabled(name: string, value: boolean): void {
    this.overrides.set(name, value);
  }

  list(category?: FlagCategory): FeatureFlag[] {
    const all = Array.from(this.flags.values());
    if (!category) return all;
    return all.filter((f) => f.category === category);
  }

  loadFromConfig(config: Record<string, boolean>): void {
    for (const [name, value] of Object.entries(config)) {
      if (this.flags.has(name)) {
        this.overrides.set(name, value);
      }
    }
  }

  export(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [name, flag] of this.flags) {
      result[name] = this.isEnabled(name);
    }
    return result;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }
}
