import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginHotReloader } from "../../../refactored/core/plugins/hot-reloader.js";
import { PluginRegistry } from "../../../refactored/core/plugins/plugin-registry.js";
import type { CapabilityPlugin, CapabilityContext } from "../../../refactored/core/types/index.js";
import { ModelRouter, routeToModel, analyzeTaskComplexity } from "../../../refactored/core/llm/model-router.js";
import { SemanticMemory } from "../../../refactored/core/memory/semantic-memory.js";
import { ProceduralMemory } from "../../../refactored/core/memory/procedural-memory.js";
import { ClaudeCodeConfigAdapter, MODEL_ALIASES } from "../../../refactored/core/adapters/llm-config-adapter.js";
import { LLMConfigManager } from "../../../refactored/core/llm/config-manager.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

describe("Plugin Hot Reloader", () => {
  let hotReloader: PluginHotReloader;

  beforeEach(() => {
    hotReloader = new PluginHotReloader({ debounceMs: 100 });
  });

  it("should initialize with default config", () => {
    expect(hotReloader).toBeDefined();
  });

  it("should add watch directory", () => {
    hotReloader.addWatchDir("/tmp/plugins");
    const plugins = hotReloader.getAllCachedPlugins();
    expect(plugins).toBeDefined();
  });

  it("should validate plugin path", () => {
    const validPath = hotReloader.validatePluginPath("/base", "subdir/plugin.json");
    expect(validPath).toBe("/base/subdir/plugin.json");

    expect(() => {
      hotReloader.validatePluginPath("/base", "../../etc/passwd");
    }).toThrow("Path traversal detected");
  });

  it("should clear cache", () => {
    hotReloader.clearCache();
    const plugins = hotReloader.getAllCachedPlugins();
    expect(plugins.length).toBe(0);
  });
});

describe("Plugin Registry", () => {
  let registry: PluginRegistry;
  let mockContext: CapabilityContext;

  beforeEach(() => {
    mockContext = {
      llm: {} as any,
      tools: {
        register: () => {},
        unregister: () => {},
        get: () => undefined,
        list: () => [],
        call: async () => ({}),
      },
      memory: {} as any,
      state: {} as any,
      security: {} as any,
      telemetry: {} as any,
      workspace: {} as any,
      emit: () => {},
      on: () => {},
      once: () => {},
      off: () => {},
    };

    registry = new PluginRegistry(mockContext);
  });

  it("should register plugin", async () => {
    const mockPlugin: CapabilityPlugin = {
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        type: "tool" as any,
        description: "Test plugin",
      },
      activate: async () => {},
    };

    await registry.register(mockPlugin);
    expect(registry.has("test-plugin")).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it("should unregister plugin", async () => {
    const mockPlugin: CapabilityPlugin = {
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        type: "tool" as any,
        description: "Test plugin",
      },
      activate: async () => {},
      deactivate: async () => {},
    };

    await registry.register(mockPlugin);
    await registry.unregister("test-plugin");
    expect(registry.has("test-plugin")).toBe(false);
  });

  it("should enable and disable plugin", async () => {
    const mockPlugin: CapabilityPlugin = {
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        type: "tool" as any,
        description: "Test plugin",
      },
      activate: async () => {},
    };

    await registry.register(mockPlugin);
    expect(registry.isEnabled("test-plugin")).toBe(true);

    registry.disable("test-plugin");
    expect(registry.isEnabled("test-plugin")).toBe(false);

    registry.enable("test-plugin");
    expect(registry.isEnabled("test-plugin")).toBe(true);
  });

  it("should get all enabled plugins", async () => {
    const plugin1: CapabilityPlugin = {
      manifest: {
        name: "plugin-1",
        version: "1.0.0",
        type: "tool" as any,
        description: "Plugin 1",
      },
      activate: async () => {},
    };

    const plugin2: CapabilityPlugin = {
      manifest: {
        name: "plugin-2",
        version: "1.0.0",
        type: "tool" as any,
        description: "Plugin 2",
      },
      activate: async () => {},
    };

    await registry.register(plugin1);
    await registry.register(plugin2);
    registry.disable("plugin-2");

    const enabled = registry.getAll();
    expect(enabled.length).toBe(1);
    expect(enabled[0].manifest.name).toBe("plugin-1");
  });
});

