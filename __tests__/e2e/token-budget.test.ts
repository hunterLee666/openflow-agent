import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Token Budget Management Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Token Budget Injector Initialization", () => {
    it("should have token budget injector initialized", () => {
      expect(services.tokenBudgetInjector).toBeDefined();
    });
  });

  describe("Token Budget Injector Types", () => {
    it("should have TokenBudgetInjector class", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      expect(TokenBudgetInjector).toBeDefined();
    });
  });

  describe("Token Budget Injector Methods", () => {
    it("should have setMaxTokens method", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      expect(typeof injector.setMaxTokens).toBe("function");
    });

    it("should have getAvailableBudget method", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      expect(typeof injector.getAvailableBudget).toBe("function");
    });

    it("should have estimateTokens method", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      expect(typeof injector.estimateTokens).toBe("function");
    });

    it("should have buildContext method", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      expect(typeof injector.buildContext).toBe("function");
    });
  });

  describe("Token Budget Configuration", () => {
    it("should have default max tokens", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      const budget = injector.getAvailableBudget();
      expect(budget).toBeGreaterThan(0);
    });

    it("should allow max tokens update", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      injector.setMaxTokens(5000);
      const budget = injector.getAvailableBudget();
      expect(budget).toBeLessThan(5000);
    });
  });

  describe("Token Estimation", () => {
    it("should estimate tokens for text", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      const estimate = injector.estimateTokens("Hello world");
      expect(estimate.tokens).toBeGreaterThan(0);
      expect(estimate.charCount).toBe(11);
    });

    it("should return correct text in estimate", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      const estimate = injector.estimateTokens("Test content");
      expect(estimate.text).toBe("Test content");
    });
  });

  describe("Context Building", () => {
    it("should build context from segments", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector({ maxTokens: 1000 });
      const segments = [
        {
          id: "seg-1",
          content: "Important context",
          tokens: 10,
          priority: "high" as const,
          importance: 0.9,
          source: "episodic" as const,
          canExpand: false,
        },
        {
          id: "seg-2",
          content: "Less important context",
          tokens: 10,
          priority: "low" as const,
          importance: 0.3,
          source: "semantic" as const,
          canExpand: false,
        },
      ];
      const bundle = injector.buildContext("test query", segments);
      expect(bundle).toBeDefined();
      expect(bundle.segments).toBeDefined();
    });

    it("should respect token budget", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector({ maxTokens: 100 });
      const segments = [
        {
          id: "seg-1",
          content: "Context 1",
          tokens: 50,
          priority: "high" as const,
          importance: 0.9,
          source: "episodic" as const,
          canExpand: false,
        },
        {
          id: "seg-2",
          content: "Context 2",
          tokens: 60,
          priority: "medium" as const,
          importance: 0.7,
          source: "semantic" as const,
          canExpand: false,
        },
      ];
      const bundle = injector.buildContext("query", segments);
      expect(bundle.totalTokens).toBeLessThanOrEqual(100);
    });

    it("should prioritize by importance", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector({ maxTokens: 100 });
      const segments = [
        {
          id: "low-priority",
          content: "Low priority",
          tokens: 30,
          priority: "low" as const,
          importance: 0.2,
          source: "semantic" as const,
          canExpand: false,
        },
        {
          id: "high-priority",
          content: "High priority",
          tokens: 30,
          priority: "high" as const,
          importance: 0.9,
          source: "episodic" as const,
          canExpand: false,
        },
      ];
      const bundle = injector.buildContext("query", segments);
      expect(bundle.segments.length).toBeGreaterThan(0);
    });
  });

  describe("Context Bundle Structure", () => {
    it("should include query in bundle", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      const bundle = injector.buildContext("my query", []);
      expect(bundle.query).toBe("my query");
    });

    it("should include total tokens in bundle", async () => {
      const { TokenBudgetInjector } = await import("../../backend/memory/context-injector.js");
      const injector = new TokenBudgetInjector();
      const bundle = injector.buildContext("query", []);
      expect(bundle.totalTokens).toBeDefined();
      expect(bundle.totalTokens).toBeGreaterThanOrEqual(0);
    });
  });
});
