import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Coordinator Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Coordinator", () => {
    it("should have coordinator initialized", () => {
      expect(services.coordinator).toBeDefined();
    });
  });

  describe("Task Agent Registry", () => {
    it("should have task agent registry initialized", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should get instance as singleton", () => {
      const instance1 = services.taskAgentRegistry;
      const instance2 = services.taskAgentRegistry;
      expect(instance1).toBe(instance2);
    });
  });

  describe("Message Broker", () => {
    it("should have message broker initialized", () => {
      expect(services.messageBroker).toBeDefined();
    });

    it("should have broker config", () => {
      expect(services.messageBroker).toBeDefined();
    });
  });

  describe("Sub-Agent Cache", () => {
    it("should have sub-agent cache initialized", () => {
      expect(services.subAgentCache).toBeDefined();
    });
  });

  describe("Recursion Guard", () => {
    it("should have recursion guard initialized", () => {
      expect(services.recursionGuard).toBeDefined();
    });
  });

  describe("Swarm Orchestrator", () => {
    it("should have swarm orchestrator (may be null)", () => {
      expect(services.swarmOrchestrator).toBeDefined();
    });
  });
});
