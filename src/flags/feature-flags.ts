export type FeatureName =
  | "BUDDY"
  | "TRANSCRIPT_CLASSIFIER"
  | "BRIDGE_MODE"
  | "AGENT_TRIGGERS_REMOTE"
  | "CHICAGO_MCP"
  | "VOICE_MODE"
  | "SHOT_STATS"
  | "PROMPT_CACHE_BREAK_DETECTION"
  | "TOKEN_BUDGET"
  | "AGENT_TRIGGERS"
  | "ULTRATHINK"
  | "BUILTIN_EXPLORE_PLAN_AGENTS"
  | "LODESTONE"
  | "EXTRACT_MEMORIES"
  | "VERIFICATION_AGENT"
  | "KAIROS_BRIEF"
  | "AWAY_SUMMARY"
  | "ULTRAPLAN"
  | "DAEMON"
  | "PROMPT_CACHE"
  | "AUTO_MODE"
  | "PLAN_MODE"
  | "TOOL_USAGE_METRICS"
  | "SESSION_SNAPSHOT"
  | "COMPACTION"
  | "HEARTBEAT"
  | "REPL_MODE";

export interface FeatureConfig {
  name: FeatureName;
  description: string;
  defaultEnabled: boolean;
  envVar: string;
  requiresRestart?: boolean;
  category: "core" | "agent" | "ui" | "experimental" | "performance";
}

