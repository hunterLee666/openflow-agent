import { describe, test, expect } from "bun:test";
import { FourteenStepGovernancePipeline } from "../../../refactored/core/governance/pipeline.js";
import type { GovernanceContext } from "../../../refactored/core/governance/types.js";

describe("14-Step Governance Pipeline", () => {
  test("should allow safe tool execution", async () => {
    const pipeline = new FourteenStepGovernancePipeline(undefined, "medium");
    const ctx: GovernanceContext = {
      cwd: process.cwd(),
      tool: "read",
      input: { path: "/tmp/test.txt" },
      isReadOnly: true,
      isDestructive: false,
      isNetworkAccess: false,
      isGitCommand: false,
      config: { maskSensitiveOutputs: true },
    };

    const result = await pipeline.execute(
      "read",
      { path: "/tmp/test.txt" },
      async () => "file content",
      ctx
    );

    expect(result.status).toBe("ok");
    expect(result.steps.length).toBeGreaterThan(0);
  });

  test("should deny destructive bash command", async () => {
    const pipeline = new FourteenStepGovernancePipeline(undefined, "medium");
    const ctx: GovernanceContext = {
      cwd: process.cwd(),
      tool: "bash",
      input: { command: "rm -rf /" },
      isReadOnly: false,
      isDestructive: true,
      isNetworkAccess: false,
      isGitCommand: false,
      config: { maskSensitiveOutputs: true },
    };

    const result = await pipeline.execute(
      "bash",
      { command: "rm -rf /" },
      async () => "should not execute",
      ctx
    );

    expect(result.status).toBe("error");
  });

  test("should deny write in readonly mode", async () => {
    const pipeline = new FourteenStepGovernancePipeline(undefined, "medium");
    const ctx: GovernanceContext = {
      cwd: process.cwd(),
      tool: "write",
      input: { path: "/tmp/test.txt", content: "test" },
      isReadOnly: true,
      isDestructive: false,
      isNetworkAccess: false,
      isGitCommand: false,
      config: { maskSensitiveOutputs: true },
    };

    const result = await pipeline.execute(
      "write",
      { path: "/tmp/test.txt", content: "test" },
      async () => "should not execute",
      ctx
    );

    expect(result.status).toBe("error");
  });

  test("should mask sensitive output", async () => {
    const pipeline = new FourteenStepGovernancePipeline(undefined, "medium");
    const ctx: GovernanceContext = {
      cwd: process.cwd(),
      tool: "bash",
      input: { command: "echo test" },
      isReadOnly: false,
      isDestructive: false,
      isNetworkAccess: false,
      isGitCommand: false,
      config: { maskSensitiveOutputs: true },
    };

    const result = await pipeline.execute(
      "bash",
      { command: "echo test" },
      async () => "password=secret123",
      ctx
    );

    expect(result.status).toBe("ok");
    expect(result.data).toBeDefined();
    const dataStr = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
    expect(dataStr).toContain("[REDACTED]");
  });

  test("should compress large output", async () => {
    const pipeline = new FourteenStepGovernancePipeline(undefined, "medium");
    const ctx: GovernanceContext = {
      cwd: process.cwd(),
      tool: "read",
      input: { path: "/tmp/large.txt" },
      isReadOnly: true,
      isDestructive: false,
      isNetworkAccess: false,
      isGitCommand: false,
      config: { maskSensitiveOutputs: false },
    };

    const largeContent = "x".repeat(15000);
    const result = await pipeline.execute(
      "read",
      { path: "/tmp/large.txt" },
      async () => largeContent,
      ctx
    );

    expect(result.status).toBe("ok");
    expect(result.data).toBeDefined();
    const dataObj = result.data as { $ref?: string; length?: number; preview?: string };
    expect(dataObj.$ref).toBeDefined();
    expect(dataObj.$ref).toContain("memory://");
    expect(dataObj.length).toBeGreaterThan(14000);
  });
});
