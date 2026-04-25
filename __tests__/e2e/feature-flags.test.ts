import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Feature Flags Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Feature Flag Types", () => {
    it("should have FeatureName type", async () => {
      const types = await import("../../backend/flags/feature-flags.js");
      expect(types.FeatureName).toBeDefined();
    });

    it("should have FeatureConfig interface", async () => {
      const types = await import("../../backend/flags/feature-flags.js");
      expect(types.FeatureConfig).toBeDefined();
    });

    it("should have FEATURE_CONFIGS constant", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS).toBeDefined();
    });
  });

  describe("Feature Flag Methods", () => {
    it("should have isFeatureEnabled function", async () => {
      const flags = await import("../../backend/flags/feature-flags.js");
      expect(typeof flags.isFeatureEnabled).toBe("function");
    });

    it("should have getFeatureConfig function", async () => {
      const flags = await import("../../backend/flags/feature-flags.js");
      expect(typeof flags.getFeatureConfig).toBe("function");
    });

    it("should have getAllFeatures function", async () => {
      const flags = await import("../../backend/flags/feature-flags.js");
      expect(typeof flags.getAllFeatures).toBe("function");
    });
  });

  describe("Feature Flag Operations", () => {
    it("should check if feature is enabled", async () => {
      const { isFeatureEnabled } = await import("../../backend/flags/feature-flags.js");
      const result = isFeatureEnabled("BUDDY");
      expect(typeof result).toBe("boolean");
    });

    it("should get feature config", async () => {
      const { getFeatureConfig } = await import("../../backend/flags/feature-flags.js");
      const config = getFeatureConfig("BUDDY");
      expect(config).toBeDefined();
      expect(config?.name).toBe("BUDDY");
    });

    it("should get all features", async () => {
      const { getAllFeatures } = await import("../../backend/flags/feature-flags.js");
      const features = getAllFeatures();
      expect(features.length).toBeGreaterThan(0);
    });
  });

  describe("Feature Flag Categories", () => {
    it("should have core category features", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      const coreFeatures = Object.values(FEATURE_CONFIGS).filter(
        (f) => f.category === "core"
      );
      expect(coreFeatures.length).toBeGreaterThan(0);
    });

    it("should have agent category features", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      const agentFeatures = Object.values(FEATURE_CONFIGS).filter(
        (f) => f.category === "agent"
      );
      expect(agentFeatures.length).toBeGreaterThan(0);
    });

    it("should have ui category features", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      const uiFeatures = Object.values(FEATURE_CONFIGS).filter(
        (f) => f.category === "ui"
      );
      expect(uiFeatures.length).toBeGreaterThan(0);
    });

    it("should have experimental category features", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      const expFeatures = Object.values(FEATURE_CONFIGS).filter(
        (f) => f.category === "experimental"
      );
      expect(expFeatures.length).toBeGreaterThan(0);
    });

    it("should have performance category features", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      const perfFeatures = Object.values(FEATURE_CONFIGS).filter(
        (f) => f.category === "performance"
      );
      expect(perfFeatures.length).toBeGreaterThan(0);
    });
  });

  describe("Feature Flag Configuration", () => {
    it("should have description for each feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      for (const config of Object.values(FEATURE_CONFIGS)) {
        expect(config.description).toBeDefined();
        expect(config.description.length).toBeGreaterThan(0);
      }
    });

    it("should have envVar for each feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      for (const config of Object.values(FEATURE_CONFIGS)) {
        expect(config.envVar).toBeDefined();
        expect(config.envVar.length).toBeGreaterThan(0);
      }
    });

    it("should have defaultEnabled for each feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      for (const config of Object.values(FEATURE_CONFIGS)) {
        expect(typeof config.defaultEnabled).toBe("boolean");
      }
    });
  });

  describe("Specific Feature Flags", () => {
    it("should have BUDDY feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS.BUDDY).toBeDefined();
      expect(FEATURE_CONFIGS.BUDDY.category).toBe("agent");
    });

    it("should have TOKEN_BUDGET feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS.TOKEN_BUDGET).toBeDefined();
      expect(FEATURE_CONFIGS.TOKEN_BUDGET.category).toBe("performance");
    });

    it("should have BRIDGE_MODE feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS.BRIDGE_MODE).toBeDefined();
      expect(FEATURE_CONFIGS.BRIDGE_MODE.category).toBe("core");
    });

    it("should have VOICE_MODE feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS.VOICE_MODE).toBeDefined();
      expect(FEATURE_CONFIGS.VOICE_MODE.category).toBe("ui");
    });

    it("should have KAIROS_BRIEF feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS.KAIROS_BRIEF).toBeDefined();
    });

    it("should have VERIFICATION_AGENT feature", async () => {
      const { FEATURE_CONFIGS } = await import("../../backend/flags/feature-flags.js");
      expect(FEATURE_CONFIGS.VERIFICATION_AGENT).toBeDefined();
    });
  });

  describe("Feature Flag Registry", () => {
    it("should have FeatureFlagRegistry class", async () => {
      const { FeatureFlagRegistry } = await import("../../backend/flags/registry.js");
      expect(FeatureFlagRegistry).toBeDefined();
    });

    it("should have register method", async () => {
      const { FeatureFlagRegistry } = await import("../../backend/flags/registry.js");
      const registry = new FeatureFlagRegistry();
      expect(typeof registry.register).toBe("function");
    });

    it("should have isEnabled method", async () => {
      const { FeatureFlagRegistry } = await import("../../backend/flags/registry.js");
      const registry = new FeatureFlagRegistry();
      expect(typeof registry.isEnabled).toBe("function");
    });

    it("should have setEnabled method", async () => {
      const { FeatureFlagRegistry } = await import("../../backend/flags/registry.js");
      const registry = new FeatureFlagRegistry();
      expect(typeof registry.setEnabled).toBe("function");
    });
  });
});
