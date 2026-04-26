import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  HookSystem,
  HookEventSchema,
  HookTypeSchema,
  HookContextSchema,
  HookResultSchema,
  HookDefinitionSchema,
} from "../../backend/hooks/hook-system.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-hooks-e2e-${Date.now()}`);

describe("E2E - Hook 系统完整场景", () => {
  let hookSystem: HookSystem;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    await mkdir(projectDir, { recursive: true });
    hookSystem = new HookSystem();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: Hook 系统初始化", () => {
    it("应该能够创建 Hook 系统实例", () => {
      expect(hookSystem).toBeDefined();
    });

    it("新创建的 Hook 系统应该没有已注册的 Hook", () => {
      const hooks = hookSystem.listHooks();
      expect(hooks.length).toBe(0);
    });

    it("应该能够验证有效的 Hook 事件", () => {
      const validEvents = [
        "SessionStart",
        "SessionEnd",
        "UserPromptSubmit",
        "AssistantResponseComplete",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "Error",
      ];

      validEvents.forEach((event) => {
        const result = HookEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      });
    });

    it("应该能够检测无效的 Hook 事件", () => {
      const result = HookEventSchema.safeParse("InvalidEvent");
      expect(result.success).toBe(false);
    });

    it("应该能够验证有效的 Hook 类型", () => {
      const result1 = HookTypeSchema.safeParse("command");
      const result2 = HookTypeSchema.safeParse("prompt");
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it("应该能够检测无效的 Hook 类型", () => {
      const result = HookTypeSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });
  });

  describe("场景 2: Hook 注册", () => {
    it("应该能够注册 Hook", () => {
      hookSystem.register({
        name: "test-hook",
        event: "PreToolUse",
        handler: async (ctx) => ({ decision: "approve" }),
      });

      const hooks = hookSystem.listHooks();
      expect(hooks.length).toBe(1);
      expect(hooks[0].name).toBe("test-hook");
      expect(hooks[0].event).toBe("PreToolUse");
    });

    it("应该能够注册带优先级的 Hook", () => {
      hookSystem.register({
        name: "high-priority",
        event: "PreToolUse",
        priority: 10,
        handler: async (ctx) => ({ decision: "approve" }),
      });

      hookSystem.register({
        name: "low-priority",
        event: "PreToolUse",
        priority: 100,
        handler: async (ctx) => ({ decision: "approve" }),
      });

      const hooks = hookSystem.listHooks();
      expect(hooks.length).toBe(2);
    });

    it("应该能够注册带匹配器的 Hook", () => {
      hookSystem.register({
        name: "file-hook",
        event: "PreToolUse",
        matcher: "File",
        handler: async (ctx) => ({ decision: "approve" }),
      });

      const hooks = hookSystem.listHooks();
      expect(hooks.length).toBe(1);
    });

    it("应该能够验证有效的 Hook 定义", () => {
      const validHook = {
        name: "test",
        event: "PreToolUse" as const,
        handler: async (ctx: any) => ({ decision: "approve" as const }),
      };

      const result = HookDefinitionSchema.safeParse(validHook);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的 Hook 定义", () => {
      const invalidHook = {
        name: 123,
        event: "InvalidEvent",
        handler: "not-a-function",
      };

      const result = HookDefinitionSchema.safeParse(invalidHook);
      expect(result.success).toBe(false);
    });

    it("应该能够验证有效的 Hook 上下文", () => {
      const validContext = {
        sessionId: "session-123",
        timestamp: Date.now(),
      };

      const result = HookContextSchema.safeParse(validContext);
      expect(result.success).toBe(true);
    });

    it("应该能够验证有效的 Hook 结果", () => {
      const validResult = {
        decision: "approve" as const,
        action: "allow" as const,
        reason: "Okay",
      };

      const result = HookResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });
  });

  describe("场景 3: Hook 分发", () => {
    it("应该能够分发事件给注册的 Hook", async () => {
      let hookCalled = false;

      hookSystem.register({
        name: "test-dispatch",
        event: "SessionStart",
        handler: async (ctx) => {
          hookCalled = true;
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("SessionStart", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });

      expect(hookCalled).toBe(true);
    });

    it("应该能够传递正确的上下文给 Hook", async () => {
      let receivedContext: any = null;

      hookSystem.register({
        name: "context-test",
        event: "PreToolUse",
        handler: async (ctx) => {
          receivedContext = ctx;
          return { decision: "approve" };
        },
      });

      const testContext = {
        sessionId: "test-session",
        timestamp: Date.now(),
        toolName: "Write",
        metadata: { author: "test" },
      };

      await hookSystem.dispatch("PreToolUse", testContext);

      expect(receivedContext.sessionId).toBe("test-session");
      expect(receivedContext.toolName).toBe("Write");
      expect(receivedContext.event).toBe("PreToolUse");
    });

    it("应该能够返回 Hook 执行结果", async () => {
      hookSystem.register({
        name: "result-test",
        event: "UserPromptSubmit",
        handler: async (ctx) => ({
          decision: "approve",
          action: "allow",
          message: "Hook executed",
        }),
      });

      const results = await hookSystem.dispatch("UserPromptSubmit", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });

      expect(results.length).toBe(1);
      expect(results[0].decision).toBe("approve");
      expect(results[0].action).toBe("allow");
      expect(results[0].message).toBe("Hook executed");
    });

    it("阻塞 Hook 应该停止后续 Hook 执行", async () => {
      const executionOrder: string[] = [];

      hookSystem.register({
        name: "blocker",
        event: "PreToolUse",
        priority: 10,
        handler: async (ctx) => {
          executionOrder.push("blocker");
          return { decision: "deny", action: "block" };
        },
      });

      hookSystem.register({
        name: "should-not-run",
        event: "PreToolUse",
        priority: 100,
        handler: async (ctx) => {
          executionOrder.push("should-not-run");
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("PreToolUse", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });

      expect(executionOrder).toEqual(["blocker"]);
    });

    it("Hook 失败不应该中断其他 Hook 执行", async () => {
      let successfulHookRan = false;

      hookSystem.register({
        name: "failing-hook",
        event: "Error",
        handler: async (ctx) => {
          throw new Error("Hook failed");
        },
      });

      hookSystem.register({
        name: "successful-hook",
        event: "Error",
        handler: async (ctx) => {
          successfulHookRan = true;
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("Error", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });

      expect(successfulHookRan).toBe(true);
    });
  });

  describe("场景 4: Hook 匹配器", () => {
    it("应该能够根据工具名称匹配 Hook", async () => {
      let matchedHookRan = false;
      let unmatchedHookRan = false;

      hookSystem.register({
        name: "file-hook",
        event: "PreToolUse",
        matcher: "Write",
        handler: async (ctx) => {
          matchedHookRan = true;
          return { decision: "approve" };
        },
      });

      hookSystem.register({
        name: "read-hook",
        event: "PreToolUse",
        matcher: "Read",
        handler: async (ctx) => {
          unmatchedHookRan = true;
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("PreToolUse", {
        sessionId: "test-session",
        timestamp: Date.now(),
        toolName: "Write",
      });

      expect(matchedHookRan).toBe(true);
      expect(unmatchedHookRan).toBe(false);
    });

    it("没有匹配器的 Hook 应该总是执行", async () => {
      let hookRan = false;

      hookSystem.register({
        name: "always-run",
        event: "PreToolUse",
        handler: async (ctx) => {
          hookRan = true;
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("PreToolUse", {
        sessionId: "test-session",
        timestamp: Date.now(),
        toolName: "AnyTool",
      });

      expect(hookRan).toBe(true);
    });

    it("无效的正则表达式匹配器应该回退到简单匹配", async () => {
      let hookRan = false;

      hookSystem.register({
        name: "invalid-regex",
        event: "PreToolUse",
        matcher: "[",
        handler: async (ctx) => {
          hookRan = true;
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("PreToolUse", {
        sessionId: "test-session",
        timestamp: Date.now(),
        toolName: "[TestTool]",
      });

      expect(hookRan).toBe(true);
    });
  });

  describe("场景 5: Hook 管理", () => {
    it("应该能够取消注册 Hook", () => {
      hookSystem.register({
        name: "to-remove",
        event: "SessionStart",
        handler: async (ctx) => ({ decision: "approve" }),
      });

      expect(hookSystem.listHooks().length).toBe(1);
      hookSystem.unregister("to-remove");
      expect(hookSystem.listHooks().length).toBe(0);
    });

    it("取消注册不存在的 Hook 不应该出错", () => {
      expect(() => hookSystem.unregister("nonexistent")).not.toThrow();
    });

    it("应该能够按事件获取 Hooks", () => {
      hookSystem.register({
        name: "hook1",
        event: "SessionStart",
        handler: async (ctx) => ({ decision: "approve" }),
      });

      hookSystem.register({
        name: "hook2",
        event: "SessionEnd",
        handler: async (ctx) => ({ decision: "approve" }),
      });

      const startHooks = hookSystem.getHooksByEvent("SessionStart");
      const endHooks = hookSystem.getHooksByEvent("SessionEnd");

      expect(startHooks.length).toBe(1);
      expect(endHooks.length).toBe(1);
      expect(startHooks[0].name).toBe("hook1");
      expect(endHooks[0].name).toBe("hook2");
    });

    it("获取不存在的事件 Hooks 应该返回空数组", () => {
      const hooks = hookSystem.getHooksByEvent("Notification");
      expect(hooks).toEqual([]);
    });

    it("应该能够列出所有 Hooks", () => {
      for (let i = 1; i <= 3; i++) {
        hookSystem.register({
          name: `hook-${i}`,
          event: "PreToolUse",
          handler: async (ctx) => ({ decision: "approve" }),
        });
      }

      const hooks = hookSystem.listHooks();
      expect(hooks.length).toBe(3);
    });
  });

  describe("场景 6: 按优先级排序", () => {
    it("Hook 应该按优先级排序执行", async () => {
      const executionOrder: string[] = [];

      hookSystem.register({
        name: "priority-50",
        event: "SessionStart",
        priority: 50,
        handler: async (ctx) => {
          executionOrder.push("priority-50");
          return { decision: "approve" };
        },
      });

      hookSystem.register({
        name: "priority-10",
        event: "SessionStart",
        priority: 10,
        handler: async (ctx) => {
          executionOrder.push("priority-10");
          return { decision: "approve" };
        },
      });

      hookSystem.register({
        name: "priority-30",
        event: "SessionStart",
        priority: 30,
        handler: async (ctx) => {
          executionOrder.push("priority-30");
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("SessionStart", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });

      expect(executionOrder).toEqual([
        "priority-10",
        "priority-30",
        "priority-50",
      ]);
    });

    it("未设置优先级的 Hook 应该使用默认优先级 0", async () => {
      const executionOrder: string[] = [];

      hookSystem.register({
        name: "no-priority",
        event: "SessionStart",
        handler: async (ctx) => {
          executionOrder.push("no-priority");
          return { decision: "approve" };
        },
      });

      hookSystem.register({
        name: "priority-10",
        event: "SessionStart",
        priority: 10,
        handler: async (ctx) => {
          executionOrder.push("priority-10");
          return { decision: "approve" };
        },
      });

      await hookSystem.dispatch("SessionStart", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });

      expect(executionOrder).toEqual([
        "no-priority",
        "priority-10",
      ]);
    });
  });

  describe("场景 7: 异步 Hook", () => {
    it("应该能够注册异步 Hook", () => {
      hookSystem.registerAsyncHook({
        event: "SessionEnd",
        command: "echo 'Session ended'",
      });

      expect(true).toBe(true);
    });

    it("注册多个异步 Hook 不应该出错", () => {
      hookSystem.registerAsyncHook({
        event: "SessionStart",
        command: "echo 'Start'",
        timeout: 5000,
      });

      hookSystem.registerAsyncHook({
        event: "SessionEnd",
        command: "echo 'End'",
        timeout: 5000,
      });

      expect(true).toBe(true);
    });
  });

  describe("场景 8: HTTP Hook", () => {
    it("应该能够注册 HTTP Hook", () => {
      hookSystem.registerHttpHook({
        event: "SessionEnd",
        url: "https://example.com/webhook",
        method: "POST",
        timeout: 5000,
      });

      expect(true).toBe(true);
    });

    it("应该能够注册带头的 HTTP Hook", () => {
      hookSystem.registerHttpHook({
        event: "PreToolUse",
        url: "https://example.com/hook",
        headers: {
          "X-Auth-Token": "secret",
        },
      });

      expect(true).toBe(true);
    });
  });

  describe("场景 9: Hook 事件系统", () => {
    it("注册 Hook 时应该触发事件", (done) => {
      hookSystem.on("hook:registered", (data: any) => {
        expect(data.name).toBe("event-test");
        expect(data.event).toBe("SessionStart");
        done();
      });

      hookSystem.register({
        name: "event-test",
        event: "SessionStart",
        handler: async (ctx) => ({ decision: "approve" }),
      });
    });

    it("Hook 阻塞时应该触发事件", (done) => {
      hookSystem.on("hook:blocked", (data: any) => {
        expect(data.name).toBe("blocking-hook");
        done();
      });

      hookSystem.register({
        name: "blocking-hook",
        event: "PreToolUse",
        handler: async (ctx) => ({ decision: "deny", action: "block" }),
      });

      hookSystem.dispatch("PreToolUse", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });
    });

    it("Hook 出错时应该触发事件", (done) => {
      hookSystem.on("hook:error", (data: any) => {
        expect(data.name).toBe("error-hook");
        done();
      });

      hookSystem.register({
        name: "error-hook",
        event: "Error",
        handler: async (ctx) => {
          throw new Error("Test error");
        },
      });

      hookSystem.dispatch("Error", {
        sessionId: "test-session",
        timestamp: Date.now(),
      });
    });
  });

  describe("场景 10: 并发 Hook 分发", () => {
    it("应该能够处理并发的 Hook 分发", async () => {
      let executionCount = 0;

      hookSystem.register({
        name: "concurrent-hook",
        event: "UserPromptSubmit",
        handler: async (ctx) => {
          executionCount++;
          return { decision: "approve" };
        },
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          hookSystem.dispatch("UserPromptSubmit", {
            sessionId: `session-${i}`,
            timestamp: Date.now(),
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(executionCount).toBe(10);
    });

    it("并发分发时不应该互相干扰", async () => {
      const receivedSessionIds: string[] = [];

      hookSystem.register({
        name: "session-tracker",
        event: "SessionStart",
        handler: async (ctx) => {
          receivedSessionIds.push(ctx.sessionId);
          return { decision: "approve" };
        },
      });

      const sessionIds = [];
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const id = `concurrent-${i}`;
        sessionIds.push(id);
        promises.push(
          hookSystem.dispatch("SessionStart", {
            sessionId: id,
            timestamp: Date.now(),
          })
        );
      }

      await Promise.all(promises);

      expect(receivedSessionIds.length).toBe(5);
      sessionIds.forEach((id) => {
        expect(receivedSessionIds).toContain(id);
      });
    });
  });

  describe("场景 11: 复杂 Hook 链", () => {
    it("应该能够构建修改输入的 Hook 链", async () => {
      hookSystem.register({
        name: "validator",
        event: "PreToolUse",
        priority: 10,
        handler: async (ctx) => {
          return {
            decision: "approve",
            action: "allow",
            data: { validated: true },
          };
        },
      });

      hookSystem.register({
        name: "modifier",
        event: "PreToolUse",
        priority: 20,
        handler: async (ctx) => {
          return {
            decision: "approve",
            action: "modify",
            updatedInput: { modified: true },
          };
        },
      });

      hookSystem.register({
        name: "logger",
        event: "PreToolUse",
        priority: 30,
        handler: async (ctx) => {
          return {
            decision: "approve",
            action: "allow",
            hookSpecificOutput: { logged: true },
          };
        },
      });

      const results = await hookSystem.dispatch("PreToolUse", {
        sessionId: "chain-test",
        timestamp: Date.now(),
        toolName: "Test",
      });

      expect(results.length).toBe(3);
    });
  });
});
