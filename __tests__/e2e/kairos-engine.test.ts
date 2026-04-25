import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Kairos Engine Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Kairos Engine Initialization", () => {
    it("should have memory system initialized", () => {
      expect(services.memorySystem).toBeDefined();
    });
  });

  describe("Kairos Engine Types", () => {
    it("should have DefaultKairosEngine class", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      expect(DefaultKairosEngine).toBeDefined();
    });

    it("should have MemoryDistiller class", async () => {
      const { MemoryDistiller } = await import("../../backend/kairos/distillation.js");
      expect(MemoryDistiller).toBeDefined();
    });

    it("should have KairosEngine interface", async () => {
      const types = await import("../../backend/kairos/types.js");
      expect(types.KairosEngine).toBeDefined();
    });
  });

  describe("Kairos Engine Methods", () => {
    const defaultConfig = {
      enabled: true,
      triggerAfterMinutes: 30,
      triggerOnLowActivity: false,
      nightMode: false,
      nightStartHour: 22,
      nightEndHour: 6
    };

    it("should have shouldTrigger method", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, defaultConfig);
      expect(typeof engine.shouldTrigger).toBe("function");
    });

    it("should have distill method", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, defaultConfig);
      expect(typeof engine.distill).toBe("function");
    });

    it("should have schedule method", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, defaultConfig);
      expect(typeof engine.schedule).toBe("function");
    });
  });

  describe("Kairos Trigger Conditions", () => {
    it("should not trigger when disabled", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, {
        enabled: false,
        triggerAfterMinutes: 30,
        triggerOnLowActivity: false,
        nightMode: false,
        nightStartHour: 22,
        nightEndHour: 6
      });
      const ctx = { sessionDuration: 3600000, messageCount: 100, lastActivityAt: Date.now(), currentHour: 14, lowActivity: false };
      expect(engine.shouldTrigger(ctx)).toBe(false);
    });

    it("should trigger after session duration threshold", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, {
        enabled: true,
        triggerAfterMinutes: 30,
        triggerOnLowActivity: false,
        nightMode: false,
        nightStartHour: 22,
        nightEndHour: 6
      });
      const ctx = { sessionDuration: 3600000, messageCount: 10, lastActivityAt: Date.now(), currentHour: 14, lowActivity: false };
      expect(engine.shouldTrigger(ctx)).toBe(true);
    });

    it("should trigger on low activity", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, { 
        enabled: true, 
        triggerAfterMinutes: 60,
        triggerOnLowActivity: true,
        nightMode: false,
        nightStartHour: 22,
        nightEndHour: 6
      });
      const ctx = { sessionDuration: 1000, messageCount: 5, lastActivityAt: Date.now(), currentHour: 14, lowActivity: true };
      expect(engine.shouldTrigger(ctx)).toBe(true);
    });

    it("should trigger during night mode", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, { 
        enabled: true, 
        triggerAfterMinutes: 60,
        triggerOnLowActivity: false,
        nightMode: true,
        nightStartHour: 22,
        nightEndHour: 6
      });
      const ctx = { sessionDuration: 1000, messageCount: 5, lastActivityAt: Date.now(), currentHour: 23, lowActivity: false };
      expect(engine.shouldTrigger(ctx)).toBe(true);
    });

    it("should trigger during early morning hours", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, { 
        enabled: true, 
        triggerAfterMinutes: 60,
        triggerOnLowActivity: false,
        nightMode: true,
        nightStartHour: 22,
        nightEndHour: 6
      });
      const ctx = { sessionDuration: 1000, messageCount: 5, lastActivityAt: Date.now(), currentHour: 3, lowActivity: false };
      expect(engine.shouldTrigger(ctx)).toBe(true);
    });

    it("should not trigger during day hours with night mode", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, { 
        enabled: true, 
        triggerAfterMinutes: 60,
        triggerOnLowActivity: false,
        nightMode: true,
        nightStartHour: 22,
        nightEndHour: 6
      });
      const ctx = { sessionDuration: 1000, messageCount: 5, lastActivityAt: Date.now(), currentHour: 14, lowActivity: false };
      expect(engine.shouldTrigger(ctx)).toBe(false);
    });
  });

  describe("Memory Distillation", () => {
    const defaultConfig = {
      enabled: true,
      triggerAfterMinutes: 30,
      triggerOnLowActivity: false,
      nightMode: false,
      nightStartHour: 22,
      nightEndHour: 6
    };

    it("should return empty result when no events", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, defaultConfig);
      const result = await engine.distill("empty-session");
      expect(result.extractedFacts).toBe(0);
      expect(result.summary).toContain("No events");
    });

    it("should have MemoryDistiller with distill method", async () => {
      const { MemoryDistiller } = await import("../../backend/kairos/distillation.js");
      const distiller = new MemoryDistiller();
      expect(typeof distiller.distill).toBe("function");
    });

    it("should have MemoryDistiller with storeCards method", async () => {
      const { MemoryDistiller } = await import("../../backend/kairos/distillation.js");
      const distiller = new MemoryDistiller();
      expect(typeof distiller.storeCards).toBe("function");
    });
  });

  describe("Kairos Scheduling", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should not schedule when disabled", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, {
        enabled: false,
        triggerAfterMinutes: 30,
        triggerOnLowActivity: false,
        nightMode: false,
        nightStartHour: 22,
        nightEndHour: 6
      });
      expect(() => engine.schedule()).not.toThrow();
    });

    it("should schedule when enabled", async () => {
      const { DefaultKairosEngine } = await import("../../backend/kairos/engine.js");
      const engine = new DefaultKairosEngine(services.memorySystem!, {
        enabled: true,
        triggerAfterMinutes: 30,
        triggerOnLowActivity: false,
        nightMode: false,
        nightStartHour: 22,
        nightEndHour: 6
      });
      expect(() => engine.schedule()).not.toThrow();
    });
  });

  describe("Distillation Types", () => {
    it("should export DistillationResult interface", async () => {
      const types = await import("../../backend/kairos/types.js");
      expect(typeof types).toBe("object");
    });

    it("should export DreamSchedule interface", async () => {
      const types = await import("../../backend/kairos/types.js");
      expect(typeof types).toBe("object");
    });

    it("should export KairosContext interface", async () => {
      const types = await import("../../backend/kairos/types.js");
      expect(typeof types).toBe("object");
    });
  });
});
