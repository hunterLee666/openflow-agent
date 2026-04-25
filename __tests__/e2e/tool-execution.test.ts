import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";
import { invokeTool, formatToolError } from "../../backend/tools/invoke.js";
import type { ToolDefinition, ToolContext } from "../../backend/types/index.js";

describe("E2E: Tool Execution Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Tool Registry", () => {
    it("should list all registered tools", () => {
      const tools = services.toolRegistry.list();
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("write_file");
      expect(toolNames).toContain("bash");
    });

    it("should find tool by name", () => {
      const readTool = services.toolRegistry.get("read_file");
      expect(readTool).toBeDefined();
      expect(readTool?.name).toBe("read_file");
    });

    it("should return undefined for non-existent tool", () => {
      const tool = services.toolRegistry.get("non_existent_tool");
      expect(tool).toBeUndefined();
    });
  });

  describe("Tool Registration", () => {
    it("should register a new tool", () => {
      const testTool: ToolDefinition = {
        name: "test_tool_e2e",
        description: "A test tool for E2E testing",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        },
        isConcurrencySafe: true,
        isReadOnly: true,
        handler: async (input: unknown) => {
          return { echo: (input as { message: string }).message };
        },
      };

      services.toolRegistry.register(testTool);
      
      const retrieved = services.toolRegistry.get("test_tool_e2e");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("test_tool_e2e");
    });

    it("should overwrite existing tool with same name", () => {
      const tool1: ToolDefinition = {
        name: "overwrite_test",
        description: "Version 1",
        inputSchema: { type: "object", properties: {} },
        isConcurrencySafe: true,
        isReadOnly: true,
        handler: async () => ({ version: 1 }),
      };

      const tool2: ToolDefinition = {
        name: "overwrite_test",
        description: "Version 2",
        inputSchema: { type: "object", properties: {} },
        isConcurrencySafe: true,
        isReadOnly: true,
        handler: async () => ({ version: 2 }),
      };

      services.toolRegistry.register(tool1);
      services.toolRegistry.register(tool2);

      const retrieved = services.toolRegistry.get("overwrite_test");
      expect(retrieved?.description).toBe("Version 2");
    });
  });

  describe("Tool Invocation", () => {
    it("should invoke read_file tool with valid input", async () => {
      const tool = services.toolRegistry.get("read_file");
      if (!tool) {
        expect.unreachable("read_file tool not found");
        return;
      }

      const ctx: ToolContext = {
        cwd: process.cwd(),
        signal: new AbortController().signal,
        config: {
          apiKey: "",
          model: "claude-3-5-sonnet-20241022",
          provider: "anthropic",
          maxTokens: 8192,
          maxTurns: 100,
          tokenBudget: 100000,
          compactionThreshold: 80000,
          maxCompactionFailures: 3,
          permissionMode: "askUser",
        },
      };

      const result = await invokeTool(
        tool,
        { path: "package.json" },
        ctx
      );

      expect(result).toBeDefined();
      expect(result.type).toBe("ok");
    });

    it("should return error for non-existent file", async () => {
      const tool = services.toolRegistry.get("read_file");
      if (!tool) {
        expect.unreachable("read_file tool not found");
        return;
      }

      const ctx: ToolContext = {
        cwd: process.cwd(),
        signal: new AbortController().signal,
        config: {
          apiKey: "",
          model: "claude-3-5-sonnet-20241022",
          provider: "anthropic",
          maxTokens: 8192,
          maxTurns: 100,
          tokenBudget: 100000,
          compactionThreshold: 80000,
          maxCompactionFailures: 3,
          permissionMode: "askUser",
        },
      };

      const result = await invokeTool(
        tool,
        { path: "/non/existent/file.txt" },
        ctx
      );

      expect(result.type).toBe("error");
    });

    it("should invoke bash tool with valid command", async () => {
      const tool = services.toolRegistry.get("bash");
      if (!tool) {
        expect.unreachable("bash tool not found");
        return;
      }

      const ctx: ToolContext = {
        cwd: process.cwd(),
        signal: new AbortController().signal,
        config: {
          apiKey: "",
          model: "claude-3-5-sonnet-20241022",
          provider: "anthropic",
          maxTokens: 8192,
          maxTurns: 100,
          tokenBudget: 100000,
          compactionThreshold: 80000,
          maxCompactionFailures: 3,
          permissionMode: "askUser",
        },
      };

      const result = await invokeTool(
        tool,
        { command: "echo 'Hello E2E Test'" },
        ctx
      );

      expect(result).toBeDefined();
      expect(result.type).toBe("ok");
    });

    it("should handle bash tool with non-zero exit code", async () => {
      const tool = services.toolRegistry.get("bash");
      if (!tool) {
        expect.unreachable("bash tool not found");
        return;
      }

      const ctx: ToolContext = {
        cwd: process.cwd(),
        signal: new AbortController().signal,
        config: {
          apiKey: "",
          model: "claude-3-5-sonnet-20241022",
          provider: "anthropic",
          maxTokens: 8192,
          maxTurns: 100,
          tokenBudget: 100000,
          compactionThreshold: 80000,
          maxCompactionFailures: 3,
          permissionMode: "askUser",
        },
      };

      const result = await invokeTool(
        tool,
        { command: "ls /non/existent/directory" },
        ctx
      );

      expect(result.type).toBe("ok");
      expect(result.data).toBeDefined();
    });
  });

  describe("Enhanced Tool Registry", () => {
    it("should have enhanced tool registry initialized", () => {
      expect(services.enhancedToolRegistry).toBeDefined();
    });
  });

  describe("Streaming Tool Executor", () => {
    it("should have streaming executor initialized", () => {
      expect(services.streamingToolExecutor).toBeDefined();
    });
  });

  describe("Tool Error Formatting", () => {
    it("should format tool error correctly", () => {
      const result = {
        type: "error" as const,
        error: {
          message: "Test error message",
        },
      };
      const formatted = formatToolError(result);
      
      expect(formatted).toContain("error");
      expect(formatted).toContain("Test error message");
    });
  });

  describe("Tool Permission Integration", () => {
    it("should have workspace validator available", () => {
      expect(services.workspaceValidator).toBeDefined();
    });

    it("should have permission pipeline available", () => {
      expect(services.permissionPipeline).toBeDefined();
    });
  });

  describe("Tool with Hooks", () => {
    it("should have hook registry available for tool hooks", () => {
      expect(services.hookRegistry).toBeDefined();
    });

    it("should dispatch PreToolUse hook events", async () => {
      let hookCalled = false;
      
      services.hookRegistry.register("PreToolUse", async () => {
        hookCalled = true;
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("PreToolUse", {
        tool: "read_file",
        input: { path: "package.json" },
      });

      expect(hookCalled).toBe(true);
    });
  });
});
