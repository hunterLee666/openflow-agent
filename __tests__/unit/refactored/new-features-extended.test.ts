import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  PluginLoader,
  PluginHookRegistry,
  McpServerManager,
  SubAgentSystem,
  SkillRegistry,
  ContextFileDiscovery,
  CheckpointSystem,
  ProviderRouter,
  PersistentMemory,
  TaskScheduler,
  createMultimediaTools,
  TOOL_GROUPS,
  TOOL_PROFILES,
  resolveToolProfile,
} from "../../../refactored/core/index.js";

describe("Plugin System - PluginLoader", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-plugin-loader");
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should find plugin directories", async () => {
    const pluginDir = join(testDir, ".openflow-plugins");
    await mkdir(pluginDir, { recursive: true });

    const loader = new PluginLoader();
    const dirs = await loader.findPluginDirs(testDir);

    expect(dirs.length).toBeGreaterThan(0);
  });

  it("should load plugin with manifest", async () => {
    const pluginDir = join(testDir, ".openflow-plugins", "test-plugin");
    await mkdir(pluginDir, { recursive: true });

    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        name: "test-plugin",
        version: "1.0.0",
        description: "Test plugin",
        components: [],
      })
    );

    const loader = new PluginLoader();
    const plugins = await loader.loadPluginsFromDir(join(testDir, ".openflow-plugins"));

    expect(plugins.length).toBe(1);
    expect(plugins[0].name).toBe("test-plugin");
    expect(plugins[0].version).toBe("1.0.0");
  });

  it("should load plugin with command component", async () => {
    const pluginDir = join(testDir, ".openflow-plugins", "cmd-plugin");
    await mkdir(pluginDir, { recursive: true });

    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        name: "cmd-plugin",
        version: "1.0.0",
        description: "Command plugin",
        components: [
          {
            type: "command",
            name: "my-command",
            description: "My command",
            handler: "command.js",
          },
        ],
      })
    );

    await writeFile(
      join(pluginDir, "command.js"),
      `export const handler = async (ctx) => ({ success: true, output: "Command executed" });`
    );

    const loader = new PluginLoader();
    const plugins = await loader.loadPluginsFromDir(join(testDir, ".openflow-plugins"));

    expect(plugins.length).toBe(1);
    expect(plugins[0].components.length).toBe(1);
    expect(plugins[0].components[0].type).toBe("command");
  });
});

describe("Plugin System - PluginHookRegistry", () => {
  let registry: PluginHookRegistry;

  beforeEach(() => {
    registry = new PluginHookRegistry({} as any);
  });

  it("should initialize", () => {
    expect(registry).toBeDefined();
  });

  it("should get registered hooks", () => {
    const hooks = registry.getRegisteredHooks();
    expect(hooks.size).toBe(0);
  });
});

describe("Plugin System - McpServerManager", () => {
  let manager: McpServerManager;

  beforeEach(() => {
    manager = new McpServerManager();
  });

  it("should get connection", () => {
    const conn = manager.getConnection("non-existent");
    expect(conn).toBeUndefined();
  });

  it("should get all connections", () => {
    const conns = manager.getAllConnections();
    expect(conns.size).toBe(0);
  });

  it("should get tools for server", () => {
    const tools = manager.getTools("non-existent");
    expect(tools).toEqual([]);
  });

  it("should get resources for server", () => {
    const resources = manager.getResources("non-existent");
    expect(resources).toEqual([]);
  });
});