export const FEATURE_CONFIGS: Record<FeatureName, FeatureConfig> = {
  BUDDY: {
    name: "BUDDY",
    description: "Enable buddy/companion mode",
    defaultEnabled: false,
    envVar: "FEATURE_BUDDY",
    category: "agent",
  },
  TRANSCRIPT_CLASSIFIER: {
    name: "TRANSCRIPT_CLASSIFIER",
    description: "Enable transcript classification",
    defaultEnabled: false,
    envVar: "FEATURE_TRANSCRIPT_CLASSIFIER",
    category: "agent",
  },
  BRIDGE_MODE: {
    name: "BRIDGE_MODE",
    description: "Enable remote control bridge mode",
    defaultEnabled: false,
    envVar: "FEATURE_BRIDGE_MODE",
    category: "core",
  },
  AGENT_TRIGGERS_REMOTE: {
    name: "AGENT_TRIGGERS_REMOTE",
    description: "Enable remote agent triggers",
    defaultEnabled: false,
    envVar: "FEATURE_AGENT_TRIGGERS_REMOTE",
    category: "agent",
  },
  CHICAGO_MCP: {
    name: "CHICAGO_MCP",
    description: "Enable Chicago MCP integration",
    defaultEnabled: false,
    envVar: "FEATURE_CHICAGO_MCP",
    category: "experimental",
  },
  VOICE_MODE: {
    name: "VOICE_MODE",
    description: "Enable voice input mode",
    defaultEnabled: false,
    envVar: "FEATURE_VOICE_MODE",
    category: "ui",
  },
  SHOT_STATS: {
    name: "SHOT_STATS",
    description: "Enable shot statistics tracking",
    defaultEnabled: false,
    envVar: "FEATURE_SHOT_STATS",
    category: "performance",
  },
  PROMPT_CACHE_BREAK_DETECTION: {
    name: "PROMPT_CACHE_BREAK_DETECTION",
    description: "Enable prompt cache break detection",
    defaultEnabled: false,
    envVar: "FEATURE_PROMPT_CACHE_BREAK_DETECTION",
    category: "performance",
  },
  TOKEN_BUDGET: {
    name: "TOKEN_BUDGET",
    description: "Enable token budget tracking",
    defaultEnabled: true,
    envVar: "FEATURE_TOKEN_BUDGET",
    category: "performance",
  },
  AGENT_TRIGGERS: {
    name: "AGENT_TRIGGERS",
    description: "Enable local agent triggers",
    defaultEnabled: true,
    envVar: "FEATURE_AGENT_TRIGGERS",
    category: "agent",
  },
  ULTRATHINK: {
    name: "ULTRATHINK",
    description: "Enable extended thinking mode",
    defaultEnabled: false,
    envVar: "FEATURE_ULTRATHINK",
    category: "agent",
  },
  BUILTIN_EXPLORE_PLAN_AGENTS: {
    name: "BUILTIN_EXPLORE_PLAN_AGENTS",
    description: "Enable built-in explore plan agents",
    defaultEnabled: false,
    envVar: "FEATURE_BUILTIN_EXPLORE_PLAN_AGENTS",
    category: "agent",
  },
  LODESTONE: {
    name: "LODESTONE",
    description: "Enable Lodestone integration",
    defaultEnabled: false,
    envVar: "FEATURE_LODESTONE",
    category: "experimental",
  },
  EXTRACT_MEMORIES: {
    name: "EXTRACT_MEMORIES",
    description: "Enable memory extraction",
    defaultEnabled: false,
    envVar: "FEATURE_EXTRACT_MEMORIES",
    category: "agent",
  },
  VERIFICATION_AGENT: {
    name: "VERIFICATION_AGENT",
    description: "Enable verification agent",
    defaultEnabled: false,
    envVar: "FEATURE_VERIFICATION_AGENT",
    category: "agent",
  },
  KAIROS_BRIEF: {
    name: "KAIROS_BRIEF",
    description: "Enable Kairos brief mode",
    defaultEnabled: false,
    envVar: "FEATURE_KAIROS_BRIEF",
    category: "agent",
  },
  AWAY_SUMMARY: {
    name: "AWAY_SUMMARY",
    description: "Enable away summary",
    defaultEnabled: false,
    envVar: "FEATURE_AWAY_SUMMARY",
    category: "ui",
  },
  ULTRAPLAN: {
    name: "ULTRAPLAN",
    description: "Enable ultra plan mode",
    defaultEnabled: false,
    envVar: "FEATURE_ULTRAPLAN",
    category: "agent",
  },
  DAEMON: {
    name: "DAEMON",
    description: "Enable daemon mode",
    defaultEnabled: false,
    envVar: "FEATURE_DAEMON",
    category: "core",
  },
  PROMPT_CACHE: {
    name: "PROMPT_CACHE",
    description: "Enable prompt caching",
    defaultEnabled: true,
    envVar: "FEATURE_PROMPT_CACHE",
    category: "performance",
  },
  AUTO_MODE: {
    name: "AUTO_MODE",
    description: "Enable automatic execution mode",
    defaultEnabled: false,
    envVar: "FEATURE_AUTO_MODE",
    category: "agent",
  },
  PLAN_MODE: {
    name: "PLAN_MODE",
    description: "Enable plan mode with verification",
    defaultEnabled: true,
    envVar: "FEATURE_PLAN_MODE",
    category: "agent",
  },
  TOOL_USAGE_METRICS: {
    name: "TOOL_USAGE_METRICS",
    description: "Enable tool usage metrics collection",
    defaultEnabled: false,
    envVar: "FEATURE_TOOL_USAGE_METRICS",
    category: "performance",
  },
  SESSION_SNAPSHOT: {
    name: "SESSION_SNAPSHOT",
    description: "Enable session snapshot and recovery",
    defaultEnabled: true,
    envVar: "FEATURE_SESSION_SNAPSHOT",
    category: "core",
  },
  COMPACTION: {
    name: "COMPACTION",
    description: "Enable message compaction",
    defaultEnabled: true,
    envVar: "FEATURE_COMPACTION",
    category: "performance",
  },
  HEARTBEAT: {
    name: "HEARTBEAT",
    description: "Enable heartbeat monitoring",
    defaultEnabled: true,
    envVar: "FEATURE_HEARTBEAT",
    category: "core",
  },
  REPL_MODE: {
    name: "REPL_MODE",
    description: "Enable REPL interactive mode",
    defaultEnabled: true,
    envVar: "FEATURE_REPL_MODE",
    category: "ui",
  },
};