describe("Model Router", () => {
  const mockProviders = {
    anthropic: {
      name: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "test-key",
      defaultModel: "claude-sonnet-4-20250514",
      supportedModels: ["claude-sonnet-4-20250514"],
      supportsStreaming: true,
      requiresThinkingFlag: false,
      costPer1kInput: 0.015,
      costPer1kOutput: 0.075,
      maxTokens: 8192,
      contextWindow: 200000,
    },
    openai: {
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      defaultModel: "gpt-4o",
      supportedModels: ["gpt-4o"],
      supportsStreaming: true,
      requiresThinkingFlag: false,
      costPer1kInput: 0.01,
      costPer1kOutput: 0.03,
      maxTokens: 16384,
      contextWindow: 128000,
    },
    deepseek: {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "test-key",
      defaultModel: "deepseek-chat",
      supportedModels: ["deepseek-chat"],
      supportsStreaming: true,
      requiresThinkingFlag: false,
      costPer1kInput: 0.001,
      costPer1kOutput: 0.002,
      maxTokens: 8192,
      contextWindow: 64000,
    },
  };

  it("should analyze simple task", () => {
    const complexity = analyzeTaskComplexity("Hello");
    expect(complexity.type).toBe("simple");
  });

  it("should analyze complex task", () => {
    const complexity = analyzeTaskComplexity(
      "Analyze and explain the following code in detail, comparing different approaches and evaluating their performance characteristics. async function test() { const x = 1; const y = 2; return x + y; } class Example { constructor() {} } export default Example;"
    );
    expect(complexity.type).toBe("complex");
    expect(complexity.requiresReasoning).toBe(true);
  });

  it("should route simple task to cost-effective model", () => {
    const route = routeToModel("Hello", mockProviders);
    expect(route.provider).toBe("deepseek");
    expect(route.model).toBe("deepseek-chat");
  });

  it("should route complex task to high-performance model", () => {
    const route = routeToModel(
      "Analyze and explain the following code in detail, comparing different approaches and evaluating their performance characteristics. async function test() { const x = 1; const y = 2; return x + y; } class Example { constructor() {} } export default Example;",
      mockProviders
    );
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-sonnet-4-20250514");
  });

  it("should create model router", () => {
    const router = new ModelRouter(mockProviders, { budgetUsd: 5 });
    expect(router.getBudgetRemaining()).toBe(5);
    expect(router.isBudgetExceeded()).toBe(false);
  });

  it("should switch provider", () => {
    const router = new ModelRouter(mockProviders);
    router.switchProvider("openai", "gpt-4o");
    expect(router.getCurrentProvider()).toBe("openai");
    expect(router.getCurrentModel()).toBe("gpt-4o");
  });
});

describe("Semantic Memory", () => {
  let semanticMemory: SemanticMemory;

  beforeEach(() => {
    semanticMemory = new SemanticMemory(100);
  });

  it("should add entry", async () => {
    await semanticMemory.add({
      id: "entry-1",
      content: "Test content",
      tags: ["test", "example"],
      importance: 0.8,
      createdAt: Date.now(),
    });

    expect(semanticMemory.size()).toBe(1);
  });

  it("should get entry", async () => {
    await semanticMemory.add({
      id: "entry-1",
      content: "Test content",
      tags: ["test"],
      importance: 0.8,
      createdAt: Date.now(),
    });

    const entry = await semanticMemory.get("entry-1");
    expect(entry).not.toBeNull();
    expect(entry!.content).toBe("Test content");
  });

  it("should search by tags", async () => {
    await semanticMemory.add({
      id: "entry-1",
      content: "Content 1",
      tags: ["test", "important"],
      importance: 0.9,
      createdAt: Date.now(),
    });

    await semanticMemory.add({
      id: "entry-2",
      content: "Content 2",
      tags: ["test", "example"],
      importance: 0.5,
      createdAt: Date.now(),
    });

    const results = await semanticMemory.searchByTags(["test"], 10);
    expect(results.length).toBe(2);
    expect(results[0].importance).toBe(0.9);
  });

  it("should delete entry", async () => {
    await semanticMemory.add({
      id: "entry-1",
      content: "Test content",
      tags: ["test"],
      importance: 0.8,
      createdAt: Date.now(),
    });

    const deleted = await semanticMemory.delete("entry-1");
    expect(deleted).toBe(true);
    expect(semanticMemory.size()).toBe(0);
  });

  it("should get stats", async () => {
    await semanticMemory.add({
      id: "entry-1",
      content: "Content 1",
      tags: ["test"],
      importance: 0.8,
      createdAt: Date.now(),
    });

    const stats = semanticMemory.getStats();
    expect(stats.total).toBe(1);
    expect(stats.avgImportance).toBe(0.8);
  });
});

