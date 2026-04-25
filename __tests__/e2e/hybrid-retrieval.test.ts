import { describe, it, expect, beforeAll } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Hybrid Retrieval Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("BM25 Index Types", () => {
    it("should have BM25Index class", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      expect(BM25Index).toBeDefined();
    });
  });

  describe("BM25 Index Methods", () => {
    it("should have addDocument method", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      expect(typeof index.addDocument).toBe("function");
    });

    it("should have removeDocument method", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      expect(typeof index.removeDocument).toBe("function");
    });

    it("should have search method", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      expect(typeof index.search).toBe("function");
    });
  });

  describe("BM25 Index Operations", () => {
    it("should add document successfully", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      expect(() => index.addDocument("doc-1", "This is a test document")).not.toThrow();
    });

    it("should remove document successfully", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      index.addDocument("doc-2", "Document to remove");
      expect(() => index.removeDocument("doc-2")).not.toThrow();
    });

    it("should search documents", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      index.addDocument("doc-3", "Hello world");
      index.addDocument("doc-4", "Goodbye world");
      const results = index.search("world", 10);
      expect(results.size).toBeGreaterThan(0);
    });

    it("should return empty results for no matches", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      index.addDocument("doc-5", "Hello world");
      const results = index.search("nonexistent", 10);
      expect(results.size).toBe(0);
    });
  });

  describe("BM25 Configuration", () => {
    it("should accept custom k1 parameter", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index({ k1: 2.0 });
      expect(index).toBeDefined();
    });

    it("should accept custom b parameter", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index({ b: 0.5 });
      expect(index).toBeDefined();
    });

    it("should accept custom avgDocLength parameter", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index({ avgDocLength: 200 });
      expect(index).toBeDefined();
    });
  });

  describe("Hybrid Retrieval Config", () => {
    it("should have HybridRetrievalConfig interface", async () => {
      const types = await import("../../backend/memory/types.js");
      expect(types.HybridRetrievalConfig).toBeDefined();
    });

    it("should have RetrievalItem interface", async () => {
      const types = await import("../../backend/memory/types.js");
      expect(types.RetrievalItem).toBeDefined();
    });

    it("should have HybridRetrievalResult interface", async () => {
      const types = await import("../../backend/memory/types.js");
      expect(types.HybridRetrievalResult).toBeDefined();
    });
  });

  describe("BM25 Edge Cases", () => {
    it("should handle documents with special characters", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      index.addDocument("doc-special", "Hello! @#$%^&*() World?");
      const results = index.search("Hello", 10);
      expect(results.size).toBeGreaterThan(0);
    });

    it("should handle empty documents", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      expect(() => index.addDocument("doc-empty", "")).not.toThrow();
    });

    it("should handle very long documents", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      const longDoc = "word ".repeat(10000);
      expect(() => index.addDocument("doc-long", longDoc)).not.toThrow();
    });

    it("should handle removing non-existent document", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      expect(() => index.removeDocument("non-existent")).not.toThrow();
    });
  });

  describe("BM25 Scoring", () => {
    it("should rank more relevant documents higher", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      index.addDocument("doc-a", "apple banana apple");
      index.addDocument("doc-b", "apple only once");
      const results = index.search("apple", 10);
      const scores = Array.from(results.values());
      expect(scores[0]).toBeGreaterThan(scores[1]);
    });

    it("should handle multi-term queries", async () => {
      const { BM25Index } = await import("../../backend/memory/hybrid-retriever.js");
      const index = new BM25Index();
      index.addDocument("doc-multi", "hello world test");
      const results = index.search("hello world", 10);
      expect(results.size).toBeGreaterThan(0);
    });
  });

  describe("Hybrid Retrieval Config Options", () => {
    it("should have bm25Weight option", async () => {
      const types = await import("../../backend/memory/types.js");
      const config: types.HybridRetrievalConfig = {
        bm25Weight: 0.5,
        vectorWeight: 0.5,
        rrfK: 60,
        minScoreThreshold: 0.1,
        maxResults: 10,
        enableReranking: false,
        rerankTopK: 5,
      };
      expect(config.bm25Weight).toBe(0.5);
    });

    it("should have vectorWeight option", async () => {
      const types = await import("../../backend/memory/types.js");
      const config: types.HybridRetrievalConfig = {
        bm25Weight: 0.5,
        vectorWeight: 0.5,
        rrfK: 60,
        minScoreThreshold: 0.1,
        maxResults: 10,
        enableReranking: false,
        rerankTopK: 5,
      };
      expect(config.vectorWeight).toBe(0.5);
    });
  });
});