const featureCache: Record<string, boolean | null> = {};
const buildTimeFeatures: Set<FeatureName> = new Set([
  "TOKEN_BUDGET",
  "AGENT_TRIGGERS",
  "PLAN_MODE",
  "SESSION_SNAPSHOT",
  "COMPACTION",
  "HEARTBEAT",
  "REPL_MODE",
  "PROMPT_CACHE",
]);

export function isFeatureEnabled(name: FeatureName): boolean {
  if (featureCache[name] !== undefined) {
    return featureCache[name] as boolean;
  }

  const config = FEATURE_CONFIGS[name];
  if (!config) {
    console.warn(`Unknown feature flag: ${name}`);
    featureCache[name] = false;
    return false;
  }

  const envValue = process.env[config.envVar];
  if (envValue !== undefined) {
    const enabled = envValue === "1" || envValue.toLowerCase() === "true";
    featureCache[name] = enabled;
    return enabled;
  }

  featureCache[name] = config.defaultEnabled;
  return config.defaultEnabled;
}

export function enableFeature(name: FeatureName): void {
  featureCache[name] = true;
  process.env[FEATURE_CONFIGS[name]?.envVar || `FEATURE_${name}`] = "1";
}

export function disableFeature(name: FeatureName): void {
  featureCache[name] = false;
  process.env[FEATURE_CONFIGS[name]?.envVar || `FEATURE_${name}`] = "0";
}

export function resetFeatureCache(): void {
  Object.keys(featureCache).forEach((key) => {
    delete featureCache[key];
  });
}

export function getAllFeatures(): FeatureConfig[] {
  return Object.values(FEATURE_CONFIGS);
}

export function getFeaturesByCategory(
  category: FeatureConfig["category"]
): FeatureConfig[] {
  return Object.values(FEATURE_CONFIGS).filter((f) => f.category === category);
}

export function getEnabledFeatures(): FeatureName[] {
  return Object.keys(FEATURE_CONFIGS).filter((name) =>
    isFeatureEnabled(name as FeatureName)
  ) as FeatureName[];
}

export function isBuildTimeEnabled(name: FeatureName): boolean {
  return buildTimeFeatures.has(name);
}

export function feature(name: FeatureName): boolean {
  return isFeatureEnabled(name);
}

export type { FeatureName as Feature };

export class DefaultFeatureFlagRegistry {
  private customFeatures: Map<FeatureName, FeatureConfig> = new Map();
  private overrides: Map<FeatureName, boolean> = new Map();

  register(config: FeatureConfig): void {
    this.customFeatures.set(config.name, config);
  }

  unregister(name: FeatureName): boolean {
    return this.customFeatures.delete(name);
  }

  get(name: FeatureName): FeatureConfig | undefined {
    return this.customFeatures.get(name) || FEATURE_CONFIGS[name];
  }

  isEnabled(name: FeatureName): boolean {
    if (this.overrides.has(name)) {
      return this.overrides.get(name)!;
    }
    return isFeatureEnabled(name);
  }

  setOverride(name: FeatureName, enabled: boolean): void {
    this.overrides.set(name, enabled);
  }

  clearOverride(name: FeatureName): boolean {
    return this.overrides.delete(name);
  }

  clearAllOverrides(): void {
    this.overrides.clear();
  }

  listAll(): FeatureConfig[] {
    return [
      ...this.customFeatures.values(),
      ...Object.values(FEATURE_CONFIGS),
    ];
  }

  listEnabled(): FeatureConfig[] {
    return this.listAll().filter((f) => this.isEnabled(f.name));
  }

  listByCategory(category: FeatureConfig["category"]): FeatureConfig[] {
    return this.listAll().filter((f) => f.category === category);
  }
}
