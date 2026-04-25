import { describe, test, expect } from "bun:test";
import { HookSystem, createHookSystem } from "../../../refactored/core/hooks/hook-system.js";
import { setupDefaultHooks } from "../../../refactored/core/hooks/default-hooks.js";
import type { HookContext } from "../../../refactored/core/hooks/hook-system.js";

describe("Hook System", () => {
  test("should register and dispatch hooks", async () => {
    const hookSystem = createHookSystem();
    setupDefaultHooks(hookSystem);

    const ctx: HookContext = {
      sessionId: "test-session-1",
      timestamp: Date.now(),
      metadata: { prompt: "hello world" },
    };

    const results = await hookSystem.dispatch("SessionStart", ctx);
    expect(results.length).toBeGreaterThan(0);
  });

  test("should block dangerous prompts", async () => {
    const hookSystem = createHookSystem();
    setupDefaultHooks(hookSystem);

    const ctx: HookContext = {
      sessionId: "test-session-2",
      timestamp: Date.now(),
      metadata: { prompt: "rm -rf /" },
    };

    const results = await hookSystem.dispatch("UserPromptSubmit", ctx);
    const blocked = results.find((r) => r.action === "block");
    expect(blocked).toBeDefined();
  });

  test("should allow safe prompts", async () => {
    const hookSystem = createHookSystem();
    setupDefaultHooks(hookSystem);

    const ctx: HookContext = {
      sessionId: "test-session-3",
      timestamp: Date.now(),
      metadata: { prompt: "help me write a function" },
    };

    const results = await hookSystem.dispatch("UserPromptSubmit", ctx);
    const blocked = results.find((r) => r.action === "block");
    expect(blocked).toBeUndefined();
  });

  test("should block dangerous tools", async () => {
    const hookSystem = createHookSystem();
    setupDefaultHooks(hookSystem);

    const ctx: HookContext = {
      sessionId: "test-session-4",
      timestamp: Date.now(),
      metadata: { toolName: "exec" },
    };

    const results = await hookSystem.dispatch("ToolCallStart", ctx);
    const blocked = results.find((r) => r.action === "block");
    expect(blocked).toBeDefined();
  });

  test("should warn on budget exceeded", async () => {
    const hookSystem = createHookSystem();
    setupDefaultHooks(hookSystem);

    const ctx: HookContext = {
      sessionId: "test-session-5",
      timestamp: Date.now(),
      metadata: {
        usage: { inputTokens: 45000, outputTokens: 40000 },
        budget: 100000,
      },
    };

    const results = await hookSystem.dispatch("BudgetWarning", ctx);
    const warning = results.find((r) => r.message?.includes("Token usage"));
    expect(warning).toBeDefined();
  });

  test("should list registered hooks", async () => {
    const hookSystem = createHookSystem();
    setupDefaultHooks(hookSystem);

    const hooks = hookSystem.listHooks();
    expect(hooks.length).toBeGreaterThan(0);
  });
});
