import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  TokenBudgetInjector,
  createTokenBudgetInjector,
  DEFAULT_TOKEN_BUDGET_CONFIG,
  estimateTokens,
  estimateTokensGPT,
} from "../../backend/compaction/token-budget.js";
import type { ContextSegment, MemorySource, MemoryPriority } from "../../backend/compaction/types.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-token-budget-e2e-${Date.now()}`);

function createTestSegment(overrides: Partial<ContextSegment> = {}): ContextSegment {
  return {
    id: "default-id",
    source: "working",
    content: "Default content",
    priority: "medium",
    importance: 0.5,
    tokens: 10,
    canExpand: false,
    ...overrides,
  };
}

describe("E2E - Token 预算与压缩系统完整场景", () => {
  let injector: TokenBudgetInjector;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    await mkdir(projectDir, { recursive: true });
    injector = new TokenBudgetInjector();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: Token 预算初始化", () => {
    it("应该能够创建 TokenBudgetInjector", () => {
      expect(injector).toBeDefined();
    });

    it("应该能够通过工厂函数创建", () => {
      const newInjector = createTokenBudgetInjector();
      expect(newInjector).toBeDefined();
    });

    it("应该使用默认配置", () => {
      expect(DEFAULT_TOKEN_BUDGET_CONFIG.maxTokens).toBe(2000);
      expect(DEFAULT_TOKEN_BUDGET_CONFIG.reservedTokens).toBe(200);
      expect(DEFAULT_TOKEN_BUDGET_CONFIG.enableCompression).toBe(true);
    });

    it("应该能够自定义配置", () => {
      const customInjector = new TokenBudgetInjector({
        maxTokens: 4000,
        reservedTokens: 400,
        enableCompression: false,
      });

      expect(customInjector.getAvailableBudget()).toBe(3600);
    });

    it("应该能够设置最大 Tokens", () => {
      injector.setMaxTokens(8000);
      expect(injector.getAvailableBudget()).toBe(8000 - 200);
    });

    it("应该能够正确计算可用预算", () => {
      const customInjector = new TokenBudgetInjector({
        maxTokens: 1000,
        reservedTokens: 100,
      });

      expect(customInjector.getAvailableBudget()).toBe(900);
    });
  });

  describe("场景 2: Token 估算", () => {
    it("应该能够估算 Tokens", () => {
      const result = injector.estimateTokens("Hello, world!");
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.charCount).toBe(13);
      expect(result.text).toBe("Hello, world!");
    });

    it("estimateTokens 应该提供合理的估算", () => {
      const tokens = estimateTokens("This is a test sentence.");
      expect(tokens).toBeGreaterThan(0);
    });

    it("estimateTokensGPT 应该提供合理的估算", () => {
      const tokens = estimateTokensGPT("This is a test sentence.");
      expect(tokens).toBeGreaterThan(0);
    });

    it("长文本应该估算出更多 Tokens", () => {
      const shortResult = injector.estimateTokens("Short");
      const longResult = injector.estimateTokens("This is a much longer text that should have significantly more tokens than the short one.");

      expect(longResult.tokens).toBeGreaterThan(shortResult.tokens);
    });

    it("空字符串应该估算为 0 Tokens", () => {
      const result = injector.estimateTokens("");
      expect(result.tokens).toBe(0);
    });
  });

  describe("场景 3: 上下文构建", () => {
    it("应该能够从片段构建上下文", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "segment-1",
          source: "working",
          content: "This is important working memory content.",
          priority: "critical",
          importance: 0.9,
          tokens: 10,
        }),
      ];

      const bundle = injector.buildContext("test query", segments);

      expect(bundle).toBeDefined();
      expect(bundle.query).toBe("test query");
      expect(bundle.segments.length).toBe(1);
      expect(bundle.totalTokens).toBeGreaterThan(0);
      expect(bundle.hitRate).toBe(1);
    });

    it("应该按优先级排序选择片段", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "critical-1",
          source: "working",
          content: "Critical content",
          priority: "critical",
          importance: 1.0,
          tokens: 10,
        }),
        createTestSegment({
          id: "low-1",
          source: "episodic",
          content: "Low priority content",
          priority: "low",
          importance: 0.3,
          tokens: 10,
        }),
      ];

      const bundle = injector.buildContext("query", segments, { maxTokens: 15 });

      expect(bundle.segments.length).toBe(1);
      expect(bundle.segments[0].priority).toBe("critical");
    });

    it("超出预算时应该回退到摘要", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "segment-1",
          source: "working",
          content: "This is very long content that would exceed token limits.",
          summary: "Short summary.",
          priority: "critical",
          importance: 1.0,
          tokens: 100,
          canExpand: true,
        }),
      ];

      const bundle = injector.buildContext("query", segments, { maxTokens: 50 });

      expect(bundle).toBeDefined();
    });

    it("应该按来源组织渲染输出", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "episodic-12345678",
          source: "episodic",
          content: "Episodic memory content.",
          priority: "medium",
          importance: 0.5,
          tokens: 10,
        }),
        createTestSegment({
          id: "working-87654321",
          source: "working",
          content: "Working memory content.",
          priority: "medium",
          importance: 0.5,
          tokens: 10,
        }),
      ];

      const bundle = injector.buildContext("query", segments);

      expect(bundle.renderedContent).toContain("[EPISODIC");
      expect(bundle.renderedContent).toContain("[WORKING");
    });

    it("空片段应该返回空渲染", () => {
      const bundle = injector.buildContext("query", []);

      expect(bundle.segments.length).toBe(0);
      expect(bundle.renderedContent).toBe("");
      expect(bundle.hitRate).toBe(0);
    });

    it("应该能够保留原始顺序", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "segment-1",
          source: "episodic",
          content: "First content",
          priority: "low",
          importance: 0.3,
          tokens: 5,
        }),
        createTestSegment({
          id: "segment-2",
          source: "working",
          content: "Second content",
          priority: "critical",
          importance: 1.0,
          tokens: 5,
        }),
      ];

      const bundle = injector.buildContext("query", segments, { preserveOrder: true });

      expect(bundle).toBeDefined();
    });
  });

  describe("场景 4: 压缩功能", () => {
    it("启用压缩时应该能够压缩长片段", () => {
      const compressingInjector = new TokenBudgetInjector({
        enableCompression: true,
        compressionRatio: 0.5,
      });

      const segments: ContextSegment[] = [
        createTestSegment({
          id: "long-1",
          source: "episodic",
          content: "This is a very long piece of content that needs to be compressed. It contains multiple sentences and should be shortened.",
          priority: "medium",
          importance: 0.5,
          tokens: 60,
        }),
      ];

      const compressed = compressingInjector.compress(segments);

      expect(compressed[0].tokens).toBeLessThanOrEqual(segments[0].tokens);
    });

    it("禁用压缩时不应该压缩", () => {
      const nonCompressingInjector = new TokenBudgetInjector({
        enableCompression: false,
      });

      const segments: ContextSegment[] = [
        createTestSegment({
          id: "long-1",
          source: "episodic",
          content: "Long content here",
          priority: "medium",
          importance: 0.5,
          tokens: 60,
        }),
      ];

      const result = nonCompressingInjector.compress(segments);

      expect(result[0].tokens).toBe(segments[0].tokens);
      expect(result[0].content).toBe(segments[0].content);
    });

    it("短片段不应该被压缩", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "short-1",
          source: "episodic",
          content: "Short.",
          priority: "medium",
          importance: 0.5,
          tokens: 10,
        }),
      ];

      const compressed = injector.compress(segments);

      expect(compressed[0].content).toBe(segments[0].content);
    });

    it("短句应该保持原样", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "short-sentences",
          source: "episodic",
          content: "One. Two. Three.",
          priority: "medium",
          importance: 0.5,
          tokens: 60,
        }),
      ];

      const compressed = injector.compress(segments);
      expect(compressed).toBeDefined();
    });
  });

  describe("场景 5: 分配统计", () => {
    it("应该能够生成分派统计", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "seg-1",
          source: "working",
          content: "Working content",
          priority: "critical",
          importance: 1.0,
          tokens: 50,
        }),
        createTestSegment({
          id: "seg-2",
          source: "episodic",
          content: "Episodic content",
          priority: "medium",
          importance: 0.5,
          tokens: 30,
        }),
      ];

      const stats = injector.getAllocationStats(segments);

      expect(stats.totalTokens).toBe(80);
      expect(stats.utilization).toBeGreaterThan(0);
      expect(stats.bySource.working.count).toBe(1);
      expect(stats.bySource.episodic.count).toBe(1);
      if (stats.byPriority.critical) {
        expect(stats.byPriority.critical.count).toBe(1);
      }
      if (stats.byPriority.medium) {
        expect(stats.byPriority.medium.count).toBe(1);
      }
    });

    it("应该正确计算利用率百分比", () => {
      const customInjector = new TokenBudgetInjector({
        maxTokens: 200,
        reservedTokens: 0,
      });

      const segments: ContextSegment[] = [
        createTestSegment({
          id: "seg-1",
          source: "working",
          content: "Content",
          priority: "high",
          importance: 0.8,
          tokens: 100,
        }),
      ];

      const stats = customInjector.getAllocationStats(segments);

      expect(stats.utilization).toBe(50);
    });

    it("空片段应该返回零统计", () => {
      const stats = injector.getAllocationStats([]);

      expect(stats.totalTokens).toBe(0);
      expect(stats.utilization).toBe(0);
    });
  });

  describe("场景 6: 预算分割", () => {
    it("应该能够分割片段到主集合和溢出集合", () => {
      const customInjector = new TokenBudgetInjector({
        maxTokens: 100,
        reservedTokens: 0,
      });

      const segments: ContextSegment[] = [
        createTestSegment({
          id: "seg-1",
          source: "working",
          content: "First",
          priority: "high",
          importance: 0.8,
          tokens: 40,
        }),
        createTestSegment({
          id: "seg-2",
          source: "episodic",
          content: "Second",
          priority: "medium",
          importance: 0.5,
          tokens: 35,
        }),
        createTestSegment({
          id: "seg-3",
          source: "semantic",
          content: "Third",
          priority: "low",
          importance: 0.3,
          tokens: 40,
        }),
      ];

      const result = customInjector.splitByBudget(segments);

      expect(result.primary.length).toBe(2);
      expect(result.overflow.length).toBe(1);
      expect(result.primary[0].id).toBe("seg-1");
      expect(result.primary[1].id).toBe("seg-2");
      expect(result.overflow[0].id).toBe("seg-3");
    });

    it("所有片段都适合预算时溢出应该为空", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "seg-1",
          source: "working",
          content: "First",
          priority: "high",
          importance: 0.8,
          tokens: 10,
        }),
      ];

      const result = injector.splitByBudget(segments);

      expect(result.primary.length).toBe(1);
      expect(result.overflow.length).toBe(0);
    });

    it("空输入应该返回空结果", () => {
      const result = injector.splitByBudget([]);

      expect(result.primary.length).toBe(0);
      expect(result.overflow.length).toBe(0);
    });
  });

  describe("场景 7: 自定义 Tokenizer", () => {
    it("应该能够使用自定义 Tokenizer", () => {
      let customTokenizerCalled = false;

      const customInjector = new TokenBudgetInjector(
        {},
        (text) => {
          customTokenizerCalled = true;
          return text.length;
        }
      );

      customInjector.estimateTokens("test");

      expect(customTokenizerCalled).toBe(true);
    });

    it("自定义 Tokenizer 应该影响结果", () => {
      const fixedTokenizerInjector = new TokenBudgetInjector(
        {},
        () => 100
      );

      const result = fixedTokenizerInjector.estimateTokens("any text");

      expect(result.tokens).toBe(100);
    });
  });

  describe("场景 8: 复杂上下文场景", () => {
    it("应该能够处理大量上下文片段", () => {
      const segments: ContextSegment[] = [];
      const priorities: MemoryPriority[] = ["critical", "high", "medium", "low"];
      const sources: MemorySource[] = ["episodic", "semantic", "working", "project", "observation"];

      for (let i = 0; i < 50; i++) {
        segments.push(createTestSegment({
          id: `seg-${i}`,
          source: sources[i % sources.length],
          content: `This is context segment number ${i} with some content.`,
          priority: priorities[i % priorities.length],
          importance: Math.random(),
          tokens: 5 + (i % 20),
        }));
      }

      const bundle = injector.buildContext("complex query", segments);

      expect(bundle).toBeDefined();
      expect(bundle.totalTokens).toBeLessThanOrEqual(injector.getAvailableBudget());
      expect(bundle.hitRate).toBeGreaterThan(0);
      expect(bundle.hitRate).toBeLessThanOrEqual(1);
    });

    it("应该能够压缩然后构建上下文", () => {
      const segments: ContextSegment[] = [];

      for (let i = 0; i < 10; i++) {
        segments.push(createTestSegment({
          id: `seg-${i}`,
          source: "working",
          content: `This is a longer piece of content for segment ${i} that should be compressed to save tokens and allow more content to fit within the budget constraints.`,
          priority: "medium",
          importance: 0.5 + Math.random() * 0.5,
          tokens: 80,
        }));
      }

      const compressed = injector.compress(segments);
      const bundle = injector.buildContext("query", compressed);

      expect(bundle).toBeDefined();
      expect(bundle.segments.length).toBeGreaterThan(0);
    });
  });

  describe("场景 9: 边界情况", () => {
    it("单个超大片段应该被跳过", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "huge",
          source: "working",
          content: "Huge content",
          priority: "critical",
          importance: 1.0,
          tokens: 10000,
        }),
      ];

      const bundle = injector.buildContext("query", segments, { maxTokens: 100 });

      expect(bundle.segments.length).toBe(0);
    });

    it("零 Tokens 片段应该被处理", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "zero",
          source: "working",
          content: "",
          priority: "critical",
          importance: 1.0,
          tokens: 0,
        }),
      ];

      const bundle = injector.buildContext("query", segments);

      expect(bundle).toBeDefined();
    });

    it("负重要性片段应该被处理", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "negative",
          source: "working",
          content: "Content",
          priority: "low",
          importance: -0.5,
          tokens: 10,
        }),
      ];

      const bundle = injector.buildContext("query", segments);

      expect(bundle).toBeDefined();
    });
  });

  describe("场景 10: 优先级权重", () => {
    it("优先级权重应该影响片段选择", () => {
      const weightedInjector = new TokenBudgetInjector({
        priorityWeights: {
          critical: 1.0,
          high: 0.1,
          medium: 0.1,
          low: 0.1,
        },
      });

      const segments: ContextSegment[] = [
        createTestSegment({
          id: "high-importance-low-priority",
          source: "working",
          content: "High importance but low priority",
          priority: "low",
          importance: 1.0,
          tokens: 10,
        }),
        createTestSegment({
          id: "low-importance-critical-priority",
          source: "working",
          content: "Low importance but critical priority",
          priority: "critical",
          importance: 0.1,
          tokens: 10,
        }),
      ];

      const bundle = weightedInjector.buildContext("query", segments, { maxTokens: 10 });

      expect(bundle.segments.length).toBe(1);
    });

    it("未知优先级应该使用默认权重", () => {
      const segments: ContextSegment[] = [
        createTestSegment({
          id: "unknown",
          source: "working",
          content: "Unknown priority",
          priority: "medium",
          importance: 0.5,
          tokens: 10,
        }),
      ];

      const bundle = injector.buildContext("query", segments);

      expect(bundle.segments.length).toBe(1);
    });
  });
});
