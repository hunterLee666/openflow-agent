import { describe, it, expect } from "vitest";
import type { PermissionMode, PermissionContext } from "../../backend/permissions/types.js";

const createMockContext = (overrides: Partial<PermissionContext> = {}): PermissionContext => ({
  tool: "test",
  input: {},
  cwd: "/tmp",
  mode: "default",
  isReadOnly: false,
  isDestructive: false,
  isGitCommand: false,
  isNetworkCommand: false,
  ...overrides,
});

describe("E2E: Auto Permission Decision Flow", () => {
  describe("AutoPermissionHandler", () => {
    it("should create handler with default config", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      const config = handler.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.autoAllowConfidence).toBe(0.8);
      expect(config.autoDenyConfidence).toBe(0.2);
    });

    it("should create handler with custom config", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler(undefined, {
        enabled: false,
        autoAllowConfidence: 0.9,
        autoDenyConfidence: 0.1,
      });
      const config = handler.getConfig();
      
      expect(config.enabled).toBe(false);
      expect(config.autoAllowConfidence).toBe(0.9);
      expect(config.autoDenyConfidence).toBe(0.1);
    });

    it("should skip when disabled", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler(undefined, { enabled: false });
      
      const result = await handler.decide(createMockContext());
      
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain("disabled");
      expect(result.decision.type).toBe("ask");
    });

    it("should allow in bypass mode", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      const result = await handler.decide(createMockContext({ mode: "bypass" }));
      
      expect(result.skipped).toBe(true);
      expect(result.decision.type).toBe("allow");
    });

    it("should allow in dontAsk mode", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      const result = await handler.decide(createMockContext({ mode: "dontAsk" }));
      
      expect(result.skipped).toBe(true);
      expect(result.decision.type).toBe("allow");
    });

    it("should allow in readonly mode", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      const result = await handler.decide(createMockContext({ mode: "readonly", isReadOnly: true }));
      
      expect(result.skipped).toBe(true);
      expect(result.decision.type).toBe("allow");
    });

    it("should respect forceDecision", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      const result = await handler.decide({
        ...createMockContext(),
        forceDecision: { type: "deny", reason: "Forced" },
      });
      
      expect(result.skipped).toBe(true);
      expect(result.decision.type).toBe("deny");
    });

    it("should use classifier for default mode", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      const result = await handler.decide(createMockContext({
        tool: "ls",
        input: { path: "/tmp" },
        isReadOnly: true,
      }));
      
      expect(result.usedAutoDecision).toBe(true);
      expect(result.classifierResult).toBeDefined();
    });

    it("should auto-allow with high confidence", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler(undefined, {
        autoAllowConfidence: 0.5,
      });
      
      const result = await handler.decide(createMockContext({
        tool: "ls",
        isReadOnly: true,
      }));
      
      if (result.classifierResult && result.classifierResult.confidence >= 0.5) {
        expect(result.decision.type).toBe("allow");
      }
    });

    it("should set enabled state", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      handler.setEnabled(false);
      expect(handler.getConfig().enabled).toBe(false);
      
      handler.setEnabled(true);
      expect(handler.getConfig().enabled).toBe(true);
    });

    it("should set thresholds", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      handler.setThresholds(0.95, 0.05);
      const config = handler.getConfig();
      
      expect(config.autoAllowConfidence).toBe(0.95);
      expect(config.autoDenyConfidence).toBe(0.05);
    });

    it("should set bypass modes", async () => {
      const { AutoPermissionHandler } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      
      handler.setBypassModes(["bypass", "dontAsk"]);
      const config = handler.getConfig();
      
      expect(config.bypassModes).toContain("bypass");
      expect(config.bypassModes).toContain("dontAsk");
    });
  });

  describe("PermissionDecisionLogger", () => {
    it("should log decisions", async () => {
      const { PermissionDecisionLogger } = await import("../../backend/permissions/auto-decision.js");
      const logger = new PermissionDecisionLogger();
      
      logger.log(
        { type: "allow", reason: "Test" },
        createMockContext()
      );
      
      const decisions = logger.getDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0].type).toBe("allow");
    });

    it("should get decisions by tool", async () => {
      const { PermissionDecisionLogger } = await import("../../backend/permissions/auto-decision.js");
      const logger = new PermissionDecisionLogger();
      
      logger.log({ type: "allow", reason: "Test" }, createMockContext({ tool: "tool1" }));
      logger.log({ type: "deny", reason: "Test" }, createMockContext({ tool: "tool2" }));
      logger.log({ type: "ask", prompt: "Test?", risk: "medium" }, createMockContext({ tool: "tool1" }));
      
      const tool1Decisions = logger.getDecisionsByTool("tool1");
      expect(tool1Decisions.length).toBe(2);
      
      const tool2Decisions = logger.getDecisionsByTool("tool2");
      expect(tool2Decisions.length).toBe(1);
    });

    it("should get recent decisions", async () => {
      const { PermissionDecisionLogger } = await import("../../backend/permissions/auto-decision.js");
      const logger = new PermissionDecisionLogger();
      
      for (let i = 0; i < 10; i++) {
        logger.log({ type: "allow", reason: `Test ${i}` }, createMockContext());
      }
      
      const recent = logger.getRecentDecisions(3);
      expect(recent.length).toBe(3);
    });

    it("should clear decisions", async () => {
      const { PermissionDecisionLogger } = await import("../../backend/permissions/auto-decision.js");
      const logger = new PermissionDecisionLogger();
      
      logger.log({ type: "allow", reason: "Test" }, createMockContext());
      expect(logger.getDecisions().length).toBe(1);
      
      logger.clear();
      expect(logger.getDecisions().length).toBe(0);
    });

    it("should get stats", async () => {
      const { PermissionDecisionLogger } = await import("../../backend/permissions/auto-decision.js");
      const logger = new PermissionDecisionLogger();
      
      logger.log({ type: "allow", reason: "Test" }, createMockContext({ tool: "tool1" }));
      logger.log({ type: "allow", reason: "Test" }, createMockContext({ tool: "tool1" }));
      logger.log({ type: "deny", reason: "Test" }, createMockContext({ tool: "tool2" }));
      logger.log({ type: "ask", prompt: "Test?", risk: "medium" }, createMockContext({ tool: "tool1" }));
      
      const stats = logger.getStats();
      
      expect(stats.total).toBe(4);
      expect(stats.allowed).toBe(2);
      expect(stats.denied).toBe(1);
      expect(stats.asked).toBe(1);
      expect(stats.byTool["tool1"].allowed).toBe(2);
      expect(stats.byTool["tool1"].asked).toBe(1);
      expect(stats.byTool["tool2"].denied).toBe(1);
    });

    it("should include classifier metadata", async () => {
      const { PermissionDecisionLogger } = await import("../../backend/permissions/auto-decision.js");
      const logger = new PermissionDecisionLogger();
      
      logger.log(
        { type: "allow", reason: "Test" },
        createMockContext(),
        { decision: { type: "allow" }, confidence: 0.9, reasons: ["Safe command"] }
      );
      
      const decisions = logger.getDecisions();
      expect(decisions[0].metadata?.confidence).toBe(0.9);
      expect(decisions[0].metadata?.reasons).toContain("Safe command");
    });
  });

  describe("createCanUseTool", () => {
    it("should create canUseTool function", async () => {
      const { AutoPermissionHandler, createCanUseTool } = await import("../../backend/permissions/auto-decision.js");
      const handler = new AutoPermissionHandler();
      const canUseTool = createCanUseTool(handler);
      
      const decision = await canUseTool("test", {}, createMockContext());
      
      expect(decision.type).toBeDefined();
    });
  });

  describe("createPermissionHandlerWithLogging", () => {
    it("should create logged handler", async () => {
      const { 
        AutoPermissionHandler, 
        PermissionDecisionLogger, 
        createPermissionHandlerWithLogging 
      } = await import("../../backend/permissions/auto-decision.js");
      
      const handler = new AutoPermissionHandler();
      const logger = new PermissionDecisionLogger();
      const loggedCanUseTool = createPermissionHandlerWithLogging(handler, logger);
      
      await loggedCanUseTool("test", {}, createMockContext());
      
      expect(logger.getDecisions().length).toBe(1);
    });
  });
});
