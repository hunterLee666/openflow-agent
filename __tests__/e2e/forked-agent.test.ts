import { describe, it, expect, vi } from "vitest";
import type { Message } from "../../backend/types/index.js";

const createMockMessage = (content: string, role: "user" | "assistant" = "user"): Message => ({
  role,
  content,
});

describe("E2E: Forked Agent Flow", () => {
  describe("CacheSafeParams", () => {
    it("should create cache safe params", async () => {
      const { createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const params = createCacheSafeParams(
        "system prompt",
        { key: "value" },
        { context: "data" },
        [{ name: "tool1" }],
        [createMockMessage("context")]
      );
      
      expect(params.systemPrompt).toBe("system prompt");
      expect(params.userContext).toEqual({ key: "value" });
      expect(params.systemContext).toEqual({ context: "data" });
      expect(params.tools).toHaveLength(1);
      expect(params.forkContextMessages).toHaveLength(1);
    });

    it("should include optional model and maxOutputTokens", async () => {
      const { createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const params = createCacheSafeParams(
        "system prompt",
        {},
        {},
        [],
        [],
        { model: "gpt-4", maxOutputTokens: 1000 }
      );
      
      expect(params.model).toBe("gpt-4");
      expect(params.maxOutputTokens).toBe(1000);
    });
  });

  describe("saveCacheSafeParams / getLastCacheSafeParams", () => {
    it("should save and retrieve cache safe params", async () => {
      const { saveCacheSafeParams, getLastCacheSafeParams, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const params = createCacheSafeParams("prompt", {}, {}, [], []);
      
      saveCacheSafeParams(params);
      
      const retrieved = getLastCacheSafeParams();
      
      expect(retrieved).toEqual(params);
    });

    it("should return null when no params saved", async () => {
      const { saveCacheSafeParams, getLastCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      saveCacheSafeParams(null);
      
      const retrieved = getLastCacheSafeParams();
      
      expect(retrieved).toBeNull();
    });

    it("should overwrite previous params", async () => {
      const { saveCacheSafeParams, getLastCacheSafeParams, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const params1 = createCacheSafeParams("prompt1", {}, {}, [], []);
      const params2 = createCacheSafeParams("prompt2", {}, {}, [], []);
      
      saveCacheSafeParams(params1);
      saveCacheSafeParams(params2);
      
      const retrieved = getLastCacheSafeParams();
      
      expect(retrieved?.systemPrompt).toBe("prompt2");
    });
  });

  describe("runForkedAgent", () => {
    it("should run forked agent with config", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const mockExecuteQuery = vi.fn().mockResolvedValue({
        messages: [createMockMessage("response", "assistant")],
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      });
      
      const cacheParams = createCacheSafeParams(
        "system prompt",
        {},
        {},
        [],
        [createMockMessage("context")]
      );
      
      const result = await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(result.messages).toHaveLength(1);
      expect(result.totalUsage.inputTokens).toBe(100);
      expect(result.totalUsage.outputTokens).toBe(50);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should include fork context messages", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      let receivedMessages: Message[] = [];
      const mockExecuteQuery = vi.fn().mockImplementation(async (messages: Message[]) => {
        receivedMessages = messages;
        return {
          messages: [],
          totalUsage: { inputTokens: 0, outputTokens: 0 },
        };
      });
      
      const cacheParams = createCacheSafeParams(
        "system prompt",
        {},
        {},
        [],
        [createMockMessage("context1"), createMockMessage("context2")]
      );
      
      await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(receivedMessages).toHaveLength(3);
    });

    it("should handle execution errors", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const mockExecuteQuery = vi.fn().mockRejectedValue(new Error("Execution failed"));
      
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], []);
      
      const result = await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(result.messages).toHaveLength(0);
      expect(result.totalUsage.inputTokens).toBe(0);
      expect(result.totalUsage.outputTokens).toBe(0);
    });

    it("should pass maxTurns option", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      let receivedOptions: Record<string, unknown> = {};
      const mockExecuteQuery = vi.fn().mockImplementation(async (_: Message[], options?: Record<string, unknown>) => {
        receivedOptions = options || {};
        return {
          messages: [],
          totalUsage: { inputTokens: 0, outputTokens: 0 },
        };
      });
      
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], []);
      
      await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
          maxTurns: 5,
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(receivedOptions.maxTurns).toBe(5);
    });

    it("should pass maxOutputTokens from params", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      let receivedOptions: Record<string, unknown> = {};
      const mockExecuteQuery = vi.fn().mockImplementation(async (_: Message[], options?: Record<string, unknown>) => {
        receivedOptions = options || {};
        return {
          messages: [],
          totalUsage: { inputTokens: 0, outputTokens: 0 },
        };
      });
      
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], [], { maxOutputTokens: 2000 });
      
      await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(receivedOptions.maxOutputTokens).toBe(2000);
    });

    it("should override maxOutputTokens from ForkedAgentParams", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      let receivedOptions: Record<string, unknown> = {};
      const mockExecuteQuery = vi.fn().mockImplementation(async (_: Message[], options?: Record<string, unknown>) => {
        receivedOptions = options || {};
        return {
          messages: [],
          totalUsage: { inputTokens: 0, outputTokens: 0 },
        };
      });
      
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], [], { maxOutputTokens: 2000 });
      
      await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
          maxOutputTokens: 500,
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(receivedOptions.maxOutputTokens).toBe(500);
    });
  });

  describe("createGetAppStateWithAllowedTools", () => {
    it("should create app state getter with allowed tools", async () => {
      const { createGetAppStateWithAllowedTools } = await import("../../backend/utils/forkedAgent.js");
      
      const baseGetAppState = () => ({
        permissions: {
          allowedTools: ["tool1", "tool2", "tool3"],
        },
        other: "data",
      });
      
      const restrictedGetAppState = createGetAppStateWithAllowedTools(baseGetAppState, ["tool1"]);
      
      const state = restrictedGetAppState() as Record<string, unknown>;
      const permissions = state.permissions as { allowedTools: string[] };
      
      expect(permissions.allowedTools).toEqual(["tool1"]);
      expect(state.other).toBe("data");
    });

    it("should handle state without permissions", async () => {
      const { createGetAppStateWithAllowedTools } = await import("../../backend/utils/forkedAgent.js");
      
      const baseGetAppState = () => ({
        other: "data",
      });
      
      const restrictedGetAppState = createGetAppStateWithAllowedTools(baseGetAppState, ["tool1"]);
      
      const state = restrictedGetAppState();
      
      expect(state).toEqual({ other: "data" });
    });

    it("should handle null state", async () => {
      const { createGetAppStateWithAllowedTools } = await import("../../backend/utils/forkedAgent.js");
      
      const baseGetAppState = () => null;
      
      const restrictedGetAppState = createGetAppStateWithAllowedTools(baseGetAppState, ["tool1"]);
      
      const state = restrictedGetAppState();
      
      expect(state).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty prompt messages", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const mockExecuteQuery = vi.fn().mockResolvedValue({
        messages: [],
        totalUsage: { inputTokens: 0, outputTokens: 0 },
      });
      
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], []);
      
      const result = await runForkedAgent(
        {
          promptMessages: [],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(result.messages).toHaveLength(0);
    });

    it("should handle empty fork context messages", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      let receivedMessages: Message[] = [];
      const mockExecuteQuery = vi.fn().mockImplementation(async (messages: Message[]) => {
        receivedMessages = messages;
        return {
          messages: [],
          totalUsage: { inputTokens: 0, outputTokens: 0 },
        };
      });
      
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], []);
      
      await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(receivedMessages).toHaveLength(1);
    });

    it("should handle empty tools array", async () => {
      const { createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const params = createCacheSafeParams("prompt", {}, {}, [], []);
      
      expect(params.tools).toHaveLength(0);
    });

    it("should handle large number of context messages", async () => {
      const { runForkedAgent, createCacheSafeParams } = await import("../../backend/utils/forkedAgent.js");
      
      const mockExecuteQuery = vi.fn().mockResolvedValue({
        messages: [],
        totalUsage: { inputTokens: 0, outputTokens: 0 },
      });
      
      const contextMessages = Array(100).fill(null).map((_, i) => createMockMessage(`context ${i}`));
      const cacheParams = createCacheSafeParams("system prompt", {}, {}, [], contextMessages);
      
      await runForkedAgent(
        {
          promptMessages: [createMockMessage("user input")],
          cacheSafeParams: cacheParams,
          forkLabel: "test-fork",
        },
        { executeQuery: mockExecuteQuery }
      );
      
      expect(mockExecuteQuery).toHaveBeenCalled();
    });
  });
});
