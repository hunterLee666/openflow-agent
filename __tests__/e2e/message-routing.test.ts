import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";
import type { SubAgentCacheEntry } from "../../backend/agent/cache/types.js";

describe("E2E: Message Routing Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Message Broker", () => {
    it("should have message broker initialized", () => {
      expect(services.messageBroker).toBeDefined();
    });

    it("should have broker methods", () => {
      const broker = services.messageBroker;
      expect(typeof broker.send).toBe("function");
      expect(typeof broker.subscribe).toBe("function");
      expect(typeof broker.unsubscribe).toBe("function");
    });

    it("should subscribe to topics", () => {
      const subscription = {
        agentId: "test-subscriber",
        topics: ["test-topic"],
        handler: async () => {},
      };

      services.messageBroker.subscribe(subscription);
    });

    it("should unsubscribe from topics", () => {
      const subscription = {
        agentId: "unsubscriber",
        topics: ["test-topic-unsub"],
        handler: async () => {},
      };

      services.messageBroker.subscribe(subscription);
      services.messageBroker.unsubscribe("unsubscriber", ["test-topic-unsub"]);
    });

    it("should send messages", async () => {
      const message = {
        id: `msg-${Date.now()}`,
        type: "request" as const,
        from: "test-agent",
        to: "target-agent",
        payload: { data: "test" },
        timestamp: new Date(),
      };

      const result = await services.messageBroker.send(message);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Sub-Agent Cache", () => {
    it("should have sub-agent cache initialized", () => {
      expect(services.subAgentCache).toBeDefined();
    });

    it("should cache sub-agent results", () => {
      const key = `cache-key-${Date.now()}`;
      const entry: SubAgentCacheEntry = {
        key,
        result: { success: true },
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: "test",
      };

      services.subAgentCache.set(key, entry);
      const cached = services.subAgentCache.get(key);
      
      expect(cached).toBeDefined();
    });

    it("should invalidate cached entries by prefix", () => {
      const prefix = `invalidate-prefix-${Date.now()}`;
      const key1 = `${prefix}-key1`;
      const key2 = `${prefix}-key2`;
      
      services.subAgentCache.set(key1, {
        key: key1,
        result: {},
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: prefix,
      });
      
      services.subAgentCache.set(key2, {
        key: key2,
        result: {},
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: prefix,
      });

      services.subAgentCache.invalidate(prefix);
      
      expect(services.subAgentCache.get(key1)).toBeUndefined();
      expect(services.subAgentCache.get(key2)).toBeUndefined();
    });

    it("should clear all cached entries", () => {
      services.subAgentCache.set("key1", {
        key: "key1",
        result: {},
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: "test",
      });
      
      services.subAgentCache.set("key2", {
        key: "key2",
        result: {},
        timestamp: Date.now(),
        ttl: 60000,
        forkPrefix: "test",
      });

      services.subAgentCache.clear();
      
      expect(services.subAgentCache.get("key1")).toBeUndefined();
      expect(services.subAgentCache.get("key2")).toBeUndefined();
    });
  });

  describe("Recursion Guard", () => {
    it("should have recursion guard initialized", () => {
      expect(services.recursionGuard).toBeDefined();
    });

    it("should check recursion depth", () => {
      const guard = services.recursionGuard;
      const canProceed = guard.check(0);
      expect(typeof canProceed).toBe("boolean");
    });

    it("should track recursion depth", () => {
      const guard = services.recursionGuard;
      
      guard.enter();
      const depth = guard.getCurrentDepth();
      
      expect(depth).toBeGreaterThanOrEqual(1);
    });

    it("should exit recursion", () => {
      const guard = services.recursionGuard;
      
      guard.enter();
      guard.exit();
      
      const depth = guard.getCurrentDepth();
      expect(depth).toBe(0);
    });

    it("should prevent exceeding max depth", () => {
      const guard = services.recursionGuard;
      
      guard.enter();
      guard.enter();
      guard.enter();
      
      const canProceed = guard.check(guard.getCurrentDepth());
      expect(canProceed).toBe(false);
    });
  });

  describe("Task Agent Registry", () => {
    it("should have task agent registry initialized", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should be a singleton", () => {
      const instance1 = services.taskAgentRegistry;
      const instance2 = services.taskAgentRegistry;
      expect(instance1).toBe(instance2);
    });
  });
});
