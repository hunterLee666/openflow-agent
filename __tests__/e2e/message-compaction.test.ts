import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Message Compaction Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Compaction Types", () => {
    it("should have compactMessages function", async () => {
      const { compactMessages } = await import("../../backend/services/compact.js");
      expect(typeof compactMessages).toBe("function");
    });

    it("should have shouldCompact function", async () => {
      const { shouldCompact } = await import("../../backend/services/compact.js");
      expect(typeof shouldCompact).toBe("function");
    });

    it("should have estimateTokenCount function", async () => {
      const { estimateTokenCount } = await import("../../backend/services/compact.js");
      expect(typeof estimateTokenCount).toBe("function");
    });

    it("should have groupMessagesByApiRound function", async () => {
      const { groupMessagesByApiRound } = await import("../../backend/services/compact.js");
      expect(typeof groupMessagesByApiRound).toBe("function");
    });

    it("should have stripImagesFromMessages function", async () => {
      const { stripImagesFromMessages } = await import("../../backend/services/compact.js");
      expect(typeof stripImagesFromMessages).toBe("function");
    });
  });

  describe("Token Estimation", () => {
    it("should estimate token count for messages", async () => {
      const { estimateTokenCount } = await import("../../backend/services/compact.js");
      const messages = [
        { role: "user" as const, content: "Hello world" },
        { role: "assistant" as const, content: "Hi there!" },
      ];
      const count = estimateTokenCount(messages);
      expect(count).toBeGreaterThan(0);
    });

    it("should return 0 for empty messages", async () => {
      const { estimateTokenCount } = await import("../../backend/services/compact.js");
      const count = estimateTokenCount([]);
      expect(count).toBe(0);
    });
  });

  describe("Should Compact Decision", () => {
    it("should return true when force is true", async () => {
      const { shouldCompact } = await import("../../backend/services/compact.js");
      const result = shouldCompact([], { force: true });
      expect(result).toBe(true);
    });

    it("should return false for empty messages without force", async () => {
      const { shouldCompact } = await import("../../backend/services/compact.js");
      const result = shouldCompact([]);
      expect(result).toBe(false);
    });

    it("should return true when token count exceeds maxTokens", async () => {
      const { shouldCompact } = await import("../../backend/services/compact.js");
      const longContent = "x".repeat(100000);
      const messages = [
        { role: "user" as const, content: longContent },
      ];
      const result = shouldCompact(messages, { maxTokens: 100 });
      expect(result).toBe(true);
    });
  });

  describe("Message Grouping", () => {
    it("should group messages by API round", async () => {
      const { groupMessagesByApiRound } = await import("../../backend/services/compact.js");
      const messages = [
        { role: "user" as const, content: "Question 1" },
        { role: "assistant" as const, content: "Answer 1" },
        { role: "user" as const, content: "Question 2" },
        { role: "assistant" as const, content: "Answer 2" },
      ];
      const groups = groupMessagesByApiRound(messages);
      expect(groups.length).toBeGreaterThan(0);
    });

    it("should return empty array for empty messages", async () => {
      const { groupMessagesByApiRound } = await import("../../backend/services/compact.js");
      const groups = groupMessagesByApiRound([]);
      expect(groups).toEqual([]);
    });
  });

  describe("Image Stripping", () => {
    it("should strip images from messages", async () => {
      const { stripImagesFromMessages } = await import("../../backend/services/compact.js");
      const messages = [
        { role: "user" as const, content: "Hello" },
      ];
      const stripped = stripImagesFromMessages(messages);
      expect(stripped.length).toBe(1);
    });

    it("should handle string content", async () => {
      const { stripImagesFromMessages } = await import("../../backend/services/compact.js");
      const messages = [
        { role: "user" as const, content: "Just text" },
      ];
      const stripped = stripImagesFromMessages(messages);
      expect(stripped[0].content).toBe("Just text");
    });
  });

  describe("Compact Constants", () => {
    it("should have COMPACT_MAX_OUTPUT_TOKENS constant", async () => {
      const { COMPACT_MAX_OUTPUT_TOKENS } = await import("../../backend/services/compact.js");
      expect(COMPACT_MAX_OUTPUT_TOKENS).toBeDefined();
      expect(COMPACT_MAX_OUTPUT_TOKENS).toBeGreaterThan(0);
    });

    it("should have COMPACT_TOKEN_BUDGET constant", async () => {
      const { COMPACT_TOKEN_BUDGET } = await import("../../backend/services/compact.js");
      expect(COMPACT_TOKEN_BUDGET).toBeDefined();
      expect(COMPACT_TOKEN_BUDGET).toBeGreaterThan(0);
    });

    it("should have COMPACT_MAX_TOKENS_PER_FILE constant", async () => {
      const { COMPACT_MAX_TOKENS_PER_FILE } = await import("../../backend/services/compact.js");
      expect(COMPACT_MAX_TOKENS_PER_FILE).toBeDefined();
      expect(COMPACT_MAX_TOKENS_PER_FILE).toBeGreaterThan(0);
    });
  });
});
