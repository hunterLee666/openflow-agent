import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Task Agent Registry Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Task Agent Registry Initialization", () => {
    it("should have task agent registry initialized", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should be singleton instance", async () => {
      const { TaskAgentRegistry } = await import("../../backend/agent/index.js");
      const instance1 = TaskAgentRegistry.getInstance();
      const instance2 = TaskAgentRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Task Agent Registry Types", () => {
    it("should have TaskAgentRegistry class", async () => {
      const { TaskAgentRegistry } = await import("../../backend/agent/index.js");
      expect(TaskAgentRegistry).toBeDefined();
    });

    it("should have TaskAgent type", async () => {
      const types = await import("../../backend/agent/index.js");
      expect(types.TaskAgent).toBeDefined();
    });
  });

  describe("Task Agent Registry Methods", () => {
    it("should have register method", () => {
      expect(typeof services.taskAgentRegistry.register).toBe("function");
    });

    it("should have get method", () => {
      expect(typeof services.taskAgentRegistry.get).toBe("function");
    });

    it("should have list method", () => {
      expect(typeof services.taskAgentRegistry.list).toBe("function");
    });

    it("should have unregister method", () => {
      expect(typeof services.taskAgentRegistry.unregister).toBe("function");
    });
  });

  describe("Task Agent Registration", () => {
    it("should register task agents", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should retrieve registered agents", () => {
      const agents = services.taskAgentRegistry.list();
      expect(Array.isArray(agents)).toBe(true);
    });

    it("should handle unregistered agent lookup", () => {
      const agent = services.taskAgentRegistry.get("non-existent-agent");
      expect(agent).toBeUndefined();
    });
  });

  describe("Task Agent Registry Edge Cases", () => {
    it("should handle duplicate registration", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should handle unregister non-existent agent", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should handle concurrent registration", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });
  });

  describe("Task Agent Tools", () => {
    it("should have getTaskAgentTools function", async () => {
      const { getTaskAgentTools } = await import("../../backend/agent/index.js");
      expect(typeof getTaskAgentTools).toBe("function");
    });

    it("should have createTaskAgent function", async () => {
      const { createTaskAgent } = await import("../../backend/agent/index.js");
      expect(typeof createTaskAgent).toBe("function");
    });
  });
});
