import { describe, test, expect } from "bun:test";
import { TokenBudgetInjector, estimateTokensClaude, estimateTokensGPT } from "../../../refactored/core/compaction/token-budget.js";
import type { ContextSegment } from "../../../refactored/core/compaction/types.js";

describe("Token Budget Injector", () => {
  test("should initialize with default config", () => {
    const injector = new TokenBudgetInjector();
    expect(injector.getAvailableBudget()).toBe(1800);
  });

  test("should allow max tokens update", () => {
    const injector = new TokenBudgetInjector();
    injector.setMaxTokens(5000);
    expect(injector.getAvailableBudget()).toBeLessThan(5000);
  });

  test("should estimate tokens for text", () => {
    const injector = new TokenBudgetInjector();
    const estimate = injector.estimateTokens("Hello world");
    expect(estimate.tokens).toBeGreaterThan(0);
    expect(estimate.charCount).toBe(11);
  });

  test("should build context from segments", () => {
    const injector = new TokenBudgetInjector({ maxTokens: 1000 });
    const segments: ContextSegment[] = [
      {
        id: "seg-1",
        content: "Important context",
        tokens: 10,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
      {
        id: "seg-2",
        content: "Less important context",
        tokens: 10,
        priority: "low",
        importance: 0.3,
        source: "semantic",
        canExpand: false,
      },
    ];

    const bundle = injector.buildContext("test query", segments);
    expect(bundle).toBeDefined();
    expect(bundle.segments.length).toBeGreaterThan(0);
  });

  test("should respect token budget", () => {
    const injector = new TokenBudgetInjector({ maxTokens: 100 });
    const segments: ContextSegment[] = [
      {
        id: "seg-1",
        content: "Context 1",
        tokens: 50,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
      {
        id: "seg-2",
        content: "Context 2",
        tokens: 60,
        priority: "medium",
        importance: 0.7,
        source: "semantic",
        canExpand: false,
      },
    ];

    const bundle = injector.buildContext("query", segments);
    expect(bundle.totalTokens).toBeLessThanOrEqual(100);
  });

  test("should prioritize by importance", () => {
    const injector = new TokenBudgetInjector({ maxTokens: 500, reservedTokens: 50 });
    const segments: ContextSegment[] = [
      {
        id: "low-priority",
        content: "Low priority",
        tokens: 30,
        priority: "low",
        importance: 0.2,
        source: "semantic",
        canExpand: false,
      },
      {
        id: "high-priority",
        content: "High priority",
        tokens: 30,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
    ];

    const bundle = injector.buildContext("query", segments);
    expect(bundle.segments.length).toBeGreaterThan(0);
    expect(bundle.segments[0].priority).toBe("high");
  });

  test("should include query in bundle", () => {
    const injector = new TokenBudgetInjector();
    const bundle = injector.buildContext("my query", []);
    expect(bundle.query).toBe("my query");
  });

  test("should include total tokens in bundle", () => {
    const injector = new TokenBudgetInjector();
    const bundle = injector.buildContext("query", []);
    expect(bundle.totalTokens).toBeGreaterThanOrEqual(0);
  });

  test("should render segments", () => {
    const injector = new TokenBudgetInjector();
    const segments: ContextSegment[] = [
      {
        id: "seg-1",
        content: "Content 1",
        tokens: 10,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
      {
        id: "seg-2",
        content: "Content 2",
        tokens: 10,
        priority: "high",
        importance: 0.8,
        source: "semantic",
        canExpand: false,
      },
    ];

    const rendered = injector.render(segments);
    expect(rendered).toContain("[EPISODIC");
    expect(rendered).toContain("[SEMANTIC");
  });

  test("should compress segments", () => {
    const injector = new TokenBudgetInjector({ enableCompression: true, compressionRatio: 0.7 });
    const longContent = "First sentence here. Second sentence is longer. Third sentence adds more content. Fourth sentence continues. Fifth sentence wraps up the thought. Sixth sentence adds another point. Seventh sentence concludes.";
    const segments: ContextSegment[] = [
      {
        id: "seg-1",
        content: longContent,
        tokens: 100,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
    ];

    const compressed = injector.compress(segments);
    expect(compressed[0].content.length).toBeLessThanOrEqual(longContent.length);
  });

  test("should get allocation stats", () => {
    const injector = new TokenBudgetInjector({ maxTokens: 1000 });
    const segments: ContextSegment[] = [
      {
        id: "seg-1",
        content: "Content",
        tokens: 100,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
    ];

    const stats = injector.getAllocationStats(segments);
    expect(stats.totalTokens).toBe(100);
    expect(stats.utilization).toBeGreaterThan(0);
  });

  test("should split by budget", () => {
    const injector = new TokenBudgetInjector({ maxTokens: 500, reservedTokens: 50 });
    const segments: ContextSegment[] = [
      {
        id: "seg-1",
        content: "Content 1",
        tokens: 50,
        priority: "high",
        importance: 0.9,
        source: "episodic",
        canExpand: false,
      },
      {
        id: "seg-2",
        content: "Content 2",
        tokens: 60,
        priority: "medium",
        importance: 0.7,
        source: "semantic",
        canExpand: false,
      },
    ];

    const { primary, overflow } = injector.splitByBudget(segments);
    expect(primary.length).toBe(2);
    expect(overflow.length).toBe(0);
  });

  test("should estimate tokens with Claude method", () => {
    const estimate = estimateTokensClaude("Hello world");
    expect(estimate).toBeGreaterThan(0);
  });

  test("should estimate tokens with GPT method", () => {
    const estimate = estimateTokensGPT("Hello world");
    expect(estimate).toBeGreaterThan(0);
  });
});