describe("Sub-Agent System", () => {
  let subAgentSystem: SubAgentSystem;

  beforeEach(() => {
    subAgentSystem = new SubAgentSystem({
      maxConcurrency: 2,
      defaultTimeout: 5000,
      defaultMaxTurns: 5,
    });
  });

  it("should initialize with config", () => {
    expect(subAgentSystem).toBeDefined();
  });

  it("should create agent context", () => {
    const context = subAgentSystem.createAgentContext(
      "test-agent",
      "session-1",
      "/workspace",
      []
    );

    expect(context.sessionId).toBe("test-agent");
    expect(context.parentSessionId).toBe("session-1");
    expect(context.projectDir).toBe("/workspace");
    expect(context.availableTools).toEqual([]);
  });

  it("should get status", () => {
    const status = subAgentSystem.getStatus("non-existent");
    expect(status).toBeUndefined();
  });

  it("should get all statuses", () => {
    const statuses = subAgentSystem.getAllStatuses();
    expect(Array.isArray(statuses)).toBe(true);
  });

  it("should get active count", () => {
    const count = subAgentSystem.getActiveCount();
    expect(count).toBe(0);
  });

  it("should cancel non-existent agent", () => {
    const result = subAgentSystem.cancelAgent("non-existent");
    expect(result).toBe(false);
  });

  it("should cleanup", () => {
    subAgentSystem.cleanup("test-session");
    expect(subAgentSystem.getActiveCount()).toBe(0);
  });
});

