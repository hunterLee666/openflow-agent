import { describe, it, expect, beforeAll } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Dual Model Retrieval Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Dual Model Retriever Types", () => {
    it("should have DualModelRetriever class", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      expect(DualModelRetriever).toBeDefined();
    });

    it("should have RetrievalResult interface", async () => {
      const types = await import("../../backend/memory/dual-retrieval.js");
      expect(types.RetrievalResult).toBeDefined();
    });
  });

  describe("Dual Model Retriever Methods", () => {
    it("should have retrieve method", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      expect(typeof retriever.retrieve).toBe("function");
    });
  });

  describe("Dual Model Retrieval Operations", () => {
    it("should retrieve from empty candidates", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const result = await retriever.retrieve([], "test query");
      expect(result.cards).toEqual([]);
      expect(result.totalCandidates).toBe(0);
    });

    it("should retrieve from candidates", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const candidates = [
        { id: "c1", title: "Test Card 1", description: "Description 1" },
        { id: "c2", title: "Test Card 2", description: "Description 2" },
      ];
      const result = await retriever.retrieve(candidates, "test");
      expect(result.totalCandidates).toBe(2);
    });

    it("should filter recent cards", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const candidates = [
        { id: "c1", title: "Test Card 1", description: "Description 1" },
        { id: "c2", title: "Test Card 2", description: "Description 2" },
      ];
      const result = await retriever.retrieve(candidates, "test", {
        recentCards: ["c1"],
      });
      expect(result.totalCandidates).toBe(2);
    });
  });

  describe("Dual Model Configuration", () => {
    it("should accept custom maxInjections", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever({ maxInjections: 10 });
      expect(retriever).toBeDefined();
    });

    it("should accept custom scoreThreshold", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever({ scoreThreshold: 0.5 });
      expect(retriever).toBeDefined();
    });

    it("should accept custom fastModelProvider", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever({ fastModelProvider: "openai" });
      expect(retriever).toBeDefined();
    });

    it("should accept custom fastModelName", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever({ fastModelName: "gpt-4" });
      expect(retriever).toBeDefined();
    });
  });

  describe("Retrieval Result Structure", () => {
    it("should return cards in result", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const result = await retriever.retrieve([], "test");
      expect(result.cards).toBeDefined();
    });

    it("should return scores in result", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const result = await retriever.retrieve([], "test");
      expect(result.scores).toBeDefined();
      expect(result.scores instanceof Map).toBe(true);
    });

    it("should return totalCandidates in result", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const result = await retriever.retrieve([], "test");
      expect(result.totalCandidates).toBeDefined();
    });

    it("should return retrievalTime in result", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const result = await retriever.retrieve([], "test");
      expect(result.retrievalTime).toBeDefined();
      expect(result.retrievalTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Retrieval Candidate Structure", () => {
    it("should handle candidates with projectScope", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const candidates = [
        { id: "c1", title: "Test", description: "Desc", projectScope: "project-1" },
      ];
      const result = await retriever.retrieve(candidates, "test");
      expect(result).toBeDefined();
    });

    it("should handle candidates with createdAt", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const candidates = [
        { id: "c1", title: "Test", description: "Desc", createdAt: new Date() },
      ];
      const result = await retriever.retrieve(candidates, "test");
      expect(result).toBeDefined();
    });

    it("should handle candidates with lastAccessedAt", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const candidates = [
        { id: "c1", title: "Test", description: "Desc", lastAccessedAt: new Date() },
      ];
      const result = await retriever.retrieve(candidates, "test");
      expect(result).toBeDefined();
    });

    it("should handle candidates with accessCount", async () => {
      const { DualModelRetriever } = await import("../../backend/memory/dual-retrieval.js");
      const retriever = new DualModelRetriever();
      const candidates = [
        { id: "c1", title: "Test", description: "Desc", accessCount: 5 },
      ];
      const result = await retriever.retrieve(candidates, "test");
      expect(result).toBeDefined();
    });
  });
});
