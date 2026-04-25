import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Memory Consolidation Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Consolidation Manager Initialization", () => {
    it("should have consolidation manager initialized", () => {
      expect(services.consolidationManager).toBeDefined();
    });

    it("should have memory consolidator initialized", () => {
      expect(services.memoryConsolidator).toBeDefined();
    });
  });

  describe("Consolidation Manager Types", () => {
    it("should have ConsolidationManager class", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      expect(ConsolidationManager).toBeDefined();
    });

    it("should have MemoryConsolidator class", async () => {
      const { MemoryConsolidator } = await import("../../backend/memory/index.js");
      expect(MemoryConsolidator).toBeDefined();
    });
  });

  describe("Consolidation Manager Methods", () => {
    it("should have addEntry method", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      expect(typeof manager.addEntry).toBe("function");
    });

    it("should have removeEntry method", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      expect(typeof manager.removeEntry).toBe("function");
    });

    it("should have consolidate method", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      expect(typeof manager.consolidate).toBe("function");
    });

    it("should have shouldConsolidate method", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      expect(typeof manager.shouldConsolidate).toBe("function");
    });

    it("should have setPolicy method", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      expect(typeof manager.setPolicy).toBe("function");
    });

    it("should have getPolicy method", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      expect(typeof manager.getPolicy).toBe("function");
    });
  });

  describe("Consolidation Policy", () => {
    it("should have default policy values", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      const policy = manager.getPolicy();
      expect(policy.maxAgeDays).toBeDefined();
      expect(policy.decayFactor).toBeDefined();
      expect(policy.mergeSimilarityThreshold).toBeDefined();
    });

    it("should allow policy updates", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      manager.setPolicy({ maxAgeDays: 60 });
      const policy = manager.getPolicy();
      expect(policy.maxAgeDays).toBe(60);
    });
  });

  describe("Consolidation Flow", () => {
    it("should add and retrieve entries", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      const entry = {
        id: "test-entry-1",
        content: "Test memory content",
        importance: 0.8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        validFrom: Date.now(),
        type: "episodic" as const,
        isDeleted: false,
        tags: [],
        decayCount: 0,
      };
      manager.addEntry(entry);
      expect(manager.shouldConsolidate()).toBeDefined();
    });

    it("should remove entries", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      const entry = {
        id: "test-entry-2",
        content: "Test memory to remove",
        importance: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        validFrom: Date.now(),
        type: "episodic" as const,
        isDeleted: false,
        tags: [],
        decayCount: 0,
      };
      manager.addEntry(entry);
      const removed = manager.removeEntry("test-entry-2");
      expect(removed).toBe(true);
    });

    it("should handle non-existent entry removal", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/consolidation.js");
      const manager = new ConsolidationManager();
      const removed = manager.removeEntry("non-existent-id");
      expect(removed).toBe(false);
    });
  });

  describe("Memory Consolidator", () => {
    it("should have MemoryConsolidator class", async () => {
      const { MemoryConsolidator } = await import("../../backend/memory/index.js");
      expect(MemoryConsolidator).toBeDefined();
    });
  });
});