describe("Skill System", () => {
  let skillRegistry: SkillRegistry;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-skills");
    await mkdir(testDir, { recursive: true });
    skillRegistry = new SkillRegistry();
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should discover skills from directory", async () => {
    const skillDir = join(testDir, ".openflow", "skills", "test-skill");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: test-skill
version: 1.0.0
description: Test skill
trigger: [test]
---

# Test Skill

This is a test skill.
`
    );

    const skills = await skillRegistry.discoverSkills(testDir);
    expect(skills.length).toBeGreaterThan(0);
  });

  it("should set disclosure level", () => {
    skillRegistry.setDisclosureLevel("minimal");
    expect(skillRegistry).toBeDefined();
  });

  it("should get skills for trigger", async () => {
    const skillDir = join(testDir, ".openflow", "skills", "trigger-skill");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: trigger-skill
version: 1.0.0
description: Trigger skill
trigger: [deploy]
---

# Deploy Skill
`
    );

    await skillRegistry.discoverSkills(testDir);
    const skills = skillRegistry.getSkillsForTrigger("deploy");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("should enable and disable skill", async () => {
    const skillDir = join(testDir, ".openflow", "skills", "toggle-skill");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: toggle-skill
version: 1.0.0
description: Toggle skill
---

# Toggle Skill
`
    );

    await skillRegistry.discoverSkills(testDir);
    
    const skillsBefore = skillRegistry.getAllSkills();
    expect(skillsBefore.length).toBe(1);
    
    skillRegistry.disableSkill("toggle-skill");

    const allSkills = skillRegistry.getAllSkills();
    expect(allSkills.length).toBe(0);
    
    skillRegistry.enableSkill("toggle-skill");
    const skillsAfter = skillRegistry.getAllSkills();
    expect(skillsAfter.length).toBe(1);
  });
});

describe("Context File Discovery", () => {
  let discovery: ContextFileDiscovery;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-context");
    await mkdir(testDir, { recursive: true });
    discovery = new ContextFileDiscovery();
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should discover context files", async () => {
    await writeFile(
      join(testDir, ".openflow.md"),
      "# OpenFlow Instructions\n\nTest instructions"
    );

    await writeFile(
      join(testDir, "AGENTS.md"),
      "# Agent Instructions\n\nAgent rules"
    );

    const files = await discovery.discoverInDirectory(testDir);
    expect(files.length).toBe(2);
    expect(files[0].name).toBe(".openflow.md");
    expect(files[1].name).toBe("AGENTS.md");
  });

  it("should sort by priority", async () => {
    await writeFile(
      join(testDir, "AGENTS.md"),
      "# Agent Instructions"
    );

    await writeFile(
      join(testDir, ".openflow.md"),
      "# OpenFlow Instructions"
    );

    const files = await discovery.discoverInDirectory(testDir);
    expect(files[0].priority).toBeGreaterThan(files[1].priority);
  });

  it("should discover upward", async () => {
    const subDir = join(testDir, "subdir");
    await mkdir(subDir, { recursive: true });

    await writeFile(
      join(testDir, ".openflow.md"),
      "# Root Instructions"
    );

    const files = await discovery.discoverUpward(subDir, 2);
    expect(files.length).toBeGreaterThan(0);
  });

  it("should get context files for session", async () => {
    await writeFile(
      join(testDir, ".openflow.md"),
      "# Instructions"
    );

    await writeFile(
      join(testDir, "SOUL.md"),
      "# System Prompt"
    );

    const files = await discovery.getContextFilesForSession(testDir);
    expect(files.length).toBe(2);
  });
});

describe("Checkpoint System", () => {
  let checkpointSystem: CheckpointSystem;
  let testDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-checkpoints");
    workspaceDir = join(testDir, "workspace");
    await mkdir(workspaceDir, { recursive: true });
    checkpointSystem = new CheckpointSystem(testDir, {
      includePatterns: [],
      excludePatterns: [],
    });
    await checkpointSystem.initialize();
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should create checkpoint", async () => {
    const testFile = join(workspaceDir, "test.ts");
    await writeFile(testFile, "Test content");

    const checkpoint = await checkpointSystem.createCheckpoint(
      "session-1",
      [testFile],
      "Initial checkpoint"
    );

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.label).toBe("Initial checkpoint");
    expect(checkpoint.snapshots.length).toBe(1);
  });

  it("should rollback to checkpoint", async () => {
    const testFile = join(workspaceDir, "test.ts");
    await writeFile(testFile, "Original content");

    const checkpoint = await checkpointSystem.createCheckpoint(
      "session-1",
      [testFile]
    );

    await writeFile(testFile, "Modified content");

    const result = await checkpointSystem.rollbackToCheckpoint(checkpoint.id);
    expect(result.success).toBe(true);
    expect(result.restored.length).toBe(1);

    const content = await readFile(testFile, "utf-8");
    expect(content).toBe("Original content");
  });

  it("should list checkpoints", async () => {
    const testFile = join(workspaceDir, "test.ts");
    await writeFile(testFile, "Content 1");

    await checkpointSystem.createCheckpoint("session-1", [testFile]);
    await checkpointSystem.createCheckpoint("session-1", [testFile]);

    const checkpoints = await checkpointSystem.listCheckpoints();
    expect(checkpoints.length).toBe(2);
  });

  it("should rollback to last checkpoint", async () => {
    const testFile = join(workspaceDir, "test.ts");
    await writeFile(testFile, "Original");

    await checkpointSystem.createCheckpoint("session-1", [testFile]);
    await writeFile(testFile, "Modified");

    const result = await checkpointSystem.rollbackToLastCheckpoint();
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it("should delete checkpoint", async () => {
    const testFile = join(workspaceDir, "test.ts");
    await writeFile(testFile, "Content");

    const checkpoint = await checkpointSystem.createCheckpoint(
      "session-1",
      [testFile]
    );

    await checkpointSystem.deleteCheckpoint(checkpoint.id);
    const checkpoints = await checkpointSystem.listCheckpoints();
    expect(checkpoints.length).toBe(0);
  });
});

describe("Provider Router", () => {
  let router: ProviderRouter;

  beforeEach(() => {
    router = new ProviderRouter([
      {
        name: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "test-key",
        model: "claude-sonnet-4-20250514",
        priority: 1,
        weight: 100,
        timeout: 30000,
        maxRetries: 3,
      },
      {
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "test-key",
        model: "gpt-4o",
        priority: 2,
        weight: 100,
        timeout: 30000,
        maxRetries: 3,
      },
    ]);
  });

  it("should initialize with providers", () => {
    expect(router).toBeDefined();
    expect(router.getCurrentProvider()).toBe("anthropic");
  });

  it("should get ordered candidates", () => {
    const candidates = router.getOrderedCandidates();
    expect(candidates.length).toBe(2);
    expect(candidates[0].name).toBe("anthropic");
    expect(candidates[1].name).toBe("openai");
  });

  it("should record success", () => {
    router.recordSuccess("anthropic", 100);
    const health = router.getHealth("anthropic") as any;
    expect(health.status).toBe("healthy");
    expect(health.successCount).toBe(1);
  });

  it("should record error", () => {
    router.recordError("anthropic", new Error("Test error"));
    const health = router.getHealth("anthropic") as any;
    expect(health.errorCount).toBe(1);
  });

  it("should failover to next provider", async () => {
    const result = await router.failover();
    expect(result).toBe(true);
    expect(router.getCurrentProvider()).toBe("openai");
  });

  it("should get failover history", () => {
    const history = router.getFailoverHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it("should get all health statuses", () => {
    const statuses = router.getHealth() as Map<string, any>;
    expect(statuses.size).toBe(2);
  });
});

describe("Persistent Memory", () => {
  let memory: PersistentMemory;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-memory");
    await mkdir(testDir, { recursive: true });
    memory = new PersistentMemory(testDir);
    await memory.initialize();
    memory.setCurrentSession("test-session");
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should add memory entry", async () => {
    const id = await memory.addEntry({
      type: "fact",
      content: "Test fact",
      tags: ["test"],
      importance: 0.8,
    });

    expect(id).toBeDefined();
    const entry = await memory.getEntry(id);
    expect(entry).not.toBeNull();
  });

  it("should query memory", async () => {
    await memory.addEntry({
      type: "fact",
      content: "Important fact",
      tags: ["important"],
      importance: 0.9,
    });

    await memory.addEntry({
      type: "preference",
      content: "User preference",
      tags: ["preference"],
      importance: 0.5,
    });

    const results = await memory.query({ type: "fact" });
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("fact");
  });

  it("should query by tags", async () => {
    await memory.addEntry({
      type: "fact",
      content: "Tagged fact",
      tags: ["tag1", "tag2"],
      importance: 0.7,
    });

    const results = await memory.query({ tags: ["tag1"] });
    expect(results.length).toBe(1);
  });

  it("should query by importance", async () => {
    await memory.addEntry({
      type: "fact",
      content: "High importance",
      tags: [],
      importance: 0.9,
    });

    await memory.addEntry({
      type: "fact",
      content: "Low importance",
      tags: [],
      importance: 0.3,
    });

    const results = await memory.query({ minImportance: 0.5 });
    expect(results.length).toBe(1);
    expect(results[0].importance).toBe(0.9);
  });

  it("should update entry", async () => {
    const id = await memory.addEntry({
      type: "fact",
      content: "Original content",
      tags: [],
      importance: 0.5,
    });

    await memory.updateEntry(id, {
      content: "Updated content",
      importance: 0.8,
    });

    const entry = await memory.getEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.content).toBe("Updated content");
    expect(entry!.importance).toBe(0.8);
  });

  it("should delete entry", async () => {
    const id = await memory.addEntry({
      type: "fact",
      content: "To delete",
      tags: [],
      importance: 0.5,
    });

    const deleted = await memory.deleteEntry(id);
    expect(deleted).toBe(true);
    const entry = await memory.getEntry(id);
    expect(entry).toBeNull();
  });

  it("should get session summary", async () => {
    await memory.addEntry({
      type: "fact",
      content: "Session fact",
      tags: [],
      importance: 0.5,
    });

    const summary = memory.getSessionSummary("test-session");
    expect(summary).toBeDefined();
  });
});

describe("Task Scheduler", () => {
  let scheduler: TaskScheduler;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-scheduler");
    await mkdir(testDir, { recursive: true });
    scheduler = new TaskScheduler({ dataDir: testDir });
    await scheduler.initialize();
  });

  afterEach(async () => {
    scheduler.stop();
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should add task", () => {
    const id = scheduler.addTask({
      name: "test-task",
      description: "Test task",
      cronExpression: "0 * * * *",
      command: "echo",
      args: ["test"],
    });

    expect(id).toBeDefined();
    const task = scheduler.getTask(id);
    expect(task).toBeDefined();
    expect(task!.name).toBe("test-task");
  });

  it("should remove task", () => {
    const id = scheduler.addTask({
      name: "removable-task",
      description: "Removable",
      cronExpression: "0 * * * *",
      command: "echo",
    });

    const removed = scheduler.removeTask(id);
    expect(removed).toBe(true);
    expect(scheduler.getTask(id)).toBeUndefined();
  });

  it("should enable and disable task", () => {
    const id = scheduler.addTask({
      name: "toggle-task",
      description: "Toggle",
      cronExpression: "0 * * * *",
      command: "echo",
    });

    scheduler.disableTask(id);
    let task = scheduler.getTask(id);
    expect(task!.enabled).toBe(false);

    scheduler.enableTask(id);
    task = scheduler.getTask(id);
    expect(task!.enabled).toBe(true);
  });

  it("should get all tasks", () => {
    scheduler.addTask({
      name: "task-1",
      description: "Task 1",
      cronExpression: "0 * * * *",
      command: "echo",
    });

    scheduler.addTask({
      name: "task-2",
      description: "Task 2",
      cronExpression: "0 * * * *",
      command: "echo",
    });

    const tasks = scheduler.getAllTasks();
    expect(tasks.length).toBe(2);
  });

  it("should get enabled tasks", () => {
    const id = scheduler.addTask({
      name: "disabled-task",
      description: "Disabled",
      cronExpression: "0 * * * *",
      command: "echo",
    });

    scheduler.disableTask(id);

    const enabled = scheduler.getEnabledTasks();
    expect(enabled.length).toBe(0);
  });

  it("should get stats", async () => {
    scheduler.addTask({
      name: "stats-task",
      description: "Stats",
      cronExpression: "0 * * * *",
      command: "echo",
    });

    const stats = await scheduler.getStats();
    expect(stats.totalTasks).toBe(1);
    expect(stats.enabledTasks).toBe(1);
  });
});

describe("Multimedia Tools", () => {
  const tools = createMultimediaTools();

  it("should create multimedia tools", () => {
    expect(tools.length).toBe(6);
    expect(tools[0].name).toBe("ImageAnalysis");
    expect(tools[1].name).toBe("ImageGeneration");
    expect(tools[2].name).toBe("AudioAnalysis");
    expect(tools[3].name).toBe("AudioGeneration");
    expect(tools[4].name).toBe("VideoAnalysis");
    expect(tools[5].name).toBe("VideoGeneration");
  });

  it("should have correct tool definitions", () => {
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    }
  });

  it("should have read-only flag set correctly", () => {
    const analysisTools = tools.filter((t) => t.name.includes("Analysis"));
    const generationTools = tools.filter((t) => t.name.includes("Generation"));

    for (const tool of analysisTools) {
      expect(tool.isReadOnly).toBe(true);
    }

    for (const tool of generationTools) {
      expect(tool.isReadOnly).toBe(false);
    }
  });
});

describe("Tool Groups and Profiles", () => {
  it("should have media group", () => {
    expect(TOOL_GROUPS["group:media"]).toBeDefined();
    expect(TOOL_GROUPS["group:media"].length).toBe(6);
  });

  it("should have multimedia profile", () => {
    expect(TOOL_PROFILES["multimedia"]).toBeDefined();
  });

  it("should have messaging profile", () => {
    expect(TOOL_PROFILES["messaging"]).toBeDefined();
  });

  it("should resolve tool profile", () => {
    const codingTools = resolveToolProfile("coding");
    expect(codingTools.length).toBeGreaterThan(0);

    const minimalTools = resolveToolProfile("minimal");
    expect(minimalTools.length).toBeGreaterThan(0);
    expect(minimalTools.length).toBeLessThan(codingTools.length);
  });

  it("should resolve multimedia profile", () => {
    const multimediaTools = resolveToolProfile("multimedia");
    expect(multimediaTools).toContain("ImageAnalysis");
    expect(multimediaTools).toContain("ImageGeneration");
  });

  it("should return full profile for unknown", () => {
    const tools = resolveToolProfile("unknown");
    expect(tools).toEqual(TOOL_PROFILES.full);
  });
});
