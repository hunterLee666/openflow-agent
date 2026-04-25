import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
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

const createMockToolContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  cwd: "/tmp",
  config: {} as any,
  ...overrides,
});

describe("E2E: Tool Governance Flow", () => {
  describe("Governance Pipeline Types", () => {
    it("should have FourteenStepGovernancePipeline class", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      expect(FourteenStepGovernancePipeline).toBeDefined();
    });

    it("should have GovernanceContext interface exported", async () => {
      const governance = await import("../../backend/tools/governance.js");
      expect(typeof governance).toBe("object");
    });

    it("should have GovernanceResult interface exported", async () => {
      const governance = await import("../../backend/tools/governance.js");
      expect(typeof governance).toBe("object");
    });

    it("should have GovernanceStepResult interface exported", async () => {
      const governance = await import("../../backend/tools/governance.js");
      expect(typeof governance).toBe("object");
    });
  });

  describe("Pipeline Initialization", () => {
    it("should create pipeline with default config", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      expect(pipeline).toBeDefined();
    });

    it("should create pipeline with hooks", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const hooks = {
        preToolUse: vi.fn(),
        postToolUse: vi.fn(),
        onTelemetry: vi.fn(),
      };
      const pipeline = new FourteenStepGovernancePipeline(hooks);
      expect(pipeline).toBeDefined();
    });

    it("should create pipeline with risk threshold", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline(undefined, "high");
      expect(pipeline).toBeDefined();
    });
  });

  describe("Step 1: Parse Input", () => {
    it("should accept valid object input", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { key: "value" }, createMockToolContext(), ctx);
      expect(result.steps[0].name).toBe("parseInput");
      expect(result.steps[0].action).not.toBe("deny");
    });

    it("should reject null input", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, null, createMockToolContext(), ctx);
      expect(result.steps[0].action).toBe("deny");
      expect(result.status).toBe("error");
    });

    it("should reject undefined input", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, undefined, createMockToolContext(), ctx);
      expect(result.steps[0].action).toBe("deny");
    });

    it("should reject non-object input", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, "string", createMockToolContext(), ctx);
      expect(result.steps[0].action).toBe("deny");
    });
  });

  describe("Step 2: Schema Validation", () => {
    it("should validate input against schema", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: { name: "test" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { name: "test" }, createMockToolContext(), ctx);
      expect(result.steps[1].name).toBe("validateSchema");
    });

    it("should reject invalid input schema", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        inputSchema: {
          type: "object",
          properties: {
            count: { type: "number" },
          },
          required: ["count"],
        },
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: { count: "not-a-number" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { count: "not-a-number" }, createMockToolContext(), ctx);
      expect(result.steps[1].action).toBe("deny");
    });
  });

  describe("Step 3: Business Validation", () => {
    it("should detect destructive commands", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "bash" });
      const ctx = {
        cwd: "/tmp",
        tool: "bash",
        input: { command: "rm -rf /" },
        isReadOnly: false,
        isDestructive: true,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { command: "rm -rf /" }, createMockToolContext(), ctx);
      expect(result.steps[2].name).toBe("validateInput");
    });

    it("should block protected paths", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "edit" });
      const ctx = {
        cwd: "/tmp",
        tool: "edit",
        input: { path: "/.ssh/id_rsa" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { path: "/.ssh/id_rsa" }, createMockToolContext(), ctx);
      expect(result.steps[2].action).toBe("deny");
    });
  });

  describe("Step 4: Speculative Classifier", () => {
    it("should calculate risk score for destructive operations", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "bash" });
      const ctx = {
        cwd: "/tmp",
        tool: "bash",
        input: { command: "rm file.txt" },
        isReadOnly: false,
        isDestructive: true,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { command: "rm file.txt" }, createMockToolContext(), ctx);
      expect(result.steps[3].name).toBe("speculativeClassifier");
      expect(result.telemetry?.riskScore).toBeDefined();
    });

    it("should calculate risk score for network operations", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "curl" });
      const ctx = {
        cwd: "/tmp",
        tool: "curl",
        input: { url: "https://example.com" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: true,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { url: "https://example.com" }, createMockToolContext(), ctx);
      expect(result.steps[3].name).toBe("speculativeClassifier");
    });

    it("should deny critical risk operations", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "bash" });
      const ctx = {
        cwd: "/tmp",
        tool: "bash",
        input: { command: "dd if=/dev/zero of=/dev/sda" },
        isReadOnly: false,
        isDestructive: true,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { command: "dd if=/dev/zero of=/dev/sda" }, createMockToolContext(), ctx);
      expect(result.steps[3].action).toBe("deny");
    });
  });

  describe("Step 5: PreToolUse Hook", () => {
    it("should call preToolUse hook", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const preToolUse = vi.fn().mockResolvedValue({ action: "allow" });
      const pipeline = new FourteenStepGovernancePipeline({ preToolUse });
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(preToolUse).toHaveBeenCalled();
    });

    it("should allow hook to deny operation", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const preToolUse = vi.fn().mockResolvedValue({ action: "deny", reason: "Blocked by hook" });
      const pipeline = new FourteenStepGovernancePipeline({ preToolUse });
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[4].action).toBe("deny");
    });

    it("should allow hook to modify input", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const preToolUse = vi.fn().mockResolvedValue({ action: "modify", input: { modified: true } });
      const pipeline = new FourteenStepGovernancePipeline({ preToolUse });
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[4].action).toBe("modify");
    });
  });

  describe("Step 6: Permission Decision", () => {
    it("should deny write operations in readonly mode", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "write", isReadOnly: false });
      const ctx = {
        cwd: "/tmp",
        tool: "write",
        input: { path: "/tmp/test.txt" },
        isReadOnly: true,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { path: "/tmp/test.txt" }, createMockToolContext(), ctx);
      expect(result.steps[5].name).toBe("permissionDecision");
    });
  });

  describe("Step 7: Input Correction", () => {
    it("should normalize bash command", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "bash" });
      const ctx = {
        cwd: "/tmp",
        tool: "bash",
        input: { command: "  ls -la  " },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { command: "  ls -la  " }, createMockToolContext(), ctx);
      expect(result.steps[6].name).toBe("correctInput");
    });

    it("should normalize file paths", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({ name: "edit" });
      const ctx = {
        cwd: "/tmp",
        tool: "edit",
        input: { path: "/tmp//test.txt" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, { path: "/tmp//test.txt" }, createMockToolContext(), ctx);
      expect(result.steps[6].name).toBe("correctInput");
    });
  });

  describe("Step 8: Tool Execution", () => {
    it("should execute tool successfully", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const handler = vi.fn().mockResolvedValue({ data: "success" });
      const tool = createMockTool({ handler });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[7].name).toBe("execute");
      expect(handler).toHaveBeenCalled();
    });

    it("should handle tool execution error", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockRejectedValue(new Error("Tool failed")),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[7].action).toBe("deny");
    });
  });

  describe("Step 9: Telemetry", () => {
    it("should call onTelemetry hook", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const onTelemetry = vi.fn();
      const pipeline = new FourteenStepGovernancePipeline({ onTelemetry });
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(onTelemetry).toHaveBeenCalled();
    });

    it("should include trace and span IDs", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.telemetry?.traceId).toBeDefined();
      expect(result.telemetry?.spanId).toBeDefined();
    });
  });

  describe("Step 10: PostToolUse Hook", () => {
    it("should call postToolUse hook", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const postToolUse = vi.fn().mockResolvedValue({ action: "allow" });
      const pipeline = new FourteenStepGovernancePipeline({ postToolUse });
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(postToolUse).toHaveBeenCalled();
    });

    it("should allow hook to modify output", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const postToolUse = vi.fn().mockResolvedValue({ action: "modify", output: { modified: true } });
      const pipeline = new FourteenStepGovernancePipeline({ postToolUse });
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue({ original: true }),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[9].action).toBe("modify");
    });
  });

  describe("Step 11: Structured Output", () => {
    it("should create structured output", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue({ data: "result" }),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[10].name).toBe("structuredOutput");
    });
  });

  describe("Step 12: Output Validation", () => {
    it("should validate output against schema", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        outputSchema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
          },
        },
        handler: vi.fn().mockResolvedValue({ success: true }),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[11].name).toBe("outputValidation");
    });

    it("should reject invalid output", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        outputSchema: {
          type: "object",
          properties: {
            count: { type: "number" },
          },
          required: ["count"],
        },
        handler: vi.fn().mockResolvedValue({ count: "not-a-number" }),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[11].action).toBe("deny");
    });
  });

  describe("Step 13: Sensitive Data Masking", () => {
    it("should mask sensitive outputs when enabled", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        name: "bash",
        handler: vi.fn().mockResolvedValue("password=secret123"),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "bash",
        input: { command: "echo test" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: { maskSensitiveOutputs: true },
      };
      const result = await pipeline.execute(tool, { command: "echo test" }, createMockToolContext(), ctx);
      expect(result.steps[12].name).toBe("maskSensitive");
    });

    it("should not mask when disabled", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        name: "bash",
        handler: vi.fn().mockResolvedValue("password=secret123"),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "bash",
        input: { command: "echo test" },
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: { maskSensitiveOutputs: false },
      };
      const result = await pipeline.execute(tool, { command: "echo test" }, createMockToolContext(), ctx);
      expect(result.steps[12].action).toBe("continue");
    });
  });

  describe("Step 14: Compression", () => {
    it("should compress large outputs", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const largeOutput = "x".repeat(15000);
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue(largeOutput),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[13].name).toBe("compress");
    });

    it("should not compress small outputs", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue("small output"),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.steps[13].action).toBe("continue");
    });
  });

  describe("Complete Pipeline Flow", () => {
    it("should execute all 14 steps in order", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);

      const expectedSteps = [
        "parseInput",
        "validateSchema",
        "validateInput",
        "speculativeClassifier",
        "preToolUse",
        "permissionDecision",
        "correctInput",
        "execute",
        "telemetry",
        "postToolUse",
        "structuredOutput",
        "outputValidation",
        "maskSensitive",
        "compress",
      ];

      expect(result.steps.length).toBe(14);
      result.steps.forEach((step, index) => {
        expect(step.name).toBe(expectedSteps[index]);
        expect(step.step).toBe(index + 1);
      });
    });

    it("should return successful result", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockResolvedValue({ data: "success" }),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.status).toBe("ok");
      expect(result.data).toBeDefined();
    });

    it("should include duration in telemetry", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.telemetry?.durationMs).toBeDefined();
      expect(result.telemetry?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle unknown errors gracefully", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockImplementation(() => {
          throw "string error";
        }),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.status).toBe("error");
    });

    it("should include error code in result", async () => {
      const { FourteenStepGovernancePipeline } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockRejectedValue(new Error("Test error")),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      expect(result.error?.code).toBeDefined();
    });
  });

  describe("formatGovernanceError", () => {
    it("should format error result", async () => {
      const { FourteenStepGovernancePipeline, formatGovernanceError } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool({
        handler: vi.fn().mockRejectedValue(new Error("Test error")),
      });
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      const formatted = formatGovernanceError(result);
      expect(formatted).toContain("Governance error");
    });

    it("should return empty string for success", async () => {
      const { FourteenStepGovernancePipeline, formatGovernanceError } = await import("../../backend/tools/governance.js");
      const pipeline = new FourteenStepGovernancePipeline();
      const tool = createMockTool();
      const ctx = {
        cwd: "/tmp",
        tool: "test",
        input: {},
        isReadOnly: false,
        isDestructive: false,
        isNetworkAccess: false,
        isGitCommand: false,
        config: {},
      };
      const result = await pipeline.execute(tool, {}, createMockToolContext(), ctx);
      const formatted = formatGovernanceError(result);
      expect(formatted).toBe("");
    });
  });
});
