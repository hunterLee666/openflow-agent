import type { FeatureName } from "./feature-flags.js";

export type BuildTimeFeature = FeatureName | string;

export interface BuildTimeConfig {
  enabled: BuildTimeFeature[];
  disabled: BuildTimeFeature[];
  dce: boolean;
}

export const BUILD_TIME_FEATURES: BuildTimeFeature[] = [
  "TOKEN_BUDGET",
  "AGENT_TRIGGERS",
  "PLAN_MODE",
  "SESSION_SNAPSHOT",
  "COMPACTION",
  "HEARTBEAT",
  "REPL_MODE",
  "PROMPT_CACHE",
];

export function isBuildTimeFeature(name: string): boolean {
  return BUILD_TIME_FEATURES.includes(name as BuildTimeFeature);
}

export function getBuildTimeConfig(): BuildTimeConfig {
  const enabled: BuildTimeFeature[] = [];
  const disabled: BuildTimeFeature[] = [];

  for (const feature of BUILD_TIME_FEATURES) {
    const envVar = `FEATURE_${feature}`;
    const envValue = process.env[envVar];

    if (envValue === "1" || envValue?.toLowerCase() === "true") {
      enabled.push(feature);
    } else if (envValue === "0" || envValue?.toLowerCase() === "false") {
      disabled.push(feature);
    } else {
      enabled.push(feature);
    }
  }

  return {
    enabled,
    disabled,
    dce: process.env.FEATURE_DCE !== "false",
  };
}

export function conditionalImport<T>(
  featureName: BuildTimeFeature,
  importFn: () => T,
  fallback: T | null = null
): T | null {
  if (isBuildTimeFeature(featureName)) {
    return importFn();
  }
  return fallback;
}

export function conditionalCode<T>(
  featureName: BuildTimeFeature,
  code: () => T,
  fallback: T | null = null
): T | null {
  if (isBuildTimeFeature(featureName)) {
    return code();
  }
  return fallback;
}
