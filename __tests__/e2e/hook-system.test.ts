import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Hook System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Hook Registry", () => {
    it("should have hook registry initialized", () => {
      expect(services.hookRegistry).toBeDefined();
    });

    it("should register a hook", () => {
      const hookId = services.hookRegistry.register("PreToolUse", async () => {
        return { action: "continue" };
      });

      expect(hookId).toBeDefined();
      expect(typeof hookId).toBe("string");
    });

    it("should unregister a hook", () => {
      const hookId = services.hookRegistry.register("PostToolUse", async () => {
        return { action: "continue" };
      });

      services.hookRegistry.unregister(hookId);
      const hooks = services.hookRegistry.getHooks("PostToolUse");
      expect(hooks.find(h => h.id === hookId)).toBeUndefined();
    });

    it("should get hooks by event", () => {
      services.hookRegistry.register("SessionStart", async () => {
        return { action: "continue" };
      });

      const hooks = services.hookRegistry.getHooks("SessionStart");
      expect(hooks.length).toBeGreaterThan(0);
    });
  });

  describe("PreToolUse Hook", () => {
    it("should dispatch PreToolUse event", async () => {
      let hookCalled = false;
      
      services.hookRegistry.register("PreToolUse", async (ctx) => {
        hookCalled = true;
        expect(ctx.tool).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("PreToolUse", {
        tool: "read_file",
        input: { path: "test.txt" },
      });

      expect(hookCalled).toBe(true);
    });

    it("should allow tool execution with continue action", async () => {
      services.hookRegistry.register("PreToolUse", async () => {
        return { action: "continue" };
      });

      const results = await services.hookRegistry.dispatch("PreToolUse", {
        tool: "bash",
        input: { command: "echo test" },
      });

      expect(results).toBeDefined();
    });

    it("should block tool execution with deny action", async () => {
      services.hookRegistry.register("PreToolUse", async () => {
        return { action: "deny", message: "Tool blocked by hook" };
      });

      const results = await services.hookRegistry.dispatch("PreToolUse", {
        tool: "bash",
        input: { command: "rm -rf /" },
      });

      expect(results).toBeDefined();
      const deniedResult = results.find(r => r.result?.action === "deny");
      expect(deniedResult).toBeDefined();
    });

    it("should modify tool input", async () => {
      services.hookRegistry.register("PreToolUse", async (ctx) => {
        return {
          action: "modify",
          modifiedInput: { ...ctx.input, modified: true },
        };
      });

      const results = await services.hookRegistry.dispatch("PreToolUse", {
        tool: "read_file",
        input: { path: "test.txt" },
      });

      expect(results).toBeDefined();
    });
  });

  describe("PostToolUse Hook", () => {
    it("should dispatch PostToolUse event", async () => {
      let hookCalled = false;
      
      services.hookRegistry.register("PostToolUse", async (ctx) => {
        hookCalled = true;
        expect(ctx.tool).toBeDefined();
        expect(ctx.output).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("PostToolUse", {
        tool: "read_file",
        input: { path: "test.txt" },
        output: { content: "test content" },
      });

      expect(hookCalled).toBe(true);
    });
  });

  describe("Session Hooks", () => {
    it("should dispatch SessionStart event", async () => {
      let sessionStarted = false;
      
      services.hookRegistry.register("SessionStart", async (ctx) => {
        sessionStarted = true;
        expect(ctx.sessionId).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("SessionStart", {
        sessionId: "test-session-123",
      });

      expect(sessionStarted).toBe(true);
    });

    it("should dispatch SessionEnd event", async () => {
      let sessionEnded = false;
      
      services.hookRegistry.register("SessionEnd", async (ctx) => {
        sessionEnded = true;
        expect(ctx.sessionId).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("SessionEnd", {
        sessionId: "test-session-123",
      });

      expect(sessionEnded).toBe(true);
    });
  });

  describe("Task Hooks", () => {
    it("should dispatch TaskCreated event", async () => {
      let taskCreated = false;
      
      services.hookRegistry.register("TaskCreated", async (ctx) => {
        taskCreated = true;
        expect(ctx.taskId).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("TaskCreated", {
        taskId: "task-123",
      });

      expect(taskCreated).toBe(true);
    });

    it("should dispatch TaskCompleted event", async () => {
      let taskCompleted = false;
      
      services.hookRegistry.register("TaskCompleted", async (ctx) => {
        taskCompleted = true;
        expect(ctx.taskId).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("TaskCompleted", {
        taskId: "task-123",
      });

      expect(taskCompleted).toBe(true);
    });
  });

  describe("Subagent Hooks", () => {
    it("should dispatch SubagentStart event", async () => {
      let subagentStarted = false;
      
      services.hookRegistry.register("SubagentStart", async (ctx) => {
        subagentStarted = true;
        expect(ctx.agentId).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("SubagentStart", {
        agentId: "subagent-123",
      });

      expect(subagentStarted).toBe(true);
    });

    it("should dispatch SubagentStop event", async () => {
      let subagentStopped = false;
      
      services.hookRegistry.register("SubagentStop", async (ctx) => {
        subagentStopped = true;
        expect(ctx.agentId).toBeDefined();
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("SubagentStop", {
        agentId: "subagent-123",
      });

      expect(subagentStopped).toBe(true);
    });
  });

  describe("Compact Hooks", () => {
    it("should dispatch PreCompact event", async () => {
      let preCompact = false;
      
      services.hookRegistry.register("PreCompact", async () => {
        preCompact = true;
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("PreCompact", {});

      expect(preCompact).toBe(true);
    });

    it("should dispatch PostCompact event", async () => {
      let postCompact = false;
      
      services.hookRegistry.register("PostCompact", async () => {
        postCompact = true;
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("PostCompact", {});

      expect(postCompact).toBe(true);
    });
  });

  describe("Hook Error Handling", () => {
    it("should handle hook errors gracefully", async () => {
      services.hookRegistry.register("PreToolUse", async () => {
        throw new Error("Hook error");
      });

      const results = await services.hookRegistry.dispatch("PreToolUse", {
        tool: "read_file",
        input: { path: "test.txt" },
      });

      expect(results).toBeDefined();
    });
  });

  describe("Multiple Hooks", () => {
    it("should execute multiple hooks in sequence", async () => {
      const executionOrder: number[] = [];
      
      services.hookRegistry.register("PreToolUse", async () => {
        executionOrder.push(1);
        return { action: "continue" };
      });

      services.hookRegistry.register("PreToolUse", async () => {
        executionOrder.push(2);
        return { action: "continue" };
      });

      services.hookRegistry.register("PreToolUse", async () => {
        executionOrder.push(3);
        return { action: "continue" };
      });

      await services.hookRegistry.dispatch("PreToolUse", {
        tool: "read_file",
        input: { path: "test.txt" },
      });

      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });
});
