import { describe, it, expect, beforeEach } from "vitest";
import { EnhancedMemoryCore, createEnhancedMemoryCore } from "../../src/memory/enhanced-memory-core.js";
import { KnowledgeGraph, createKnowledgeGraph } from "../../src/memory/knowledge-graph.js";
import { ConfidenceScorer, createConfidenceScorer } from "../../src/memory/confidence-scorer.js";

interface LongMemEvalTestCase {
  id: string;
  category: "fact" | "event" | "preference" | "procedure" | "relationship";
  input: string;
  expectedAnswer: string;
  context?: string[];
}

interface LongMemEvalResult {
  total: number;
  correct: number;
  accuracy: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
}

const FACT_TESTS: LongMemEvalTestCase[] = [
  {
    id: "fact-1",
    category: "fact",
    input: "What is the production database port?",
    expectedAnswer: "5433",
    context: ["The production database runs on port 5433", "We migrated from port 5432 to 5433 last week"],
  },
  {
    id: "fact-2",
    category: "fact",
    input: "What version of Node.js are we using?",
    expectedAnswer: "20",
    context: ["We upgraded to Node.js 20 LTS", "The project requires Node.js version 20 or higher"],
  },
  {
    id: "fact-3",
    category: "fact",
    input: "Who is the project lead?",
    expectedAnswer: "Alice",
    context: ["Alice is leading the new authentication project", "Alice from engineering manages the team"],
  },
];

const EVENT_TESTS: LongMemEvalTestCase[] = [
  {
    id: "event-1",
    category: "event",
    input: "What happened with the auth service last week?",
    expectedAnswer: "migrated",
    context: ["We migrated the auth service to Redis for session tokens", "The migration completed on Tuesday"],
  },
  {
    id: "event-2",
    category: "event",
    input: "When did we deploy the new feature?",
    expectedAnswer: "Friday",
    context: ["The new feature was deployed on Friday evening", "Deployment went smoothly without issues"],
  },
];

const PREFERENCE_TESTS: LongMemEvalTestCase[] = [
  {
    id: "pref-1",
    category: "preference",
    input: "What coding style do I prefer?",
    expectedAnswer: "functional",
    context: ["I prefer functional programming over OOP", "Use arrow functions and avoid classes when possible"],
  },
  {
    id: "pref-2",
    category: "preference",
    input: "How should I format error messages?",
    expectedAnswer: "JSON",
    context: ["Always return errors as JSON objects", "Error format: { code, message, details }"],
  },
];

const PROCEDURE_TESTS: LongMemEvalTestCase[] = [
  {
    id: "proc-1",
    category: "procedure",
    input: "How do I deploy to staging?",
    expectedAnswer: "npm run deploy:staging",
    context: ["Run npm run deploy:staging to deploy to staging", "Make sure to run tests first with npm test"],
  },
  {
    id: "proc-2",
    category: "procedure",
    input: "What is the process for code review?",
    expectedAnswer: "PR",
    context: ["Create a PR and assign two reviewers", "All PRs must pass CI before merging"],
  },
];

const RELATIONSHIP_TESTS: LongMemEvalTestCase[] = [
  {
    id: "rel-1",
    category: "relationship",
    input: "What does the auth service depend on?",
    expectedAnswer: "Redis",
    context: ["The auth service depends on Redis for session tokens", "Redis also caches user permissions"],
  },
  {
    id: "rel-2",
    category: "relationship",
    input: "How are the frontend and backend connected?",
    expectedAnswer: "API",
    context: ["The frontend communicates with the backend via REST API", "GraphQL is used for real-time features"],
  },
];

const ALL_TESTS: LongMemEvalTestCase[] = [
  ...FACT_TESTS,
  ...EVENT_TESTS,
  ...PREFERENCE_TESTS,
  ...PROCEDURE_TESTS,
  ...RELATIONSHIP_TESTS,
];

