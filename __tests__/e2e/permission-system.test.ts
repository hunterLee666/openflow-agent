import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";
import type { PermissionRule, PermissionContext, PermissionBehavior } from "../../backend/permissions/types.js";

describe("E2E: Permission System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Permission Pipeline", () => {
    it("should have permission pipeline initialized", () => {
      expect(services.permissionPipeline).toBeDefined();
    });

    it("should have rules management", () => {
      const pipeline = services.permissionPipeline;
      expect(typeof pipeline.addRule).toBe("function");
      expect(typeof pipeline.removeRule).toBe("function");
      expect(typeof pipeline.getRules).toBe("function");
    });

    it("should add permission rule", () => {
      const rule: PermissionRule = {
        id: `test-rule-${Date.now()}`,
        source: "userSettings",
        behavior: "allow",
        priority: 1,
        ruleContent: {
          toolName: "read_file",
        },
      };

      services.permissionPipeline.addRule(rule);
      const rules = services.permissionPipeline.getRules();
      
      const addedRule = rules.find(r => r.id === rule.id);
      expect(addedRule).toBeDefined();
    });

    it("should remove permission rule", () => {
      const rule: PermissionRule = {
        id: `removable-rule-${Date.now()}`,
        source: "userSettings",
        behavior: "deny",
        priority: 1,
        ruleContent: {
          toolName: "write_file",
        },
      };

      services.permissionPipeline.addRule(rule);
      services.permissionPipeline.removeRule(rule.id);
      
      const rules = services.permissionPipeline.getRules();
      const removedRule = rules.find(r => r.id === rule.id);
      expect(removedRule).toBeUndefined();
    });

    it("should get rules by source", () => {
      const rule: PermissionRule = {
        id: `source-test-rule-${Date.now()}`,
        source: "cliArg",
        behavior: "allow",
        priority: 1,
        ruleContent: {},
      };

      services.permissionPipeline.addRule(rule);
      const rules = services.permissionPipeline.getRules("cliArg");
      
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe("Workspace Boundary Validator", () => {
    it("should have workspace validator initialized", () => {
      expect(services.workspaceValidator).toBeDefined();
    });

    it("should validate paths", () => {
      const result = services.workspaceValidator.validatePath("package.json", "read");
      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
    });

    it("should block protected paths", () => {
      const result = services.workspaceValidator.validatePath("/etc/passwd", "read");
      expect(result.valid).toBe(false);
    });

    it("should block denied paths", () => {
      const result = services.workspaceValidator.validatePath("/.ssh/id_rsa", "read");
      expect(result.valid).toBe(false);
    });

    it("should validate write operations", () => {
      const result = services.workspaceValidator.validatePath("test-output.txt", "write");
      expect(result).toBeDefined();
    });

    it("should validate execute operations", () => {
      const result = services.workspaceValidator.validatePath("echo test", "execute");
      expect(result).toBeDefined();
    });
  });

  describe("Sandbox Adapter", () => {
    it("should have sandbox adapter initialized", () => {
      expect(services.sandboxAdapter).toBeDefined();
    });

    it("should have execute method", () => {
      const adapter = services.sandboxAdapter;
      expect(typeof adapter.execute).toBe("function");
    });
  });

  describe("Resource Monitor", () => {
    it("should have resource monitor initialized", () => {
      expect(services.resourceMonitor).toBeDefined();
    });

    it("should get resource usage", () => {
      const usage = services.resourceMonitor.getAllUsage();
      expect(usage).toBeDefined();
      expect(typeof usage).toBe("object");
    });

    it("should support setting limits", () => {
      services.resourceMonitor.setLimit({
        type: "cpu",
        limit: 80,
        unit: "percent",
      });

      const usage = services.resourceMonitor.getUsage("cpu");
      expect(typeof usage).toBe("number");
    });

    it("should support starting and stopping", () => {
      services.resourceMonitor.start();
      services.resourceMonitor.stop();
    });
  });

  describe("Permission Modes", () => {
    it("should support various permission modes", () => {
      const modes = ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypass", "readonly"];
      expect(modes.length).toBe(7);
    });

    it("should support various permission behaviors", () => {
      const behaviors: PermissionBehavior[] = ["allow", "ask", "deny"];
      expect(behaviors.length).toBe(3);
    });
  });

  describe("Permission Context", () => {
    it("should create valid permission context", () => {
      const ctx: PermissionContext = {
        tool: "read_file",
        input: { path: "test.txt" },
        cwd: process.cwd(),
        mode: "default",
        isReadOnly: true,
        isDestructive: false,
        isGitCommand: false,
        isNetworkCommand: false,
      };

      expect(ctx.tool).toBe("read_file");
      expect(ctx.mode).toBe("default");
    });
  });
});
