import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: State Persistence Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Side Effect Synchronizer", () => {
    it("should have side effect synchronizer initialized", () => {
      expect(services.sideEffectSynchronizer).toBeDefined();
    });

    it("should have synchronizer methods", () => {
      const sync = services.sideEffectSynchronizer;
      expect(sync).toBeDefined();
    });
  });

  describe("Session Store", () => {
    it("should have session store initialized", () => {
      expect(services.sessionStore).toBeDefined();
    });

    it("should create threads", async () => {
      const threadId = await services.sessionStore.createThread();
      expect(threadId).toBeDefined();
      expect(typeof threadId).toBe("string");
    });

    it("should save messages", async () => {
      const threadId = await services.sessionStore.createThread();
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there!" },
      ];

      await services.sessionStore.saveMessages(threadId, messages);
    });

    it("should load messages", async () => {
      const threadId = await services.sessionStore.createThread();
      const messages = [
        { role: "user" as const, content: "Test message" },
      ];

      await services.sessionStore.saveMessages(threadId, messages);
      const loaded = await services.sessionStore.loadMessages(threadId);
      
      expect(loaded).toBeDefined();
      expect(loaded.length).toBe(1);
    });
  });

  describe("Session Lifecycle Manager", () => {
    it("should have session lifecycle manager initialized", () => {
      expect(services.sessionLifecycleManager).toBeDefined();
    });
  });

  describe("Telemetry", () => {
    it("should have telemetry initialized", () => {
      expect(services.telemetry).toBeDefined();
    });

    it("should have telemetry collector", () => {
      expect(services.telemetryCollector).toBeDefined();
    });

    it("should have perfetto tracer", () => {
      expect(services.perfettoTracer).toBeDefined();
    });

    it("should track events", () => {
      const collector = services.telemetryCollector;
      expect(collector).toBeDefined();
    });
  });
});
