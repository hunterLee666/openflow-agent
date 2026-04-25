import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Session Management Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Session Store", () => {
    it("should have session store initialized", () => {
      expect(services.sessionStore).toBeDefined();
    });

    it("should create a new thread", async () => {
      const threadId = await services.sessionStore.createThread();
      expect(threadId).toBeDefined();
      expect(typeof threadId).toBe("string");
    });

    it("should save and load messages", async () => {
      const threadId = await services.sessionStore.createThread();
      
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there!" },
      ];

      await services.sessionStore.saveMessages(threadId, messages);
      
      const loaded = await services.sessionStore.loadMessages(threadId);
      expect(loaded).toBeDefined();
      expect(loaded.length).toBe(2);
    });
  });

  describe("Session Lifecycle Manager", () => {
    it("should have session lifecycle manager initialized", () => {
      expect(services.sessionLifecycleManager).toBeDefined();
    });
  });
});
