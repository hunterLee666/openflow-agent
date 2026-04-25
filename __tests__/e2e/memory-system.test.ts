import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Memory System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Memory System", () => {
    it("should have memory system initialized", () => {
      expect(services.memorySystem).toBeDefined();
    });
  });

  describe("Dual Model Retriever", () => {
    it("should have dual model retriever initialized", () => {
      expect(services.dualModelRetriever).toBeDefined();
    });
  });

  describe("Consolidation Manager", () => {
    it("should have consolidation manager initialized", () => {
      expect(services.consolidationManager).toBeDefined();
    });
  });

  describe("Token Budget Injector", () => {
    it("should have token budget injector initialized", () => {
      expect(services.tokenBudgetInjector).toBeDefined();
    });
  });

  describe("Memory Consolidator", () => {
    it("should have memory consolidator initialized", () => {
      expect(services.memoryConsolidator).toBeDefined();
    });
  });

  describe("Memory Truncator", () => {
    it("should have memory truncator initialized", () => {
      expect(services.memoryTruncator).toBeDefined();
    });
  });
});
