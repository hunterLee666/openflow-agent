import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Recursion Protection Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Recursion Guard Initialization", () => {
    it("should have recursion guard initialized", () => {
      expect(services.recursionGuard).toBeDefined();
    });

    it("should have sub-agent cache initialized", () => {
      expect(services.subAgentCache).toBeDefined();
    });
  });

  describe("Recursion Guard Types", () => {
    it("should have DefaultRecursionGuard class", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      expect(DefaultRecursionGuard).toBeDefined();
    });

    it("should have DefaultSubAgentCache class", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      expect(DefaultSubAgentCache).toBeDefined();
    });

    it("should have buildForkKey function", async () => {
      const { buildForkKey } = await import("../../backend/agent/cache/cache.js");
      expect(typeof buildForkKey).toBe("function");
    });
  });

  describe("Recursion Guard Methods", () => {
    it("should have check method", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      expect(typeof guard.check).toBe("function");
    });

    it("should have enter method", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      expect(typeof guard.enter).toBe("function");
    });

    it("should have exit method", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      expect(typeof guard.exit).toBe("function");
    });

    it("should have getCurrentDepth method", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      expect(typeof guard.getCurrentDepth).toBe("function");
    });
  });

  describe("Recursion Guard Behavior", () => {
    it("should start at depth 0", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      expect(guard.getCurrentDepth()).toBe(0);
    });

    it("should increment depth on enter", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      guard.enter();
      expect(guard.getCurrentDepth()).toBe(1);
    });

    it("should decrement depth on exit", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      guard.enter();
      guard.exit();
      expect(guard.getCurrentDepth()).toBe(0);
    });

    it("should not go below 0 on exit", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard();
      guard.exit();
      expect(guard.getCurrentDepth()).toBe(0);
    });

    it("should check depth limit", async () => {
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const guard = new DefaultRecursionGuard(3);
      expect(guard.check(0)).toBe(true);
      expect(guard.check(2)).toBe(true);
      expect(guard.check(3)).toBe(false);
    });
  });

  describe("Sub-Agent Cache Methods", () => {
    it("should have get method", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      expect(typeof cache.get).toBe("function");
    });

    it("should have set method", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      expect(typeof cache.set).toBe("function");
    });

    it("should have invalidate method", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      expect(typeof cache.invalidate).toBe("function");
    });

    it("should have clear method", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      expect(typeof cache.clear).toBe("function");
    });
  });

  describe("Sub-Agent Cache Behavior", () => {
    it("should return undefined for non-existent key", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      const result = cache.get("non-existent");
      expect(result).toBeUndefined();
    });

    it("should set and get cache entry", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      const entry = {
        key: "test-key",
        result: "test result",
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: "",
      };
      cache.set("test-key", entry);
      const result = cache.get("test-key");
      expect(result).toBeDefined();
      expect(result?.result).toBe("test result");
    });

    it("should invalidate entries by prefix", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      cache.set("prefix-1", { key: "prefix-1", result: "a", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.set("prefix-2", { key: "prefix-2", result: "b", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.set("other-1", { key: "other-1", result: "c", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.invalidate("prefix-");
      expect(cache.get("prefix-1")).toBeUndefined();
      expect(cache.get("prefix-2")).toBeUndefined();
      expect(cache.get("other-1")).toBeDefined();
    });

    it("should clear all entries", async () => {
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      cache.set("key-1", { key: "key-1", result: "a", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.set("key-2", { key: "key-2", result: "b", timestamp: Date.now(), ttl: 60000, forkPrefix: "" });
      cache.clear();
      expect(cache.get("key-1")).toBeUndefined();
      expect(cache.get("key-2")).toBeUndefined();
    });
  });

  describe("Fork Key Building", () => {
    it("should build fork key from parent, task and context", async () => {
      const { buildForkKey } = await import("../../backend/agent/cache/cache.js");
      const key = buildForkKey("parent-1", "task-1", { foo: "bar" });
      expect(typeof key).toBe("string");
      expect(key).toContain("parent-1");
      expect(key).toContain("task-1");
    });

    it("should generate different keys for different contexts", async () => {
      const { buildForkKey } = await import("../../backend/agent/cache/cache.js");
      const key1 = buildForkKey("parent", "task", { a: 1 });
      const key2 = buildForkKey("parent", "task", { a: 2 });
      expect(key1).not.toBe(key2);
    });

    it("should generate same key for same inputs", async () => {
      const { buildForkKey } = await import("../../backend/agent/cache/cache.js");
      const context = { foo: "bar", num: 42 };
      const key1 = buildForkKey("parent", "task", context);
      const key2 = buildForkKey("parent", "task", context);
      expect(key1).toBe(key2);
    });
  });
});
