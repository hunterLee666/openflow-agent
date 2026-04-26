import type { CompactionProfile } from "../llm/types.js";
import { COMPACTION_PROFILES } from "../llm/types.js";
import { z } from "zod";

export const CompactionConfigSchema = z.object({
  enabled: z.boolean(),
  profile: z.string(),
  autoApply: z.boolean(),
  threshold: z.number(),
});

export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  enabled: true,
  profile: "anthropic-compress",
  autoApply: true,
  threshold: 0.87,
};

export function getCompactionHeaders(
  model: string,
  config?: Partial<CompactionConfig>
): Record<string, string> {
  const cfg = { ...DEFAULT_COMPACTION_CONFIG, ...config };

  if (!cfg.enabled) {
    return {};
  }

  const profile = COMPACTION_PROFILES[cfg.profile];
  if (!profile || !profile.enabled) {
    return {};
  }

  const modelSupported = profile.supportedModels.some(
    (supported) => model.toLowerCase().includes(supported.toLowerCase().split("-").slice(0, -1).join("-"))
  );

  if (!modelSupported) {
    return {};
  }

  return profile.headers;
}

export function isCompactionSupported(model: string): boolean {
  return Object.values(COMPACTION_PROFILES).some(
    (profile) =>
      profile.enabled &&
      profile.supportedModels.some(
        (supported) => model.toLowerCase().includes(supported.toLowerCase().split("-").slice(0, -1).join("-"))
      )
  );
}

export function getCompactionProfile(profileId: string): CompactionProfile | undefined {
  return COMPACTION_PROFILES[profileId];
}

export function listCompactionProfiles(): CompactionProfile[] {
  return Object.values(COMPACTION_PROFILES);
}

export function selectBestCompactionProfile(model: string): CompactionProfile | undefined {
  for (const profile of Object.values(COMPACTION_PROFILES)) {
    if (!profile.enabled) continue;

    const modelSupported = profile.supportedModels.some(
      (supported) => model.toLowerCase().includes(supported.toLowerCase().split("-").slice(0, -1).join("-"))
    );

    if (modelSupported) {
      return profile;
    }
  }

  return undefined;
}
