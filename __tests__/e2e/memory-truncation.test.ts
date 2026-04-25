import { describe, it, expect, beforeAll } from "vitest";
import { initializeSystemServices, type SystemServices } from "./test-helpers.js";

describe("E2E: Memory Truncation Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Memory Truncator Types", () => {
    it("should have MemoryTruncator class", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      expect(MemoryTruncator).toBeDefined();
    });

    it("should have TruncationResult interface", async () => {
      const types = await import("../../backend/memory/memory-truncator.js");
      expect(types.TruncationResult).toBeDefined();
    });

    it("should have MemoryLimits interface", async () => {
      const types = await import("../../backend/memory/memory-truncator.js");
      expect(types.MemoryLimits).toBeDefined();
    });
  });

  describe("Memory Truncator Methods", () => {
    it("should have truncateEntrypoint method", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      expect(typeof truncator.truncateEntrypoint).toBe("function");
    });
  });

  describe("Entrypoint Truncation", () => {
    it("should not truncate short content", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("Short content");
      expect(result.wasLineTruncated).toBe(false);
      expect(result.wasByteTruncated).toBe(false);
    });

    it("should truncate content exceeding line limit", async () => {
      const { MemoryTruncator, DEFAULT_MEMORY_LIMITS } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxEntryPointLines: 10 });
      const longContent = Array(20).fill("Line of content").join("\n");
      const result = truncator.truncateEntrypoint(longContent);
      expect(result.wasLineTruncated).toBe(true);
    });

    it("should truncate content exceeding byte limit", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxEntryPointBytes: 100 });
      const longContent = "x".repeat(200);
      const result = truncator.truncateEntrypoint(longContent);
      expect(result.wasByteTruncated).toBe(true);
    });

    it("should preserve content within limits", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({
        maxEntryPointLines: 100,
        maxEntryPointBytes: 10000,
      });
      const content = "Normal content\nMultiple lines\nEnd";
      const result = truncator.truncateEntrypoint(content);
      expect(result.content).toContain("Normal content");
    });
  });

  describe("Truncation Result Structure", () => {
    it("should return content in result", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("Test");
      expect(result.content).toBeDefined();
    });

    it("should return lineCount in result", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("Test\nLine 2\nLine 3");
      expect(result.lineCount).toBe(3);
    });

    it("should return byteCount in result", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("Test content");
      expect(result.byteCount).toBe(12);
    });

    it("should return truncationWarnings in result", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxEntryPointLines: 5 });
      const longContent = Array(10).fill("Line").join("\n");
      const result = truncator.truncateEntrypoint(longContent);
      expect(result.truncationWarnings.length).toBeGreaterThan(0);
    });
  });

  describe("Memory Limits Configuration", () => {
    it("should have default limits", async () => {
      const { DEFAULT_MEMORY_LIMITS } = await import("../../backend/memory/memory-truncator.js");
      expect(DEFAULT_MEMORY_LIMITS.maxEntryPointLines).toBeDefined();
      expect(DEFAULT_MEMORY_LIMITS.maxEntryPointBytes).toBeDefined();
      expect(DEFAULT_MEMORY_LIMITS.maxWorkingMemoryBytes).toBeDefined();
      expect(DEFAULT_MEMORY_LIMITS.maxEpisodicMemoryItems).toBeDefined();
      expect(DEFAULT_MEMORY_LIMITS.maxSemanticMemoryItems).toBeDefined();
      expect(DEFAULT_MEMORY_LIMITS.retentionDays).toBeDefined();
    });

    it("should accept custom maxEntryPointLines", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxEntryPointLines: 50 });
      expect(truncator).toBeDefined();
    });

    it("should accept custom maxEntryPointBytes", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxEntryPointBytes: 5000 });
      expect(truncator).toBeDefined();
    });

    it("should accept custom maxWorkingMemoryBytes", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxWorkingMemoryBytes: 1024 * 1024 });
      expect(truncator).toBeDefined();
    });

    it("should accept custom retentionDays", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ retentionDays: 60 });
      expect(truncator).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty content", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("");
      expect(result.lineCount).toBe(0);
      expect(result.byteCount).toBe(0);
    });

    it("should handle whitespace-only content", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("   \n\n   ");
      expect(result.content.trim()).toBe("");
    });

    it("should handle content with only newlines", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator();
      const result = truncator.truncateEntrypoint("\n\n\n\n");
      expect(result.lineCount).toBe(0);
    });

    it("should handle very long single line", async () => {
      const { MemoryTruncator } = await import("../../backend/memory/memory-truncator.js");
      const truncator = new MemoryTruncator({ maxEntryPointBytes: 100 });
      const longLine = "x".repeat(1000);
      const result = truncator.truncateEntrypoint(longLine);
      expect(result.wasByteTruncated).toBe(true);
    });
  });
});
