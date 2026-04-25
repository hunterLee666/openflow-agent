import { describe, it, expect } from "bun:test";

describe("Module Import Tests", () => {
  describe("Backend Core Modules", () => {
    it("should import backend/index.ts", async () => {
      const backend = await import("../../backend/index.js");
      expect(backend).toBeDefined();
    });

    it("should import core/query-engine", async () => {
      const core = await import("../../backend/core/query-engine.js");
      expect(core.query).toBeDefined();
      expect(typeof core.query).toBe("function");
    });

    it("should import types/ids", async () => {
      const ids = await import("../../backend/types/ids.js");
      expect(ids.createSessionId).toBeDefined();
      expect(ids.createMessageId).toBeDefined();
      expect(ids.createTaskId).toBeDefined();
      expect(ids.createAgentId).toBeDefined();
    });
  });

  describe("Backend Services", () => {
    it("should import services/mcp", async () => {
      const mcp = await import("../../backend/services/mcp/index.js");
      expect(mcp.McpServer).toBeDefined();
      expect(mcp.EnhancedMCPClient).toBeDefined();
    });

    it("should import services/bridge", async () => {
      const bridge = await import("../../backend/services/bridge/index.js");
      expect(bridge.BridgeClient).toBeDefined();
      expect(bridge.JsonRpcBridgeServer).toBeDefined();
      expect(bridge.generateBridgeToken).toBeDefined();
    });

    it("should import services/lsp", async () => {
      const lsp = await import("../../backend/services/lsp/index.js");
      expect(lsp.GenericLspClient).toBeDefined();
      expect(lsp.detectLspForProject).toBeDefined();
    });

    it("should import services/ide", async () => {
      const ide = await import("../../backend/services/ide/index.js");
      expect(ide.BaseIDEClient).toBeDefined();
      expect(ide.detectIDE).toBeDefined();
      expect(ide.createIDEClient).toBeDefined();
    });

    it("should import services/transport", async () => {
      const transport = await import("../../backend/services/transport/index.js");
      expect(transport.BaseTransport).toBeDefined();
      expect(transport.createTransport).toBeDefined();
    });

    it("should import services/cache", async () => {
      const cache = await import("../../backend/services/cache/index.js");
      expect(cache.DefaultPromptCache).toBeDefined();
    });

    it("should import services/telemetry", async () => {
      const telemetry = await import("../../backend/services/telemetry/index.js");
      expect(telemetry.DefaultTelemetryCollector).toBeDefined();
      expect(telemetry.DefaultPerfettoTracer).toBeDefined();
    });
  });

  describe("Backend Agent Modules", () => {
    it("should import agent/index", async () => {
      const agent = await import("../../backend/agent/index.js");
      expect(agent.TaskAgentRegistry).toBeDefined();
      expect(agent.createTaskAgent).toBeDefined();
    });

    it("should import agent/cache", async () => {
      const cache = await import("../../backend/agent/cache/index.js");
      expect(cache.DefaultSubAgentCache).toBeDefined();
      expect(cache.DefaultRecursionGuard).toBeDefined();
      expect(cache.buildForkKey).toBeDefined();
    });

    it("should import agent/coordinator", async () => {
      const coordinator = await import("../../backend/agent/coordinator/index.js");
      expect(coordinator.DefaultCoordinator).toBeDefined();
      expect(coordinator.isCoordinatorMode).toBeDefined();
    });

    it("should import agent/routing", async () => {
      const routing = await import("../../backend/agent/routing/index.js");
      expect(routing.MessageBroker).toBeDefined();
      expect(routing.createMessageBroker).toBeDefined();
    });

    it("should import agent/swarm", async () => {
      const swarm = await import("../../backend/agent/swarm/index.js");
      expect(swarm.SwarmOrchestrator).toBeDefined();
      expect(swarm.createSwarmOrchestrator).toBeDefined();
    });
  });

  describe("Backend Security", () => {
    it("should import security/sandbox", async () => {
      const sandbox = await import("../../backend/security/sandbox.js");
      expect(sandbox.createSandboxAdapter).toBeDefined();
      expect(sandbox.BubblewrapAdapter).toBeDefined();
      expect(sandbox.SandboxExecAdapter).toBeDefined();
    });

    it("should import security/workspace-boundary", async () => {
      const boundary = await import("../../backend/security/workspace-boundary.js");
      expect(boundary.WorkspaceBoundaryValidator).toBeDefined();
    });
  });

  describe("Backend Tools", () => {
    it("should import tools/registry", async () => {
      const registry = await import("../../backend/tools/registry.js");
      expect(registry.DefaultToolRegistry).toBeDefined();
    });

    it("should import tools/index", async () => {
      const tools = await import("../../backend/tools/index.js");
      expect(tools.EnhancedToolRegistry).toBeDefined();
      expect(tools.StreamingToolExecutor).toBeDefined();
    });
  });

  describe("Backend Memory", () => {
    it("should import memory/index", async () => {
      const memory = await import("../../backend/memory/index.js");
      expect(memory.DefaultMemorySystem).toBeDefined();
      expect(memory.DualModelRetriever).toBeDefined();
    });
  });

  describe("Backend Config", () => {
    it("should import config/index", async () => {
      const config = await import("../../backend/config/index.js");
      expect(config.SettingsLoader).toBeDefined();
      expect(config.LayeredConfigManager).toBeDefined();
    });
  });

  describe("Backend Permissions", () => {
    it("should import permissions/index", async () => {
      const permissions = await import("../../backend/permissions/index.js");
      expect(permissions.createPermissionPipeline).toBeDefined();
    });
  });

  describe("Backend Hooks", () => {
    it("should import hooks/index", async () => {
      const hooks = await import("../../backend/hooks/index.js");
      expect(hooks.DefaultHookRegistry).toBeDefined();
    });
  });

  describe("Backend Commands", () => {
    it("should import commands/index", async () => {
      const commands = await import("../../backend/commands/index.js");
      expect(commands.DefaultCommandRegistry).toBeDefined();
      expect(commands.createBuiltinCommands).toBeDefined();
    });
  });

  describe("Backend Skills", () => {
    it("should import skills/index", async () => {
      const skills = await import("../../backend/skills/index.js");
      expect(skills.DefaultSkillRegistry).toBeDefined();
      expect(skills.loadBuiltinSkills).toBeDefined();
    });
  });

  describe("Backend Plugins", () => {
    it("should import plugins/index", async () => {
      const plugins = await import("../../backend/plugins/index.js");
      expect(plugins.loadAllPlugins).toBeDefined();
      expect(plugins.getBuiltinPlugins).toBeDefined();
    });
  });

  describe("Backend Modes", () => {
    it("should import modes/undercover", async () => {
      const undercover = await import("../../backend/modes/undercover.js");
      expect(undercover.UndercoverMode).toBeDefined();
      expect(undercover.createUndercoverMode).toBeDefined();
    });

    it("should import modes/buddy", async () => {
      const buddy = await import("../../backend/modes/buddy.js");
      expect(buddy.Buddy).toBeDefined();
      expect(buddy.createBuddy).toBeDefined();
    });
  });

  describe("Backend Error Handling", () => {
    it("should import error/index", async () => {
      const error = await import("../../backend/error/index.js");
      expect(error.ErrorHandler).toBeDefined();
      expect(error.ErrorCatalog).toBeDefined();
    });
  });

  describe("Backend Resilience", () => {
    it("should import resilience/index", async () => {
      const resilience = await import("../../backend/resilience/index.js");
      expect(resilience.CircuitBreaker).toBeDefined();
      expect(resilience.retry).toBeDefined();
    });
  });

  describe("Backend Task Management", () => {
    it("should import task/index", async () => {
      const task = await import("../../backend/task/index.js");
      expect(task.TaskStateMachine).toBeDefined();
      expect(task.ProgressTracker).toBeDefined();
    });
  });

  describe("Backend Utils", () => {
    it("should import utils/index", async () => {
      const utils = await import("../../backend/utils/index.js");
      expect(utils).toBeDefined();
    });
  });

  describe("Backend Diff", () => {
    it("should import diff/index", async () => {
      const diff = await import("../../backend/diff/index.js");
      expect(diff.computeDiff).toBeDefined();
      expect(diff.TerminalDiffRenderer).toBeDefined();
    });
  });

  describe("Backend Verification", () => {
    it("should import verification/index", async () => {
      const verification = await import("../../backend/verification/index.js");
      expect(verification.DefaultVerificationAgent).toBeDefined();
    });
  });

  describe("Backend DI", () => {
    it("should import di/index", async () => {
      const di = await import("../../backend/di/index.js");
      expect(di.DIContainer).toBeDefined();
      expect(di.createDefaultContainer).toBeDefined();
    });
  });

  describe("Backend Flags", () => {
    it("should import flags/index", async () => {
      const flags = await import("../../backend/flags/index.js");
      expect(flags.DefaultFeatureFlagRegistry).toBeDefined();
    });
  });

  describe("Backend Kairos", () => {
    it("should import kairos/index", async () => {
      const kairos = await import("../../backend/kairos/index.js");
      expect(kairos.DefaultKairosEngine).toBeDefined();
    });
  });

  describe("Frontend TUI", () => {
    it("should import frontend/tui/index", async () => {
      const tui = await import("../../frontend/tui/index.js");
      expect(tui).toBeDefined();
    });

    it("should import frontend/tui/components/Box", async () => {
      const Box = await import("../../frontend/tui/components/Box.js");
      expect(Box.Box).toBeDefined();
    });

    it("should import frontend/tui/components/Text", async () => {
      const Text = await import("../../frontend/tui/components/Text.js");
      expect(Text.Text).toBeDefined();
    });

    it("should import frontend/tui/hooks/useInput", async () => {
      const useInput = await import("../../frontend/tui/hooks/useInput.js");
      expect(useInput.useInput).toBeDefined();
    });
  });

  describe("Integration Layer", () => {
    it("should import integration/index", async () => {
      const integration = await import("../../backend/integration/index.js");
      expect(integration.initializeSystemServices).toBeDefined();
      expect(integration.createIntegratedQueryContext).toBeDefined();
    });
  });
});
