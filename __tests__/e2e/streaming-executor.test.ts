import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ToolDefinition, ToolContext } from "../../backend/types/index.js";

const createMockTool = (overrides: Partial<ToolDefinition> = {}): ToolDefinition => ({
  name: "test",
  description: "Test tool",
  inputSchema: { type: "object" },
  isConcurrencySafe: true,
  isReadOnly: true,
  handler: vi.fn().mockResolvedValue({ success: true }),
  ...overrides,
});

const createMockToolContext = (): ToolContext => ({
  cwd: "/tmp",
  config: {} as any,
  signal: new AbortController().signal,
});

describe("E2E: Streaming Tool Executor Flow", () => {
  describe("StreamingToolExecutor", () => {
    it("should create executor with tool registry", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const registry = new Map<string, ToolDefinition>();
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      expect(executor).toBeDefined();
    });

    it("should add tool to queue", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool();
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      
      expect(executor.getQueuedCount()).toBe(1);
    });

    it("should track multiple tools", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool();
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      executor.addTool("id-2", "test", {});
      executor.addTool("id-3", "test", {});
      
      expect(executor.getQueuedCount()).toBe(3);
    });

    it("should handle unknown tool", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const registry = new Map<string, ToolDefinition>();
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "unknown", {});
      
      const tracked = executor.getTool("id-1");
      expect(tracked?.status).toBe("error");
    });

    it("should execute single tool", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue({ result: "success" })
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].data).toEqual({ result: "success" });
    });

    it("should execute multiple concurrent-safe tools", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        isConcurrencySafe: true,
        handler: vi.fn().mockImplementation(async () => {
          await new Promise(r => setTimeout(r, 10));
          return { done: true };
        })
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      executor.addTool("id-2", "test", {});
      executor.addTool("id-3", "test", {});
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it("should handle tool errors", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        handler: vi.fn().mockRejectedValue(new Error("Tool failed"))
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("Tool failed");
    });

    it("should discard pending tools", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        handler: vi.fn().mockImplementation(async () => {
          await new Promise(r => setTimeout(r, 100));
          return { done: true };
        })
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      executor.addTool("id-2", "test", {});
      
      executor.discard();
      
      expect(executor.getQueuedCount()).toBe(0);
    });

    it("should track executing count", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      let resolveHandler: () => void;
      const tool = createMockTool({
        handler: vi.fn().mockImplementation(async () => {
          await new Promise<void>(r => { resolveHandler = r; });
          return { done: true };
        })
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      
      const executePromise = (async () => {
        const results = [];
        for await (const result of executor.execute()) {
          results.push(result);
        }
        return results;
      })();
      
      await new Promise(r => setTimeout(r, 10));
      
      expect(executor.getExecutingCount()).toBe(1);
      
      resolveHandler!();
      await executePromise;
      
      expect(executor.getExecutingCount()).toBe(0);
    });
  });

  describe("partitionToolCalls", () => {
    it("should partition tools by concurrency safety", async () => {
      const { partitionToolCalls } = await import("../../backend/tools/streaming-executor.js");
      
      const tools = [
        { toolUseId: "1", name: "safe1", input: {}, isConcurrencySafe: true },
        { toolUseId: "2", name: "safe2", input: {}, isConcurrencySafe: true },
        { toolUseId: "3", name: "unsafe", input: {}, isConcurrencySafe: false },
        { toolUseId: "4", name: "safe3", input: {}, isConcurrencySafe: true },
      ];
      
      const batches = partitionToolCalls(tools);
      
      expect(batches.length).toBeGreaterThan(1);
    });

    it("should handle all safe tools", async () => {
      const { partitionToolCalls } = await import("../../backend/tools/streaming-executor.js");
      
      const tools = [
        { toolUseId: "1", name: "safe1", input: {}, isConcurrencySafe: true },
        { toolUseId: "2", name: "safe2", input: {}, isConcurrencySafe: true },
      ];
      
      const batches = partitionToolCalls(tools);
      
      expect(batches.every(b => b.isConcurrencySafe)).toBe(true);
    });

    it("should handle all unsafe tools", async () => {
      const { partitionToolCalls } = await import("../../backend/tools/streaming-executor.js");
      
      const tools = [
        { toolUseId: "1", name: "unsafe1", input: {}, isConcurrencySafe: false },
        { toolUseId: "2", name: "unsafe2", input: {}, isConcurrencySafe: false },
      ];
      
      const batches = partitionToolCalls(tools);
      
      expect(batches.every(b => !b.isConcurrencySafe)).toBe(true);
    });
  });

  describe("runToolsConcurrently", () => {
    it("should run tools concurrently", async () => {
      const { runToolsConcurrently } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        isConcurrencySafe: true,
        handler: vi.fn().mockResolvedValue({ ok: true })
      });
      const registry = new Map([["test", tool]]);
      
      const tools = [
        { toolUseId: "1", name: "test", input: {} },
        { toolUseId: "2", name: "test", input: {} },
      ];
      
      const results = [];
      for await (const result of runToolsConcurrently(tools, { get: (name) => registry.get(name) }, createMockToolContext())) {
        results.push(result);
      }
      
      expect(results.length).toBe(2);
    });
  });

  describe("runToolsSerially", () => {
    it("should run tools serially", async () => {
      const { runToolsSerially } = await import("../../backend/tools/streaming-executor.js");
      
      const executionOrder: string[] = [];
      const tool = createMockTool({
        handler: vi.fn().mockImplementation(async (_, ctx) => {
          executionOrder.push(ctx.toolUseId as string);
          return { ok: true };
        })
      });
      const registry = new Map([["test", tool]]);
      
      const tools = [
        { toolUseId: "1", name: "test", input: {} },
        { toolUseId: "2", name: "test", input: {} },
        { toolUseId: "3", name: "test", input: {} },
      ];
      
      const results = [];
      for await (const result of runToolsSerially(tools, { get: (name) => registry.get(name) }, createMockToolContext())) {
        results.push(result);
      }
      
      expect(results.length).toBe(3);
    });

    it("should stop on abort signal", async () => {
      const { runToolsSerially } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue({ ok: true })
      });
      const registry = new Map([["test", tool]]);
      
      const controller = new AbortController();
      controller.abort();
      
      const ctx = { ...createMockToolContext(), signal: controller.signal };
      
      const tools = [
        { toolUseId: "1", name: "test", input: {} },
        { toolUseId: "2", name: "test", input: {} },
      ];
      
      const results = [];
      for await (const result of runToolsSerially(tools, { get: (name) => registry.get(name) }, ctx)) {
        results.push(result);
      }
      
      expect(results.length).toBe(0);
    });
  });

  describe("runTools", () => {
    it("should run mixed tools appropriately", async () => {
      const { runTools } = await import("../../backend/tools/streaming-executor.js");
      
      const safeTool = createMockTool({
        name: "safe",
        isConcurrencySafe: true,
        handler: vi.fn().mockResolvedValue({ safe: true })
      });
      const unsafeTool = createMockTool({
        name: "unsafe",
        isConcurrencySafe: false,
        handler: vi.fn().mockResolvedValue({ unsafe: true })
      });
      
      const registry = new Map([
        ["safe", safeTool],
        ["unsafe", unsafeTool]
      ]);
      
      const tools = [
        { toolUseId: "1", name: "safe", input: {}, isConcurrencySafe: true },
        { toolUseId: "2", name: "unsafe", input: {}, isConcurrencySafe: false },
        { toolUseId: "3", name: "safe", input: {}, isConcurrencySafe: true },
      ];
      
      const results = [];
      for await (const result of runTools(tools, { get: (name) => registry.get(name) }, createMockToolContext())) {
        results.push(result);
      }
      
      expect(results.length).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty tool list", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const registry = new Map<string, ToolDefinition>();
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results.length).toBe(0);
    });

    it("should handle tool with no handler", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = { ...createMockTool(), handler: undefined as any };
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results[0].success).toBe(false);
    });

    it("should handle input validation failure", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        inputSchema: {
          type: "object",
          properties: { count: { type: "number" } },
          required: ["count"]
        }
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", { wrong: "input" });
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("validation");
    });

    it("should handle output validation failure", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");
      
      const tool = createMockTool({
        outputSchema: {
          type: "object",
          properties: { status: { type: "string" } },
          required: ["status"]
        },
        handler: vi.fn().mockResolvedValue({ wrong: "output" })
      });
      const registry = new Map([["test", tool]]);
      const executor = new StreamingToolExecutor({ get: (name) => registry.get(name) });
      
      executor.addTool("id-1", "test", {});
      
      const results = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }
      
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("validation");
    });
  });
});
