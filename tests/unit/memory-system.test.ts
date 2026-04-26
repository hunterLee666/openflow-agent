import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SemanticCompressor, createSemanticCompressor } from "../../backend/memory/semantic-compressor.js";
import { TripleIndex, createTripleIndex } from "../../backend/memory/triple-index.js";
import { SemanticSynthesizer, createSemanticSynthesizer } from "../../backend/memory/semantic-synthesizer.js";
import { QueryPlanner, QueryComplexity, createQueryPlanner } from "../../backend/memory/query-planner.js";
import { SessionManager, createSessionManager } from "../../backend/memory/session-manager.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-memory-test-${Date.now()}`);

describe("SemanticCompressor - 语义结构化压缩", () => {
  let compressor: SemanticCompressor;

  beforeEach(() => {
    compressor = createSemanticCompressor();
  });

  it("应该能分割对话为窗口", () => {
    const dialogue = [
      { speaker: "Alice", content: "Hello", timestamp: "2024-01-01T10:00:00" },
      { speaker: "Bob", content: "Hi there", timestamp: "2024-01-01T10:01:00" },
      { speaker: "Alice", content: "How are you?", timestamp: "2024-01-01T10:02:00" },
    ];

    const windows = compressor.segmentDialogue(dialogue);
    expect(windows.length).toBe(1);
    expect(windows[0].turns.length).toBe(3);
  });

  it("应该能计算文本熵", () => {
    const highEntropy = "The quick brown fox jumps over the lazy dog";
    const lowEntropy = "aaaaaa";

    const highScore = compressor.calculateTextEntropy(highEntropy);
    const lowScore = compressor.calculateTextEntropy(lowEntropy);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("应该能通过熵过滤低信息窗口", () => {
    const informativeWindow = {
      turns: [
        { speaker: "Alice", content: "Meeting at Starbucks tomorrow at 2pm to discuss project" },
      ],
    };

    const uninformativeWindow = {
      turns: [
        { speaker: "Alice", content: "ok ok ok" },
      ],
    };

    expect(compressor.filterByEntropy(informativeWindow)).toBe(true);
    expect(compressor.filterByEntropy(uninformativeWindow)).toBe(false);
  });

  it("应该能解析指代", () => {
    const context = new Map([
      ["he", "Alice"],
      ["she", "Bob"],
    ]);

    const text = "He will meet her tomorrow";
    const resolved = compressor.resolveCoreferences(text, context);

    expect(resolved).toContain("Alice");
    expect(resolved).toContain("Bob");
  });

  it("应该能锚定时间戳", () => {
    const text = "Let's meet tomorrow at 2pm";
    const anchored = compressor.anchorTimestamps(text, "2024-01-15T10:00:00");

    expect(anchored).toContain("2024-01-16");
  });

  it("应该能压缩对话为记忆单元", async () => {
    const dialogue = [
      { speaker: "Alice", content: "Let's meet at Starbucks tomorrow at 2pm to discuss the project" },
      { speaker: "Bob", content: "Sure, I'll bring the market analysis report" },
    ];

    const units = await compressor.compressToUnits(dialogue);
    expect(units.length).toBeGreaterThan(0);
    expect(units[0].content).toBeDefined();
    expect(units[0].salience).toBeGreaterThan(0);
  });

  it("应该能压缩事实", async () => {
    const fact = "User prefers dark mode and uses VS Code";
    const unit = await compressor.compressFact(fact);

    expect(unit.content).toBe(fact);
    expect(unit.sourceType).toBe("fact");
    expect(unit.salience).toBeGreaterThan(0);
  });

  it("应该能提取实体", async () => {
    const dialogue = [
      { speaker: "Alice", content: "John will meet Bob at 2:00 PM on 2024-01-15" },
    ];

    const units = await compressor.compressToUnits(dialogue);
    expect(units[0].entities.length).toBeGreaterThan(0);
  });
});

describe("TripleIndex - 三重视图索引", () => {
  let index: TripleIndex;

  beforeEach(() => {
    index = createTripleIndex();
  });

  it("应该能添加语义条目", async () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    await index.addSemanticEntry("test1", embedding, { content: "Test content" });

    const stats = index.getStats();
    expect(stats.semantic).toBe(1);
  });

  it("应该能添加词汇条目", async () => {
    await index.addLexicalEntry("test1", "The quick brown fox jumps over the lazy dog");

    const stats = index.getStats();
    expect(stats.lexical).toBe(1);
  });

  it("应该能添加符号条目", async () => {
    await index.addSymbolicEntry("test1", {
      entities: ["John", "Bob"],
      timestamp: "2024-01-15T14:00:00",
      sourceType: "dialogue",
      salience: 0.8,
    });

    const stats = index.getStats();
    expect(stats.symbolic).toBe(1);
  });

  it("应该能执行混合检索", async () => {
    const embedding1 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const embedding2 = [0.2, 0.3, 0.4, 0.5, 0.6];

    await index.addSemanticEntry("test1", embedding1, { content: "Alice meets Bob at Starbucks" });
    await index.addSemanticEntry("test2", embedding2, { content: "John goes to cafe" });

    await index.addLexicalEntry("test1", "Alice meets Bob at Starbucks");
    await index.addLexicalEntry("test2", "John goes to cafe");

    await index.addSymbolicEntry("test1", {
      entities: ["Alice", "Bob", "Starbucks"],
      timestamp: "2024-01-15T14:00:00",
      sourceType: "dialogue",
      salience: 0.8,
    });

    await index.addSymbolicEntry("test2", {
      entities: ["John", "cafe"],
      timestamp: "2024-01-16T10:00:00",
      sourceType: "dialogue",
      salience: 0.6,
    });

    const results = await index.hybridSearch("Alice Bob Starbucks", embedding1, {
      entities: ["Alice"],
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("test1");
  });

  it("应该能删除条目", async () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    await index.addSemanticEntry("test1", embedding, { content: "Test" });
    await index.addLexicalEntry("test1", "Test content");
    await index.addSymbolicEntry("test1", { salience: 0.5 });

    await index.delete("test1");

    const stats = index.getStats();
    expect(stats.semantic).toBe(0);
    expect(stats.lexical).toBe(0);
    expect(stats.symbolic).toBe(0);
  });
});

describe("SemanticSynthesizer - 在线语义合成", () => {
  let synthesizer: SemanticSynthesizer;

  beforeEach(() => {
    synthesizer = createSemanticSynthesizer();
  });

  it("应该能添加记忆单元", async () => {
    const unit = {
      id: "unit1",
      content: "User wants coffee",
      entities: ["coffee"],
      timestamp: "2024-01-15T10:00:00",
      salience: 0.7,
      sourceType: "dialogue" as const,
    };

    await synthesizer.addUnit(unit);

    const stats = synthesizer.getStats();
    expect(stats.totalUnits).toBe(1);
  });

  it("应该能找到相似单元", async () => {
    const unit1 = {
      id: "unit1",
      content: "User wants coffee with oat milk",
      entities: ["coffee", "oat milk"],
      timestamp: "2024-01-15T10:00:00",
      salience: 0.7,
      sourceType: "dialogue" as const,
    };

    const unit2 = {
      id: "unit2",
      content: "User prefers coffee with oat milk",
      entities: ["coffee", "oat milk"],
      timestamp: "2024-01-15T11:00:00",
      salience: 0.8,
      sourceType: "dialogue" as const,
    };

    await synthesizer.addUnit(unit1);
    const similar = synthesizer.findSimilarUnits(unit2);

    expect(similar.length).toBeGreaterThan(0);
  });

  it("应该能合成多个单元", async () => {
    const units = [
      {
        id: "unit1",
        content: "User wants coffee",
        entities: ["coffee"],
        timestamp: "2024-01-15T10:00:00",
        salience: 0.7,
        sourceType: "dialogue" as const,
      },
      {
        id: "unit2",
        content: "User prefers oat milk",
        entities: ["oat milk"],
        timestamp: "2024-01-15T10:01:00",
        salience: 0.6,
        sourceType: "dialogue" as const,
      },
      {
        id: "unit3",
        content: "User likes it hot",
        entities: [],
        timestamp: "2024-01-15T10:02:00",
        salience: 0.5,
        sourceType: "dialogue" as const,
      },
    ];

    const synthesized = await synthesizer.synthesizeUnits(units);

    expect(synthesized.content).toBeDefined();
    expect(synthesized.entities).toContain("coffee");
    expect(synthesized.entities).toContain("oat milk");
    expect(synthesized.salience).toBeGreaterThan(0.6);
  });

  it("应该能在写入时自动合成", async () => {
    const unit1 = {
      id: "unit1",
      content: "User wants coffee with oat milk",
      entities: ["coffee", "oat milk"],
      timestamp: "2024-01-15T10:00:00",
      salience: 0.7,
      sourceType: "dialogue" as const,
    };

    const unit2 = {
      id: "unit2",
      content: "User prefers coffee with oat milk hot",
      entities: ["coffee", "oat milk"],
      timestamp: "2024-01-15T11:00:00",
      salience: 0.8,
      sourceType: "dialogue" as const,
    };

    await synthesizer.addUnit(unit1);
    await synthesizer.addUnit(unit2);

    const stats = synthesizer.getStats();
    expect(stats.totalUnits).toBeLessThan(2);
  });

  it("应该能整合所有单元", async () => {
    const units = [
      {
        id: "unit1",
        content: "User likes coffee",
        entities: ["coffee"],
        timestamp: "2024-01-15T10:00:00",
        salience: 0.7,
        sourceType: "dialogue" as const,
      },
      {
        id: "unit2",
        content: "User enjoys hiking",
        entities: ["hiking"],
        timestamp: "2024-01-15T11:00:00",
        salience: 0.6,
        sourceType: "dialogue" as const,
      },
    ];

    for (const unit of units) {
      await synthesizer.addUnit(unit);
    }

    const consolidated = await synthesizer.consolidateAll();
    expect(consolidated.length).toBeGreaterThan(0);
  });
});

describe("QueryPlanner - 意图感知检索规划", () => {
  let planner: QueryPlanner;

  beforeEach(() => {
    planner = createQueryPlanner();
  });

  it("应该能估计查询复杂度 - 简单", async () => {
    const complexity = await planner.estimateComplexity("What is Alice's phone number?");
    expect(complexity).toBe(QueryComplexity.LOW);
  });

  it("应该能估计查询复杂度 - 中等", async () => {
    const complexity = await planner.estimateComplexity("When did Alice meet Bob and where?");
    expect(complexity).toBe(QueryComplexity.MEDIUM);
  });

  it("应该能估计查询复杂度 - 高", async () => {
    const complexity = await planner.estimateComplexity("List all meetings between Alice and Bob in the last month and summarize what they discussed");
    expect(complexity).toBe(QueryComplexity.HIGH);
  });

  it("应该能分析查询", async () => {
    const analysis = await planner.analyzeQuery("What does Alice prefer?");

    expect(analysis.complexity).toBeDefined();
    expect(analysis.intentType).toBe("preference");
  });

  it("应该能生成检索计划", async () => {
    const plan = await planner.generateRetrievalPlan("List all meetings between Alice and Bob");

    expect(plan.query).toBe("List all meetings between Alice and Bob");
    expect(plan.retrievalDepth).toBeGreaterThan(3);
    expect(plan.enableSemanticSearch).toBe(true);
    expect(plan.enableLexicalSearch).toBe(true);
  });

  it("应该能提取实体", async () => {
    const analysis = await planner.analyzeQuery("John met Bob on 2024-01-15 at Starbucks");

    expect(analysis.extractedEntities.length).toBeGreaterThan(0);
  });

  it("应该能提取时间范围", async () => {
    const analysis = await planner.analyzeQuery("What happened last week?");

    expect(analysis.extractedTimeRange).toBeDefined();
    expect(analysis.extractedTimeRange?.start).toBeDefined();
    expect(analysis.extractedTimeRange?.end).toBeDefined();
  });

  it("应该能推断意图类型", async () => {
    const preferenceAnalysis = await planner.analyzeQuery("What does user prefer?");
    expect(preferenceAnalysis.intentType).toBe("preference");

    const temporalAnalysis = await planner.analyzeQuery("When did the meeting happen?");
    expect(temporalAnalysis.intentType).toBe("temporal");

    const aggregationAnalysis = await planner.analyzeQuery("List all events");
    expect(aggregationAnalysis.intentType).toBe("aggregation");
  });

  it("应该能计算复杂度分布", () => {
    const queries = [
      "What is X?",
      "When did Y happen and where?",
      "List all Z and summarize",
    ];

    const distribution = planner.getComplexityDistribution(queries);

    expect(distribution[QueryComplexity.LOW]).toBe(1);
    expect(distribution[QueryComplexity.MEDIUM]).toBe(1);
    expect(distribution[QueryComplexity.HIGH]).toBe(1);
  });
});

describe("SessionManager - 会话管理", () => {
  let manager: SessionManager;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    manager = createSessionManager({
      sessionDir: TEST_DIR,
      maxSessions: 10,
    });
    await manager.initialize();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能开始会话", async () => {
    const context = await manager.startSession("session1", "Build a REST API");

    expect(context.sessionId).toBe("session1");
    expect(context.context).toBeDefined();
  });

  it("应该能记录事件", async () => {
    await manager.startSession("session1");

    await manager.recordMessage("session1", "User asked about JWT authentication");
    await manager.recordToolUse("session1", "read_file", "auth/jwt.py", "class JWTHandler");

    const session = await manager.getSession("session1");
    expect(session?.events.length).toBe(2);
  });

  it("应该能结束会话", async () => {
    await manager.startSession("session1");
    await manager.recordMessage("session1", "Test message");

    const report = await manager.endSession("session1", "Completed JWT implementation");

    expect(report.sessionId).toBe("session1");
    expect(report.entriesStored).toBe(1);
    expect(report.summary).toContain("JWT");
  });

  it("应该能获取最近会话", async () => {
    await manager.startSession("session1");
    await manager.endSession("session1");

    await manager.startSession("session2");
    await manager.endSession("session2");

    const recentSessions = await manager.getRecentSessions();
    expect(recentSessions.length).toBe(2);
  });

  it("应该能提取观察", async () => {
    await manager.startSession("session1");

    await manager.recordMessage("session1", "I decided to use JWT for authentication");
    await manager.recordMessage("session1", "I found that Redis is faster than Memcached");
    await manager.recordMessage("session1", "I prefer dark mode");

    const session = await manager.getSession("session1");
    expect(session?.observations.length).toBeGreaterThan(0);
  });

  it("应该能获取会话洞察", async () => {
    await manager.startSession("session1");
    await manager.recordMessage("session1", "I decided to use JWT");
    await manager.endSession("session1");

    await manager.startSession("session2");
    await manager.recordMessage("session2", "I decided to use OAuth");
    await manager.endSession("session2");

    const insights = await manager.getSessionInsights();
    expect(insights.length).toBeGreaterThan(0);
  });

  it("应该能获取统计信息", async () => {
    await manager.startSession("session1");
    await manager.recordMessage("session1", "Test");
    await manager.endSession("session1");

    const stats = manager.getStats();

    expect(stats.totalSessions).toBe(1);
    expect(stats.totalEvents).toBe(1);
  });
});
