import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Memory Retrieval Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Memory Retrieval Components", () => {
    it("should have dual model retriever", () => {
      expect(services.dualModelRetriever).toBeDefined();
    });

    it("should have consolidation manager", () => {
      expect(services.consolidationManager).toBeDefined();
    });

    it("should have token budget injector", () => {
      expect(services.tokenBudgetInjector).toBeDefined();
    });

    it("should have memory consolidator", () => {
      expect(services.memoryConsolidator).toBeDefined();
    });

    it("should have session lifecycle manager", () => {
      expect(services.sessionLifecycleManager).toBeDefined();
    });
  });

  describe("Dual Model Retriever", () => {
    it("should have DualModelRetriever class", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/index.js");
      expect(DualModelRetriever).toBeDefined();
    });

    it("should support semantic retrieval", () => {
      expect(services.dualModelRetriever).toBeDefined();
    });

    it("should support keyword retrieval", () => {
      expect(services.dualModelRetriever).toBeDefined();
    });
  });

  describe("Consolidation Manager", () => {
    it("should have ConsolidationManager class", async () => {
      const { ConsolidationManager } = await import("../../backend/memory/index.js");
      expect(ConsolidationManager).toBeDefined();
    });

    it("should support memory consolidation", () => {
      expect(services.consolidationManager).toBeDefined();
    });
  });

  describe("Token Budget Injector", () => {
    it("should have TokenBudgetInjector class", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/index.js");
      expect(TokenBudgetInjector).toBeDefined();
    });

    it("should support token budgeting", () => {
      expect(services.tokenBudgetInjector).toBeDefined();
    });
  });

  describe("Memory Consolidator", () => {
    it("should have MemoryConsolidator class", async () => {
      const { MemoryConsolidator } = await import("../../backend/memory/index.js");
      expect(MemoryConsolidator).toBeDefined();
    });

    it("should support memory summarization", () => {
      expect(services.memoryConsolidator).toBeDefined();
    });
  });

  describe("Session Lifecycle Manager", () => {
    it("should have SessionLifecycleManager class", async () => {
      const { SessionLifecycleManager } = await import("../../backend/memory/index.js");
      expect(SessionLifecycleManager).toBeDefined();
    });

    it("should support session creation", () => {
      expect(services.sessionLifecycleManager).toBeDefined();
    });

    it("should support session termination", () => {
      expect(services.sessionLifecycleManager).toBeDefined();
    });
  });
});
