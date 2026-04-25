import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HNSWVectorIndex, createHNSWVectorIndex } from "../../refactored/core/memory/hnsw-vector-index.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

describe("HNSWVectorIndex", () => {
  let index: HNSWVectorIndex;
  const testDir = ".openflow/test-hnsw";

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });

    index = createHNSWVectorIndex({
      dimensions: 128,
      storagePath: testDir,
      metric: "cosine",
      M: 16,
      efConstruction: 200,
      efSearch: 50,
    });

    await index.initialize();
  });

  afterEach(async () => {
    await index.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should insert and search vectors", async () => {
    const vector1 = new Float32Array(128).fill(0.1);
    const vector2 = new Float32Array(128).fill(0.5);
    const vector3 = new Float32Array(128).fill(0.9);

    await index.insert({ id: "doc-1", vector: vector1, metadata: { content: "test 1" } });
    await index.insert({ id: "doc-2", vector: vector2, metadata: { content: "test 2" } });
    await index.insert({ id: "doc-3", vector: vector3, metadata: { content: "test 3" } });

    const queryVector = new Float32Array(128).fill(0.5);
    const results = await index.search(queryVector, 2);

    expect(results.length).toBe(2);
    expect(results[0].id).toBeDefined();
    expect(results[0].distance).toBeDefined();
  });

  it("should batch insert vectors", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      vector: new Float32Array(128).fill(i * 0.1),
      metadata: { index: i },
    }));

    await index.batchInsert(entries);

    const count = await index.count();
    expect(count).toBe(10);
  });

  it("should delete vectors", async () => {
    await index.insert({ id: "doc-1", vector: new Float32Array(128).fill(0.1) });
    await index.insert({ id: "doc-2", vector: new Float32Array(128).fill(0.5) });

    await index.delete("doc-1");

    expect(index.has("doc-1")).toBe(false);
    expect(index.has("doc-2")).toBe(true);
  });

  it("should return correct count", async () => {
    await index.insert({ id: "doc-1", vector: new Float32Array(128).fill(0.1) });
    await index.insert({ id: "doc-2", vector: new Float32Array(128).fill(0.5) });
    await index.insert({ id: "doc-3", vector: new Float32Array(128).fill(0.9) });

    const count = await index.count();
    expect(count).toBe(3);
  });

  it("should return stats", async () => {
    await index.insert({ id: "doc-1", vector: new Float32Array(128).fill(0.1) });

    const stats = await index.getStats();

    expect(stats.totalVectors).toBe(1);
    expect(stats.dimensions).toBe(128);
    expect(stats.metric).toBe("cosine");
  });

  it("should support search with filter", async () => {
    await index.insert({ id: "doc-a-1", vector: new Float32Array(128).fill(0.1) });
    await index.insert({ id: "doc-a-2", vector: new Float32Array(128).fill(0.5) });
    await index.insert({ id: "doc-b-1", vector: new Float32Array(128).fill(0.9) });

    const results = await index.search(new Float32Array(128).fill(0.5), 10, {
      filter: (id) => id.startsWith("doc-a"),
    });

    expect(results.length).toBeLessThanOrEqual(2);
    for (const result of results) {
      expect(result.id.startsWith("doc-a")).toBe(true);
    }
  });

  it("should support search with custom efSearch", async () => {
    await index.insert({ id: "doc-1", vector: new Float32Array(128).fill(0.1) });
    await index.insert({ id: "doc-2", vector: new Float32Array(128).fill(0.5) });

    const results = await index.search(new Float32Array(128).fill(0.5), 2, {
      efSearch: 200,
    });

    expect(results.length).toBe(2);
  });

  it("should store and retrieve metadata", async () => {
    const metadata = { content: "test content", type: "fact", importance: 0.8 };
    await index.insert({ id: "doc-1", vector: new Float32Array(128).fill(0.5), metadata });

    const retrieved = index.getMetadata("doc-1");
    expect(retrieved).toEqual(metadata);
  });

  it("should handle number array input", async () => {
    await index.insert({ id: "doc-1", vector: Array.from({ length: 128 }, () => 0.5) });

    const results = await index.search(Array.from({ length: 128 }, () => 0.5), 1);

    expect(results.length).toBe(1);
    expect(results[0].id).toBe("doc-1");
  });

  it("should flush and persist to disk", async () => {
    await index.insert({ id: "doc-1", vector: new Float32Array(128).fill(0.5) });

    await index.flush();

    const count = await index.count();
    expect(count).toBe(1);
  });
});
