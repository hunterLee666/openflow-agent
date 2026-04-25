import { describe, it, expect, beforeAll } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Pyramid Retrieval Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Pyramid Retriever Types", () => {
    it("should have PyramidRetriever class", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      expect(PyramidRetriever).toBeDefined();
    });

    it("should have RetrievalLevel enum", async () => {
      const { RetrievalLevel } = await import("../../backend/memory/pyramid-retriever.js");
      expect(RetrievalLevel).toBeDefined();
    });
  });

  describe("Pyramid Retriever Methods", () => {
    it("should have index method", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      expect(typeof retriever.index).toBe("function");
    });

    it("should have remove method", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      expect(typeof retriever.remove).toBe("function");
    });

    it("should have retrieve method", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      expect(typeof retriever.retrieve).toBe("function");
    });
  });

  describe("Retrieval Levels", () => {
    it("should have SUMMARY level", async () => {
      const { RetrievalLevel } = await import("../../backend/memory/pyramid-retriever.js");
      expect(RetrievalLevel.SUMMARY).toBe("summary");
    });

    it("should have METADATA level", async () => {
      const { RetrievalLevel } = await import("../../backend/memory/pyramid-retriever.js");
      expect(RetrievalLevel.METADATA).toBe("metadata");
    });

    it("should have DETAILS level", async () => {
      const { RetrievalLevel } = await import("../../backend/memory/pyramid-retriever.js");
      expect(RetrievalLevel.DETAILS).toBe("details");
    });

    it("should have EVIDENCE level", async () => {
      const { RetrievalLevel } = await import("../../backend/memory/pyramid-retriever.js");
      expect(RetrievalLevel.EVIDENCE).toBe("evidence");
    });
  });

  describe("Pyramid Indexing", () => {
    it("should index memory unit", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      const memory = {
        id: "memory-1",
        type: "text" as const,
        content: "Test memory content",
        summary: "Test summary",
        importance: 0.8,
        createdAt: Date.now(),
        metadata: { tags: [] },
      };
      expect(() => retriever.index(memory)).not.toThrow();
    });

    it("should remove memory unit", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      const memory = {
        id: "memory-2",
        type: "text" as const,
        content: "Memory to remove",
        summary: "Summary",
        importance: 0.5,
        createdAt: Date.now(),
        metadata: { tags: [] },
      };
      retriever.index(memory);
      const removed = retriever.remove("memory-2");
      expect(removed).toBe(true);
    });

    it("should return false for non-existent removal", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      const removed = retriever.remove("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("Pyramid Retrieval", () => {
    it("should retrieve with default options", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      retriever.index({
        id: "ret-memory-1",
        type: "text" as const,
        content: "Important content about testing",
        summary: "Testing summary",
        importance: 0.9,
        createdAt: Date.now(),
        metadata: { tags: [] },
      });
      const result = retriever.retrieve("testing");
      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
    });

    it("should respect topK option", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      for (let i = 0; i < 20; i++) {
        retriever.index({
          id: `ret-memory-${i}`,
          type: "text" as const,
          content: `Content ${i}`,
          summary: `Summary ${i}`,
          importance: 0.5,
          createdAt: Date.now(),
          metadata: { tags: [] },
        });
      }
      const result = retriever.retrieve("content", { topK: 5 });
      expect(result.items.length).toBeLessThanOrEqual(5);
    });

    it("should support filter option", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      retriever.index({
        id: "filter-memory-1",
        type: "text" as const,
        content: "High importance",
        summary: "High",
        importance: 0.9,
        createdAt: Date.now(),
        metadata: { tags: [] },
      });
      retriever.index({
        id: "filter-memory-2",
        type: "text" as const,
        content: "Low importance",
        summary: "Low",
        importance: 0.1,
        createdAt: Date.now(),
        metadata: { tags: [] },
      });
      const result = retriever.retrieve("importance", {
        filter: (m) => m.importance > 0.5,
      });
      expect(result.items.every((i) => i.importance > 0.5)).toBe(true);
    });
  });

  describe("Pyramid Configuration", () => {
    it("should accept custom defaultTopK", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever({ defaultTopK: 20 });
      expect(retriever).toBeDefined();
    });

    it("should accept custom expansionThreshold", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever({ expansionThreshold: 0.9 });
      expect(retriever).toBeDefined();
    });

    it("should accept custom maxExpansionItems", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever({ maxExpansionItems: 10 });
      expect(retriever).toBeDefined();
    });

    it("should accept custom tokenEstimateRatio", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever({ tokenEstimateRatio: 0.3 });
      expect(retriever).toBeDefined();
    });

    it("should accept custom tokenEstimator function", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever({}, (text) => text.length / 3);
      expect(retriever).toBeDefined();
    });
  });

  describe("Cold Storage", () => {
    it("should index memory with cold storage URI", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever({ lazyLoadColdStorage: true });
      const memory = {
        id: "cold-memory-1",
        type: "text" as const,
        content: "Cold storage content",
        summary: "Cold summary",
        importance: 0.7,
        coldStorageUri: "file:///cold/memory-1.json",
        createdAt: Date.now(),
        metadata: { tags: [] },
      };
      expect(() => retriever.index(memory)).not.toThrow();
    });
  });

  describe("Pyramid Result Structure", () => {
    it("should return query in result", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      const result = retriever.retrieve("test query");
      expect(result.query).toBe("test query");
    });

    it("should return level in result", async () => {
      const { PyramidRetriever, RetrievalLevel } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      const result = retriever.retrieve("test", { level: RetrievalLevel.SUMMARY });
      expect(result.level).toBe(RetrievalLevel.SUMMARY);
    });

    it("should return items with tokens", async () => {
      const { PyramidRetriever } = await import("../../backend/memory/pyramid-retriever.js");
      const retriever = new PyramidRetriever();
      retriever.index({
        id: "token-memory",
        type: "text" as const,
        content: "Content for token counting",
        summary: "Token summary",
        importance: 0.8,
        createdAt: Date.now(),
        metadata: { tags: [] },
      });
      const result = retriever.retrieve("content");
      if (result.items.length > 0) {
        expect(result.items[0].tokens).toBeDefined();
        expect(result.items[0].tokens).toBeGreaterThan(0);
      }
    });
  });
});
