import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Cache Invalidation Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Prompt Cache Initialization", () => {
    it("should have prompt cache initialized", () => {
      expect(services.promptCache).toBeDefined();
    });
  });

  describe("Prompt Cache Types", () => {
    it("should have DefaultPromptCache class", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      expect(DefaultPromptCache).toBeDefined();
    });
  });

  describe("Prompt Cache Methods", () => {
    it("should have get method", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      expect(typeof cache.get).toBe("function");
    });

    it("should have set method", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      expect(typeof cache.set).toBe("function");
    });

    it("should have invalidate method", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      expect(typeof cache.invalidate).toBe("function");
    });

    it("should have reset method", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      expect(typeof cache.reset).toBe("function");
    });
  });

  describe("Cache Operations", () => {
    it("should return undefined for non-existent key", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      const result = cache.get("non-existent-key");
      expect(result).toBeUndefined();
    });

    it("should set and get cache entry", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      cache.set("test-key", "test-value");
      const result = cache.get("test-key");
      expect(result).toBe("test-value");
    });

    it("should invalidate cache entry", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      cache.set("invalidate-key", "value");
      cache.invalidate("invalidate-key");
      const result = cache.get("invalidate-key");
      expect(result).toBeUndefined();
    });

    it("should reset all entries", async () => {
      const { DefaultPromptCache } = await import("../../backend/services/cache/prompt-cache.js");
      const cache = new DefaultPromptCache();
      cache.set("key-1", "value-1");
      cache.set("key-2", "value-2");
      cache.reset();
      expect(cache.get("key-1")).toBeUndefined();
      expect(cache.get("key-2")).toBeUndefined();
    });
  });

  describe("Sub-Agent Cache Invalidation", () => {
    it("should have sub-agent cache initialized", () => {
      expect(services.subAgentCache).toBeDefined();
    });

    it("should invalidate by prefix", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      cache.set("prefix-key-1", { key: "prefix-key-1", result: "a", timestamp: Date.now(), ttl: 60000, forkPrefix: "prefix" });
      cache.set("prefix-key-2", { key: "prefix-key-2", result: "b", timestamp: Date.now(), ttl: 60000, forkPrefix: "prefix" });
      cache.set("other-key", { key: "other-key", result: "c", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.invalidate("prefix-");
      expect(cache.get("prefix-key-1")).toBeUndefined();
      expect(cache.get("prefix-key-2")).toBeUndefined();
      expect(cache.get("other-key")).toBeDefined();
    });
  });

  describe("Cache TTL Expiration", () => {
    it("should expire entries after TTL", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      const expiredEntry = {
        key: "expired-key",
        result: "expired",
        timestamp: Date.now() - 120000,
        ttl: 60000,
        forkPrefix: "",
      };
      cache.set("expired-key", expiredEntry);
      const result = cache.get("expired-key");
      expect(result).toBeUndefined();
    });

    it("should not expire entries before TTL", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      const validEntry = {
        key: "valid-key",
        result: "valid",
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: "",
      };
      cache.set("valid-key", validEntry);
      const result = cache.get("valid-key");
      expect(result).toBeDefined();
    });
  });

  describe("Cache Size Limits", () => {
    it("should evict oldest entry when cache is full", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache(3);
      cache.set("key-1", { key: "key-1", result: "a", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.set("key-2", { key: "key-2", result: "b", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.set("key-3", { key: "key-3", result: "c", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.set("key-4", { key: "key-4", result: "d", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      expect(cache.get("key-1")).toBeUndefined();
      expect(cache.get("key-4")).toBeDefined();
    });
  });
});
