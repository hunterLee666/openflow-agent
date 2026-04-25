import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EpisodicEvent } from "../../backend/memory/types.js";

const createMockEvent = (overrides: Partial<EpisodicEvent> = {}): EpisodicEvent => ({
  id: `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  sessionId: "test-session",
  type: "user_message",
  content: "Test content",
  timestamp: Date.now(),
  ...overrides,
});

describe("E2E: Episodic Memory Flow", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `episodic-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("FileEpisodicMemory", () => {
    it("should create memory with base directory", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      expect(memory).toBeDefined();
    });

    it("should record an event", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      const event = createMockEvent({
        content: "Hello world",
      });
      
      await memory.record(event);
      
      const results = await memory.retrieve("Hello");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toBe("Hello world");
    });

    it("should record multiple events", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ content: "First message" }));
      await memory.record(createMockEvent({ type: "tool_use", content: "Used tool A" }));
      await memory.record(createMockEvent({ type: "completion", content: "Task completed" }));
      
      const results = await memory.retrieve("message");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should retrieve events by keyword", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ content: "The quick brown fox" }));
      await memory.record(createMockEvent({ content: "The lazy dog" }));
      
      const foxResults = await memory.retrieve("fox");
      expect(foxResults.some(e => e.content.includes("fox"))).toBe(true);
      
      const dogResults = await memory.retrieve("dog");
      expect(dogResults.some(e => e.content.includes("dog"))).toBe(true);
    });

    it("should limit retrieval results", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      for (let i = 0; i < 20; i++) {
        await memory.record(createMockEvent({ content: `Test message ${i}` }));
      }
      
      const results = await memory.retrieve("Test", 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should summarize session", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      const sessionId = "summary-session";
      
      await memory.record(createMockEvent({ sessionId, type: "user_message", content: "Message 1" }));
      await memory.record(createMockEvent({ sessionId, type: "user_message", content: "Message 2" }));
      await memory.record(createMockEvent({ sessionId, type: "tool_use", content: "Tool call" }));
      await memory.record(createMockEvent({ sessionId, type: "error", content: "Error occurred" }));
      await memory.record(createMockEvent({ sessionId, type: "completion", content: "Done" }));
      
      const summary = await memory.summarize(sessionId);
      
      expect(summary).toContain(sessionId);
      expect(summary).toContain("2 user messages");
      expect(summary).toContain("1 tool calls");
      expect(summary).toContain("1 errors");
      expect(summary).toContain("1 completions");
    });

    it("should return default summary for non-existent session", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      const summary = await memory.summarize("non-existent");
      
      expect(summary).toBe("No events recorded.");
    });

    it("should handle events from multiple sessions", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ sessionId: "session-a", content: "Session A message" }));
      await memory.record(createMockEvent({ sessionId: "session-b", content: "Session B message" }));
      
      const results = await memory.retrieve("Session");
      expect(results.length).toBe(2);
      
      const summaryA = await memory.summarize("session-a");
      expect(summaryA).toContain("session-a");
      
      const summaryB = await memory.summarize("session-b");
      expect(summaryB).toContain("session-b");
    });
  });

  describe("EpisodicEvent Types", () => {
    it("should handle user_message type", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ type: "user_message", content: "User input" }));
      
      const results = await memory.retrieve("User");
      expect(results[0].type).toBe("user_message");
    });

    it("should handle tool_use type", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ type: "tool_use", content: "Executed bash command" }));
      
      const results = await memory.retrieve("bash");
      expect(results[0].type).toBe("tool_use");
    });

    it("should handle error type", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ type: "error", content: "Something went wrong" }));
      
      const results = await memory.retrieve("wrong");
      expect(results[0].type).toBe("error");
    });

    it("should handle completion type", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ type: "completion", content: "Task finished" }));
      
      const results = await memory.retrieve("finished");
      expect(results[0].type).toBe("completion");
    });

    it("should handle tool_result type", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ type: "tool_result", content: "Tool output" }));
      
      const results = await memory.retrieve("output");
      expect(results[0].type).toBe("tool_result");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty content", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ content: "" }));
      
      const results = await memory.retrieve("");
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle special characters in content", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      const specialContent = "Special chars: \n\t\r\"'{}[]<>";
      
      await memory.record(createMockEvent({ content: specialContent }));
      
      const results = await memory.retrieve("Special");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle concurrent recordings", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      const promises = Array(10).fill(null).map((_, i) => 
        memory.record(createMockEvent({ content: `Concurrent message ${i}` }))
      );
      
      await Promise.all(promises);
      
      const results = await memory.retrieve("Concurrent");
      expect(results.length).toBe(10);
    });

    it("should handle large content", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      const largeContent = "x".repeat(10000);
      
      await memory.record(createMockEvent({ content: largeContent }));
      
      const results = await memory.retrieve("x");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle malformed JSON gracefully", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ content: "Valid message" }));
      
      await writeFile(join(testDir, "test-session.jsonl"), "invalid json\n");
      
      const results = await memory.retrieve("Valid");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle metadata in events", async () => {
      const { FileEpisodicMemory } = await import("../../backend/memory/episodic-memory.js");
      
      const memory = new FileEpisodicMemory(testDir);
      
      await memory.record(createMockEvent({ 
        content: "Event with metadata",
        metadata: { key: "value", count: 42 }
      }));
      
      const results = await memory.retrieve("metadata");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata).toBeDefined();
    });
  });
});