describe("Procedural Memory", () => {
  let proceduralMemory: ProceduralMemory;

  beforeEach(() => {
    proceduralMemory = new ProceduralMemory(100);
  });

  it("should learn skill", async () => {
    await proceduralMemory.learnSkill({
      id: "skill-1",
      skillName: "code-review",
      description: "Review code quality",
      steps: [
        { order: 1, action: "Read code" },
        { order: 2, action: "Check style" },
      ],
    });

    expect(proceduralMemory.size()).toBe(1);
  });

  it("should record execution", async () => {
    await proceduralMemory.learnSkill({
      id: "code-review",
      skillName: "code-review",
      description: "Review code quality",
      steps: [{ order: 1, action: "Read code" }],
    });

    await proceduralMemory.recordExecution({
      skillName: "code-review",
      success: true,
      duration: 1000,
      timestamp: Date.now(),
    });

    const stats = proceduralMemory.getSkillStats("code-review");
    expect(stats).not.toBeNull();
    expect(stats!.successRate).toBe(1);
    expect(stats!.totalExecutions).toBe(1);
  });

  it("should get top skills", async () => {
    await proceduralMemory.learnSkill({
      id: "skill-1",
      skillName: "code-review",
      description: "Review code",
      steps: [{ order: 1, action: "Read code" }],
    });

    await proceduralMemory.learnSkill({
      id: "skill-2",
      skillName: "test",
      description: "Write tests",
      steps: [{ order: 1, action: "Write test" }],
    });

    await proceduralMemory.recordExecution({
      skillName: "code-review",
      success: true,
      duration: 1000,
      timestamp: Date.now(),
    });

    const topSkills = await proceduralMemory.getTopSkills(5);
    expect(topSkills.length).toBe(2);
  });

  it("should delete skill", async () => {
    await proceduralMemory.learnSkill({
      id: "skill-1",
      skillName: "code-review",
      description: "Review code",
      steps: [{ order: 1, action: "Read code" }],
    });

    const deleted = await proceduralMemory.deleteSkill("skill-1");
    expect(deleted).toBe(true);
    expect(proceduralMemory.size()).toBe(0);
  });

  it("should get stats", async () => {
    await proceduralMemory.learnSkill({
      id: "skill-1",
      skillName: "code-review",
      description: "Review code",
      steps: [{ order: 1, action: "Read code" }],
    });

    const stats = proceduralMemory.getStats();
    expect(stats.totalSkills).toBe(1);
    expect(stats.avgConfidence).toBe(0.5);
  });
});

