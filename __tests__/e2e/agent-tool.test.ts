import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Agent Tool Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Agent Tool Initialization", () => {
    it("should have tool registry initialized", () => {
      expect(services.toolRegistry).toBeDefined();
    });

    it("should have sub-agent cache initialized", () => {
      expect(services.subAgentCache).toBeDefined();
    });

    it("should have recursion guard initialized", () => {
      expect(services.recursionGuard).toBeDefined();
    });
  });

  describe("Agent Tool Types", () => {
    it("should have createAgentTool function", async () => {
      const { createAgentTool } = await import("../../backend/tools/agent-tool.js");
      expect(typeof createAgentTool).toBe("function");
    });

    it("should have AgentToolConfig type", async () => {
      const types = await import("../../backend/tools/agent-tool.js");
      expect(types.AgentToolConfig).toBeDefined();
    });
  });

  describe("Agent Tool Creation", () => {
    it("should create agent tool with full config", async () => {
      const { createAgentTool } = await import("../../backend/tools/agent-tool.js");
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      const guard = new DefaultRecursionGuard(3);
      const tool = createAgentTool({
        maxDepth: 3,
        cache,
        guard,
        executeSubAgent: async (task: string, context: Record<string, unknown>) => {
          return { task, context, result: "success" };
        },
      });
      expect(tool).toBeDefined();
      expect(tool.name).toBeDefined();
    });

    it("should create agent tool with different depths", async () => {
      const { createAgentTool } = await import("../../backend/tools/agent-tool.js");
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      for (const depth of [1, 3, 5, 10]) {
        const cache = new DefaultSubAgentCache();
        const guard = new DefaultRecursionGuard(depth);
        const tool = createAgentTool({
          maxDepth: depth,
          cache,
          guard,
          executeSubAgent: async () => "result",
        });
        expect(tool).toBeDefined();
      }
    });
  });

  describe("Agent Tool Registration", () => {
    it("should register agent tool to registry", async () => {
      const { createAgentTool } = await import("../../backend/tools/agent-tool.js");
      const { DefaultSubAgentCache } = await import("../../backend/agent/cache/cache.js");
      const { DefaultRecursionGuard } = await import("../../backend/agent/cache/cache.js");
      const cache = new DefaultSubAgentCache();
      const guard = new DefaultRecursionGuard(3);
      const tool = createAgentTool({
        maxDepth: 3,
        cache,
        guard,
        executeSubAgent: async () => "registered",
      });
      services.toolRegistry.register(tool);
      const registered = services.toolRegistry.get(tool.name);
      expect(registered).toBeDefined();
    });
  });

  describe("Task Agent Tools", () => {
    it("should have getTaskAgentTools function", async () => {
      const { getTaskAgentTools } = await import("../../backend/agent/index.js");
      expect(typeof getTaskAgentTools).toBe("function");
    });

    it("should return array of tools", async () => {
      const { getTaskAgentTools } = await import("../../backend/agent/index.js");
      const tools = getTaskAgentTools({
        apiKey: "test-key",
        model: "test-model",
        provider: "anthropic",
        maxTokens: 1000,
        maxTurns: 10,
        tokenBudget: 10000,
        compactionThreshold: 8000,
        maxCompactionFailures: 3,
        permissionMode: "askUser",
      });
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe("Task Agent Registry", () => {
    it("should have TaskAgentRegistry class", async () => {
      const { TaskAgentRegistry } = await import("../../backend/agent/index.js");
      expect(TaskAgentRegistry).toBeDefined();
    });

    it("should be singleton", async () => {
      const { TaskAgentRegistry } = await import("../../backend/agent/index.js");
      const instance1 = TaskAgentRegistry.getInstance();
      const instance2 = TaskAgentRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should have register method", () => {
      expect(typeof services.taskAgentRegistry.register).toBe("function");
    });

    it("should have get method", () => {
      expect(typeof services.taskAgentRegistry.get).toBe("function");
    });

    it("should have list method", () => {
      expect(typeof services.taskAgentRegistry.list).toBe("function");
    });
  });

  describe("Create Task Agent", () => {
    it("should have createTaskAgent function", async () => {
      const { createTaskAgent } = await import("../../backend/agent/index.js");
      expect(typeof createTaskAgent).toBe("function");
    });
  });
});
