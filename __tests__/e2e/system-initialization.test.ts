import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { initializeSystemServices, getSystemServices, createIntegratedQueryContext } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: System Initialization", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Core Services", () => {
    it("should initialize tool registry", () => {
      expect(services.toolRegistry).toBeDefined();
      expect(services.enhancedToolRegistry).toBeDefined();
      expect(services.streamingToolExecutor).toBeDefined();
    });

    it("should have default tools registered", () => {
      const tools = services.toolRegistry.list();
      expect(tools.length).toBeGreaterThan(0);
    });

    it("should initialize session store", () => {
      expect(services.sessionStore).toBeDefined();
    });

    it("should initialize telemetry", () => {
      expect(services.telemetry).toBeDefined();
      expect(services.telemetryCollector).toBeDefined();
      expect(services.perfettoTracer).toBeDefined();
    });

    it("should initialize memory system", () => {
      expect(services.memorySystem).toBeDefined();
      expect(services.dualModelRetriever).toBeDefined();
      expect(services.consolidationManager).toBeDefined();
    });

    it("should initialize hook registry", () => {
      expect(services.hookRegistry).toBeDefined();
    });

    it("should initialize prompt cache", () => {
      expect(services.promptCache).toBeDefined();
    });

    it("should initialize command registry with builtin commands", () => {
      expect(services.commandRegistry).toBeDefined();
      const commands = services.commandRegistry.list();
      expect(commands.length).toBeGreaterThan(0);
    });
  });

  describe("Security Services", () => {
    it("should initialize workspace validator", () => {
      expect(services.workspaceValidator).toBeDefined();
    });

    it("should initialize permission pipeline", () => {
      expect(services.permissionPipeline).toBeDefined();
    });

    it("should initialize sandbox adapter", () => {
      expect(services.sandboxAdapter).toBeDefined();
    });

    it("should initialize resource monitor", () => {
      expect(services.resourceMonitor).toBeDefined();
    });
  });

  describe("Configuration Services", () => {
    it("should initialize settings loader", () => {
      expect(services.settingsLoader).toBeDefined();
    });

    it("should initialize config manager", () => {
      expect(services.configManager).toBeDefined();
    });

    it("should initialize memory truncator", () => {
      expect(services.memoryTruncator).toBeDefined();
    });
  });

  describe("Agent Services", () => {
    it("should initialize ACP agent", () => {
      expect(services.acpAgent).toBeDefined();
    });

    it("should initialize task agent registry", () => {
      expect(services.taskAgentRegistry).toBeDefined();
    });

    it("should initialize message broker", () => {
      expect(services.messageBroker).toBeDefined();
    });

    it("should initialize coordinator", () => {
      expect(services.coordinator).toBeDefined();
    });

    it("should initialize sub-agent cache", () => {
      expect(services.subAgentCache).toBeDefined();
    });

    it("should initialize recursion guard", () => {
      expect(services.recursionGuard).toBeDefined();
    });
  });

  describe("Resilience Services", () => {
    it("should initialize error handler", () => {
      expect(services.errorHandler).toBeDefined();
    });

    it("should initialize error recovery manager", () => {
      expect(services.errorRecoveryManager).toBeDefined();
    });

    it("should initialize circuit breaker", () => {
      expect(services.circuitBreaker).toBeDefined();
    });
  });

  describe("Task Management", () => {
    it("should initialize task state machine", () => {
      expect(services.taskStateMachine).toBeDefined();
    });

    it("should initialize progress tracker", () => {
      expect(services.progressTracker).toBeDefined();
      expect(services.multiTaskTracker).toBeDefined();
    });
  });

  describe("Skills and Plugins", () => {
    it("should initialize skill registry with builtin skills", () => {
      expect(services.skillRegistry).toBeDefined();
      const skills = services.skillRegistry.list();
      expect(skills.length).toBeGreaterThan(0);
    });

    it("should load plugins", () => {
      expect(services.loadedPlugins).toBeDefined();
    });
  });

  describe("Special Modes", () => {
    it("should initialize undercover mode", () => {
      expect(services.undercoverMode).toBeDefined();
    });

    it("should initialize buddy mode", () => {
      expect(services.buddy).toBeDefined();
    });

    it("should initialize deep planner", () => {
      expect(services.deepPlanner).toBeDefined();
    });

    it("should initialize easter egg manager", () => {
      expect(services.easterEggManager).toBeDefined();
    });

    it("should initialize prefetcher", () => {
      expect(services.prefetcher).toBeDefined();
    });
  });

  describe("Integration Services", () => {
    it("should initialize verification agent", () => {
      expect(services.verificationAgent).toBeDefined();
    });

    it("should initialize diff renderer", () => {
      expect(services.diffRenderer).toBeDefined();
    });

    it("should initialize MCP service discovery", () => {
      expect(services.mcpServiceDiscovery).toBeDefined();
    });

    it("should initialize side effect synchronizer", () => {
      expect(services.sideEffectSynchronizer).toBeDefined();
    });
  });

  describe("Dependency Injection", () => {
    it("should initialize DI container", () => {
      expect(services.diContainer).toBeDefined();
    });

    it("should initialize query context factory", () => {
      expect(services.queryContextFactory).toBeDefined();
    });

    it("should have registered core services in DI container", () => {
      const tools = services.diContainer.get("tools");
      expect(tools).toBeDefined();
    });
  });

  describe("Query Context Creation", () => {
    it("should create integrated query context", async () => {
      const abortController = new AbortController();
      const ctx = await createIntegratedQueryContext(abortController);
      
      expect(ctx).toBeDefined();
      expect(ctx.session).toBeDefined();
      expect(ctx.config).toBeDefined();
      expect(ctx.toolRegistry).toBeDefined();
      expect(ctx.memory).toBeDefined();
      expect(ctx.hooks).toBeDefined();
      expect(ctx.abortSignal).toBeDefined();
    });
  });

  describe("Singleton Pattern", () => {
    it("should return same instance on multiple calls", async () => {
      const services1 = getSystemServices();
      const services2 = getSystemServices();
      
      expect(services1).toBe(services2);
    });
  });
});