describe("Claude Code Config Adapter", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-claude-config");
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should resolve model aliases", () => {
    const adapter = new ClaudeCodeConfigAdapter(testDir);
    expect(adapter.resolveModelAlias("sonnet")).toBe("claude-sonnet-4-20250514");
    expect(adapter.resolveModelAlias("opus")).toBe("claude-opus-4-5-20250514");
    expect(adapter.resolveModelAlias("haiku")).toBe("claude-3-haiku-20240307");
    expect(adapter.resolveModelAlias("custom-model")).toBe("custom-model");
  });

  it("should resolve [1m] suffix aliases", () => {
    const adapter = new ClaudeCodeConfigAdapter(testDir);
    expect(adapter.resolveModelAlias("sonnet[1m]")).toBe("claude-sonnet-4-20250514");
    expect(adapter.resolveModelAlias("opus[1m]")).toBe("claude-opus-4-5-20250514");
  });

  it("should load and merge configs from .openflow and .claude folders", async () => {
    const openflowDir = join(testDir, ".openflow");
    const claudeDir = join(testDir, ".claude");
    await mkdir(openflowDir, { recursive: true });
    await mkdir(claudeDir, { recursive: true });

    await writeFile(
      join(openflowDir, "settings.json"),
      JSON.stringify({
        model: "sonnet",
        modelOverrides: {
          "claude-sonnet-4-20250514": "custom-sonnet-deployment",
        },
        availableModels: ["sonnet", "haiku"],
      })
    );

    await writeFile(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        model: "opus",
        modelOverrides: {
          "claude-opus-4-5-20250514": "custom-opus-deployment",
        },
        availableModels: ["opus", "sonnet"],
      })
    );

    const adapter = new ClaudeCodeConfigAdapter(testDir);
    const mergedConfig = await adapter.load();

    expect(mergedConfig).not.toBeNull();
    expect(mergedConfig!.model).toBe("sonnet");
    expect(mergedConfig!.modelOverrides["claude-sonnet-4-20250514"]).toBe("custom-sonnet-deployment");
    expect(mergedConfig!.modelOverrides["claude-opus-4-5-20250514"]).toBe("custom-opus-deployment");
    expect(mergedConfig!.availableModels).toContain("sonnet");
    expect(mergedConfig!.availableModels).toContain("haiku");
    expect(mergedConfig!.availableModels).toContain("opus");
  });

  it("should validate model against availableModels", async () => {
    const openflowDir = join(testDir, ".openflow");
    await mkdir(openflowDir, { recursive: true });

    await writeFile(
      join(openflowDir, "settings.json"),
      JSON.stringify({
        availableModels: ["sonnet", "haiku"],
      })
    );

    const adapter = new ClaudeCodeConfigAdapter(testDir);
    await adapter.load();

    expect(adapter.isModelAllowed("sonnet")).toBe(true);
    expect(adapter.isModelAllowed("haiku")).toBe(true);
    expect(adapter.isModelAllowed("opus")).toBe(false);

    const validation = adapter.validateModel("opus");
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("not in the allowed models list");
  });

  it("should resolve model with overrides", async () => {
    const openflowDir = join(testDir, ".openflow");
    await mkdir(openflowDir, { recursive: true });

    await writeFile(
      join(openflowDir, "settings.json"),
      JSON.stringify({
        modelOverrides: {
          "claude-sonnet-4-20250514": "bedrock-sonnet-arn",
        },
      })
    );

    const adapter = new ClaudeCodeConfigAdapter(testDir);
    await adapter.load();

    const resolved = adapter.resolveModelWithOverrides("sonnet");
    expect(resolved).toBe("bedrock-sonnet-arn");
  });

  it("should get effective env with environment variables", async () => {
    const adapter = new ClaudeCodeConfigAdapter(testDir);
    const env = adapter.getEffectiveEnv();

    expect(env).toBeDefined();
  });
});

describe("LLM Config Manager with Claude Code Compatibility", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-llm-config");
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should initialize with default config", async () => {
    const manager = new LLMConfigManager(testDir, "llm-config.json", testDir);
    await manager.initialize();

    expect(manager.hasProvider("anthropic")).toBe(true);
    expect(manager.hasProvider("openai")).toBe(true);
    expect(manager.hasProvider("deepseek")).toBe(true);
  });

  it("should set and get model aliases", async () => {
    const manager = new LLMConfigManager(testDir, "llm-config.json", testDir);
    await manager.initialize();

    await manager.setModelAlias("fast", "haiku");
    expect(manager.getModelAliases()["fast"]).toBe("haiku");

    const resolved = manager.resolveModelAlias("fast");
    expect(resolved).toBe("haiku");
  });

  it("should set and get model overrides", async () => {
    const manager = new LLMConfigManager(testDir, "llm-config.json", testDir);
    await manager.initialize();

    await manager.setModelOverride("claude-sonnet-4-20250514", "custom-deployment");
    expect(manager.getModelOverrides()["claude-sonnet-4-20250514"]).toBe("custom-deployment");

    const resolved = manager.resolveModelWithOverrides("claude-sonnet-4-20250514");
    expect(resolved).toBe("custom-deployment");
  });

  it("should set and validate available models", async () => {
    const manager = new LLMConfigManager(testDir, "llm-config.json", testDir);
    await manager.initialize();

    await manager.setAvailableModels(["sonnet", "haiku"]);
    expect(manager.getAvailableModels()).toEqual(["sonnet", "haiku"]);

    expect(manager.isModelAllowed("sonnet")).toBe(true);
    expect(manager.isModelAllowed("opus")).toBe(false);

    const validation = manager.validateModel("opus");
    expect(validation.valid).toBe(false);
  });

  it("should merge Claude Code config with LLM config", async () => {
    const openflowDir = join(testDir, ".openflow");
    await mkdir(openflowDir, { recursive: true });

    await writeFile(
      join(openflowDir, "settings.json"),
      JSON.stringify({
        model: "sonnet",
        env: {
          ANTHROPIC_API_KEY: "test-api-key",
        },
      })
    );

    const manager = new LLMConfigManager(testDir, "llm-config.json", testDir);
    await manager.initialize();

    const config = manager.getConfig();
    expect(config.defaultModel).toBe("claude-sonnet-4-20250514");
    expect(config.providers.anthropic.apiKey).toBe("test-api-key");
  });
});
