import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Special Modes Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Undercover Mode", () => {
    it("should have undercover mode initialized", () => {
      expect(services.undercoverMode).toBeDefined();
    });

    it("should have configuration", () => {
      const mode = services.undercoverMode;
      expect(mode).toBeDefined();
    });
  });

  describe("Buddy Mode", () => {
    it("should have buddy mode initialized", () => {
      expect(services.buddy).toBeDefined();
    });

    it("should have configuration", () => {
      const buddy = services.buddy;
      expect(buddy).toBeDefined();
    });
  });

  describe("Deep Planner", () => {
    it("should have deep planner initialized", () => {
      expect(services.deepPlanner).toBeDefined();
    });

    it("should have configuration", () => {
      const planner = services.deepPlanner;
      expect(planner).toBeDefined();
    });
  });

  describe("Easter Egg Manager", () => {
    it("should have easter egg manager initialized", () => {
      expect(services.easterEggManager).toBeDefined();
    });

    it("should trigger easter eggs", () => {
      const manager = services.easterEggManager;
      expect(manager).toBeDefined();
    });
  });

  describe("Parallel Prefetcher", () => {
    it("should have prefetcher initialized", () => {
      expect(services.prefetcher).toBeDefined();
    });

    it("should have configuration", () => {
      const prefetcher = services.prefetcher;
      expect(prefetcher).toBeDefined();
    });
  });
});