describe("LongMemEval Benchmark", () => {
  let memory: EnhancedMemoryCore;
  let knowledgeGraph: KnowledgeGraph;
  let confidenceScorer: ConfidenceScorer;

  beforeEach(async () => {
    memory = createEnhancedMemoryCore({
      memoryDir: ".openflow/test-memory-longmemeval",
      enableVectorSearch: true,
      vectorBackend: "hnsw",
    });

    knowledgeGraph = createKnowledgeGraph();
    confidenceScorer = createConfidenceScorer();

    await memory.initialize();
  });

  async function addContext(context: string[]): Promise<void> {
    for (const text of context) {
      await memory.addMemory(text, "user_input");
    }
  }

  async function evaluateAnswer(query: string, expectedAnswer: string): Promise<boolean> {
    const results = await memory.search(query, 5);

    if (results.length === 0) return false;

    const topResult = results[0];
    const content = topResult.content.toLowerCase();
    const expected = expectedAnswer.toLowerCase();

    return content.includes(expected);
  }

  async function runBenchmark(tests: LongMemEvalTestCase[]): Promise<LongMemEvalResult> {
    const result: LongMemEvalResult = {
      total: tests.length,
      correct: 0,
      accuracy: 0,
      byCategory: {},
    };

    for (const test of tests) {
      if (test.context) {
        await addContext(test.context);
      }

      const isCorrect = await evaluateAnswer(test.input, test.expectedAnswer);

      if (isCorrect) {
        result.correct++;
      }

      if (!result.byCategory[test.category]) {
        result.byCategory[test.category] = { total: 0, correct: 0, accuracy: 0 };
      }

      result.byCategory[test.category].total++;

      if (isCorrect) {
        result.byCategory[test.category].correct++;
      }
    }

    result.accuracy = result.correct / result.total;

    for (const category of Object.keys(result.byCategory)) {
      const cat = result.byCategory[category];
      cat.accuracy = cat.total > 0 ? cat.correct / cat.total : 0;
    }

    return result;
  }

  it("should evaluate fact recall accuracy", async () => {
    const result = await runBenchmark(FACT_TESTS);

    expect(result.total).toBe(FACT_TESTS.length);
    expect(result.accuracy).toBeGreaterThan(0.5);
  });

  it("should evaluate event recall accuracy", async () => {
    const result = await runBenchmark(EVENT_TESTS);

    expect(result.total).toBe(EVENT_TESTS.length);
    expect(result.accuracy).toBeGreaterThan(0.5);
  });

  it("should evaluate preference recall accuracy", async () => {
    const result = await runBenchmark(PREFERENCE_TESTS);

    expect(result.total).toBe(PREFERENCE_TESTS.length);
    expect(result.accuracy).toBeGreaterThan(0.5);
  });

  it("should evaluate procedure recall accuracy", async () => {
    const result = await runBenchmark(PROCEDURE_TESTS);

    expect(result.total).toBe(PROCEDURE_TESTS.length);
    expect(result.accuracy).toBeGreaterThan(0.5);
  });

  it("should evaluate relationship recall accuracy", async () => {
    const result = await runBenchmark(RELATIONSHIP_TESTS);

    expect(result.total).toBe(RELATIONSHIP_TESTS.length);
    expect(result.accuracy).toBeGreaterThan(0.5);
  });

  it("should evaluate overall benchmark accuracy", async () => {
    const result = await runBenchmark(ALL_TESTS);

    expect(result.total).toBe(ALL_TESTS.length);
    expect(result.accuracy).toBeGreaterThan(0.6);

    for (const [category, catResult] of Object.entries(result.byCategory)) {
      expect(catResult.total).toBeGreaterThan(0);
      expect(catResult.accuracy).toBeGreaterThanOrEqual(0);
      expect(catResult.accuracy).toBeLessThanOrEqual(1);
    }
  });

  it("should test knowledge graph entity resolution", async () => {
    knowledgeGraph.addEntity({
      id: "alice-1",
      name: "Alice",
      type: "person",
      description: "Project lead from engineering",
      properties: { role: "lead" },
    });

    knowledgeGraph.addEntity({
      id: "alice-2",
      name: "Alice from engineering",
      type: "person",
      description: "Manages the team",
      properties: { role: "manager" },
    });

    const query1 = knowledgeGraph.query({ entityName: "Alice" });
    const query2 = knowledgeGraph.query({ entityName: "Alice from engineering" });

    expect(query1.entities.length).toBeGreaterThan(0);
    expect(query2.entities.length).toBeGreaterThan(0);
  });

  it("should test confidence scoring with time decay", async () => {
    const scoreId = "test-memory-1";
    confidenceScorer.createScore(scoreId, 0.9);

    const initialScore = confidenceScorer.getScore(scoreId);
    expect(initialScore).toBeDefined();
    expect(initialScore!.value).toBe(0.9);

    confidenceScorer.recordAccess(scoreId);
    const afterAccess = confidenceScorer.getScore(scoreId);
    expect(afterAccess!.value).toBeGreaterThan(0.9);

    const oneMonthLater = Date.now() + 30 * 24 * 60 * 60 * 1000;
    confidenceScorer.applyTimeDecay(scoreId, oneMonthLater);
    const afterDecay = confidenceScorer.getScore(scoreId);
    expect(afterDecay!.value).toBeLessThan(0.9);
  });

  it("should test confidence feedback mechanism", async () => {
    const scoreId = "test-memory-2";
    confidenceScorer.createScore(scoreId, 0.8);

    confidenceScorer.recordValidation(scoreId, { type: "positive", strength: 1.0 });
    const afterPositive = confidenceScorer.getScore(scoreId);
    expect(afterPositive!.value).toBeGreaterThan(0.8);

    confidenceScorer.recordValidation(scoreId, { type: "negative", strength: 1.0 });
    const afterNegative = confidenceScorer.getScore(scoreId);
    expect(afterNegative!.value).toBeLessThan(afterPositive!.value);
  });

  it("should test contradiction handling", async () => {
    const scoreId = "test-memory-3";
    confidenceScorer.createScore(scoreId, 0.9);

    confidenceScorer.recordContradiction(scoreId);
    const afterFirst = confidenceScorer.getScore(scoreId);

    confidenceScorer.recordContradiction(scoreId);
    const afterSecond = confidenceScorer.getScore(scoreId);

    expect(afterSecond!.value).toBeLessThan(afterFirst!.value);
  });

  it("should test confidence scorer statistics", async () => {
    confidenceScorer.createScore("high-1", 0.9);
    confidenceScorer.createScore("high-2", 0.8);
    confidenceScorer.createScore("low-1", 0.2);
    confidenceScorer.createScore("low-2", 0.1);

    const stats = confidenceScorer.getStats();

    expect(stats.totalScores).toBe(4);
    expect(stats.highConfidenceCount).toBe(2);
    expect(stats.lowConfidenceCount).toBe(2);
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.averageConfidence).toBeLessThan(1);
  });

  it("should test pruning low confidence memories", async () => {
    confidenceScorer.createScore("keep-1", 0.8);
    confidenceScorer.createScore("keep-2", 0.7);
    confidenceScorer.createScore("remove-1", 0.2);
    confidenceScorer.createScore("remove-2", 0.1);

    const pruned = confidenceScorer.pruneBelow(0.5);

    expect(pruned).toBe(2);
    expect(confidenceScorer.getStats().totalScores).toBe(2);
  });

  it("should test knowledge graph path finding", async () => {
    knowledgeGraph.addEntity({
      id: "auth-service",
      name: "Auth Service",
      type: "project",
      description: "Authentication microservice",
      properties: {},
    });

    knowledgeGraph.addEntity({
      id: "redis",
      name: "Redis",
      type: "tool",
      description: "In-memory data store",
      properties: {},
    });

    knowledgeGraph.addEntity({
      id: "session-tokens",
      name: "Session Tokens",
      type: "concept",
      description: "User session management",
      properties: {},
    });

    knowledgeGraph.addRelation({
      sourceId: "auth-service",
      targetId: "redis",
      type: "depends_on",
      description: "Auth service uses Redis",
    });

    knowledgeGraph.addRelation({
      sourceId: "redis",
      targetId: "session-tokens",
      type: "used_by",
      description: "Redis stores session tokens",
    });

    const paths = knowledgeGraph.findPaths(["auth-service"], 3);

    expect(paths.length).toBeGreaterThan(0);
  });

  it("should test knowledge graph connected entities", async () => {
    knowledgeGraph.addEntity({
      id: "frontend",
      name: "Frontend",
      type: "project",
      description: "React frontend application",
      properties: {},
    });

    knowledgeGraph.addEntity({
      id: "backend",
      name: "Backend",
      type: "project",
      description: "Node.js backend API",
      properties: {},
    });

    knowledgeGraph.addRelation({
      sourceId: "frontend",
      targetId: "backend",
      type: "related_to",
      description: "Frontend communicates with backend",
    });

    const connected = knowledgeGraph.getConnectedEntities("frontend", 1);

    expect(connected.length).toBe(1);
    expect(connected[0].id).toBe("backend");
  });

  it("should test knowledge graph time decay", async () => {
    const now = Date.now();
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    knowledgeGraph.addEntity({
      id: "old-entity",
      name: "Old Entity",
      type: "concept",
      description: "An old concept",
      properties: {},
    });

    const entity = knowledgeGraph.getEntity("old-entity");
    if (entity) {
      entity.updatedAt = oneMonthAgo;
      entity.confidence = 0.9;
    }

    knowledgeGraph.applyTimeDecay(0.01, now);

    const afterDecay = knowledgeGraph.getEntity("old-entity");
    expect(afterDecay!.confidence).toBeLessThan(0.9);
  });

  it("should test knowledge graph pruning", async () => {
    knowledgeGraph.addEntity({
      id: "strong-entity",
      name: "Strong Entity",
      type: "concept",
      description: "A strong concept",
      properties: {},
    });

    knowledgeGraph.addEntity({
      id: "weak-entity",
      name: "Weak Entity",
      type: "concept",
      description: "A weak concept",
      properties: {},
    });

    const weakEntity = knowledgeGraph.getEntity("weak-entity");
    if (weakEntity) {
      weakEntity.confidence = 0.05;
    }

    const result = knowledgeGraph.pruneLowConfidence(0.1);

    expect(result.prunedEntities).toBe(1);
    expect(knowledgeGraph.getEntity("weak-entity")).toBeUndefined();
    expect(knowledgeGraph.getEntity("strong-entity")).toBeDefined();
  });

  it("should test knowledge graph statistics", async () => {
    knowledgeGraph.addEntity({
      id: "person-1",
      name: "Person 1",
      type: "person",
      description: "A person",
      properties: {},
    });

    knowledgeGraph.addEntity({
      id: "project-1",
      name: "Project 1",
      type: "project",
      description: "A project",
      properties: {},
    });

    knowledgeGraph.addRelation({
      sourceId: "person-1",
      targetId: "project-1",
      type: "created_by",
      description: "Person created project",
    });

    const stats = knowledgeGraph.getStats();

    expect(stats.totalEntities).toBe(2);
    expect(stats.totalRelations).toBe(1);
    expect(stats.entityTypes.person).toBe(1);
    expect(stats.entityTypes.project).toBe(1);
    expect(stats.relationTypes.created_by).toBe(1);
  });
});
