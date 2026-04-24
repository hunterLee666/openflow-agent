export interface FeatureFlag {
  name: string;
  description: string;
  defaultValue: boolean;
  category: FlagCategory;
  rolloutPercentage: number;
  requiresRestart: boolean;
  experimental: boolean;
}

export type FlagCategory =
  | "core"
  | "ui"
  | "memory"
  | "tools"
  | "performance"
  | "security"
  | "experimental";

export interface FeatureFlagRegistry {
  register(flag: FeatureFlag): void;
  isEnabled(name: string): boolean;
  setEnabled(name: string, value: boolean): void;
  list(category?: FlagCategory): FeatureFlag[];
  loadFromConfig(config: Record<string, boolean>): void;
  export(): Record<string, boolean>;
}
