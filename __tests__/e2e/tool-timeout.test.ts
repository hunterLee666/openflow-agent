import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Tool Execution Timeout E2E Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("StreamingToolExecutor - Initialization", () => {
    it("should create executor with tool registry", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const toolRegistry = {
        get: vi.fn(),
      };

      const executor = new StreamingToolExecutor(toolRegistry);

      expect(executor).toBeDefined();
    });

    it("should add tool to executor", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler: vi.fn().mockResolvedValue({ result: "done" }),
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", { param: "value" });

      expect(executor).toBeDefined();
    });

    it("should add multiple tools", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler: vi.fn().mockResolvedValue({ result: "done" }),
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", {});
      executor.addTool("tool-2", "test_tool", {});
      executor.addTool("tool-3", "test_tool", {});

      expect(executor).toBeDefined();
    });
  });

  describe("StreamingToolExecutor - Execution", () => {
    it("should execute tool and return result", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockResolvedValue({ result: "success" });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", { param: "value" });

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].result).toEqual({ result: "success" });
    });

    it("should handle tool execution error", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockRejectedValue(new Error("Tool failed"));

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "failing_tool",
          description: "A failing tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "failing_tool", {});

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("Tool failed");
    });

    it("should handle missing tool", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const toolRegistry = {
        get: vi.fn().mockReturnValue(null),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "missing_tool", {});

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
    });

    it("should execute multiple tools sequentially", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockResolvedValue({ result: "done" });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: false,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", {});
      executor.addTool("tool-2", "test_tool", {});

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("StreamingToolExecutor - Abort Handling", () => {
    it("should create executor with abort signal", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const controller = new AbortController();

      const toolRegistry = {
        get: vi.fn(),
      };

      const executor = new StreamingToolExecutor(toolRegistry, controller.signal);

      expect(executor).toBeDefined();
    });

    it("should abort execution when signal is aborted", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const controller = new AbortController();

      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { result: "done" };
      });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry, controller.signal);
      executor.addTool("tool-1", "test_tool", {});

      controller.abort();

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
    });
  });

  describe("StreamingToolExecutor - Concurrency", () => {
    it("should execute concurrency-safe tools in parallel", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const executionOrder: string[] = [];

      const handler = vi.fn().mockImplementation(async () => {
        executionOrder.push("start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push("end");
        return { result: "done" };
      });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", {});
      executor.addTool("tool-2", "test_tool", {});

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(2);
    });

    it("should execute non-concurrency-safe tools sequentially", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockResolvedValue({ result: "done" });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: false,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", {});
      executor.addTool("tool-2", "test_tool", {});

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(2);
    });
  });

  describe("StreamingToolExecutor - Edge Cases", () => {
    it("should handle empty tool queue", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const toolRegistry = {
        get: vi.fn(),
      };

      const executor = new StreamingToolExecutor(toolRegistry);

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(0);
    });

    it("should handle tool with no input", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockResolvedValue({ result: "done" });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool");

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
    });

    it("should handle tool with complex input", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockResolvedValue({ result: "done" });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);
      executor.addTool("tool-1", "test_tool", {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        string: "test",
      });

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          nested: { deep: { value: 123 } },
        })
      );
    });

    it("should handle many tools", async () => {
      const { StreamingToolExecutor } = await import("../../backend/tools/streaming-executor.js");

      const handler = vi.fn().mockResolvedValue({ result: "done" });

      const toolRegistry = {
        get: vi.fn().mockReturnValue({
          name: "test_tool",
          description: "A test tool",
          inputSchema: {},
          handler,
          isConcurrencySafe: true,
        }),
      };

      const executor = new StreamingToolExecutor(toolRegistry);

      for (let i = 0; i < 100; i++) {
        executor.addTool(`tool-${i}`, "test_tool", { index: i });
      }

      const results: any[] = [];
      for await (const result of executor.execute()) {
        results.push(result);
      }

      expect(results.length).toBe(100);
    });
  });
});
