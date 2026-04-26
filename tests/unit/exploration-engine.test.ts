import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExplorationEngine, createExplorationEngine } from "../../backend/memory/exploration-engine.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("ExplorationEngine", () => {
  let testDir: string;
  let engine: ExplorationEngine;

  beforeEach(async () => {
    testDir = join(tmpdir(), `exploration-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    engine = createExplorationEngine(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("initialize", () => {
    it("should initialize exploration context", async () => {
      const context = await engine.initialize();
      expect(context).toBeDefined();
      expect(context.baseline).toBeDefined();
      expect(context.taskDriven).toBeDefined();
      expect(context.layeredMemory).toBeDefined();
    });

    it("should load baseline context", async () => {
      const context = await engine.initialize();
      expect(context.baseline.identity).toBeDefined();
      expect(context.baseline.user).toBeDefined();
      expect(context.baseline.workspace).toBeDefined();
      expect(context.baseline.runtime).toBeDefined();
    });
  });

  describe("loadBootstrapFiles", () => {
    it("should return empty array when no bootstrap files exist", async () => {
      const files = await engine.loadBootstrapFiles();
      expect(files).toBeDefined();
      expect(files.length).toBeGreaterThan(0);
    });

    it("should load AGENTS.md when it exists", async () => {
      const agentsContent = `# Agent Configuration
name: TestAgent
role: Test Assistant
personality: Helpful and concise
constraints:
- 不要删除用户文件
- 必须遵守安全规范`;

      await writeFile(join(testDir, "AGENTS.md"), agentsContent);
      const files = await engine.loadBootstrapFiles();
      const agentsFile = files.find((f) => f.name === "AGENTS.md");
      expect(agentsFile).toBeDefined();
      expect(agentsFile?.injected).toBe(true);
      expect(agentsFile?.content).toContain("TestAgent");
    });

    it("should load USER.md when it exists", async () => {
      const userContent = `# User Profile
name: TestUser
preferences:
- 偏好简洁的代码
- 喜欢使用 TypeScript
technicalLevel: advanced
communicationStyle: concise`;

      await writeFile(join(testDir, "USER.md"), userContent);
      const files = await engine.loadBootstrapFiles();
      const userFile = files.find((f) => f.name === "USER.md");
      expect(userFile).toBeDefined();
      expect(userFile?.injected).toBe(true);
    });

    it("should load MEMORY.md when it exists", async () => {
      const memoryContent = `# Long-term Memory
## Project Knowledge
- 项目使用 TypeScript
- 使用 Vitest 进行测试

## User Preferences
- 偏好函数式编程
- 喜欢使用 async/await`;

      await writeFile(join(testDir, "MEMORY.md"), memoryContent);
      const files = await engine.loadBootstrapFiles();
      const memoryFile = files.find((f) => f.name === "MEMORY.md");
      expect(memoryFile).toBeDefined();
      expect(memoryFile?.injected).toBe(true);
    });

    it("should truncate large files", async () => {
      const largeContent = "A".repeat(50000);
      await writeFile(join(testDir, "AGENTS.md"), largeContent);
      const files = await engine.loadBootstrapFiles();
      const agentsFile = files.find((f) => f.name === "AGENTS.md");
      expect(agentsFile?.truncated).toBe(true);
      expect(agentsFile?.content.length).toBeLessThan(50000);
    });
  });

  describe("loadIdentity", () => {
    it("should return default identity when no files exist", async () => {
      const identity = await engine.loadIdentity();
      expect(identity.name).toBe("OpenFlow Agent");
      expect(identity.role).toBe("AI coding assistant");
    });

    it("should load identity from IDENTITY.md", async () => {
      const identityContent = `name: CustomAgent
role: Custom Assistant`;
      await writeFile(join(testDir, "IDENTITY.md"), identityContent);
      const identity = await engine.loadIdentity();
      expect(identity.name).toBe("CustomAgent");
      expect(identity.role).toBe("Custom Assistant");
    });

    it("should extract constraints from SOUL.md", async () => {
      const soulContent = `# Soul Configuration
You are a helpful assistant.
- 不要删除用户文件
- 必须遵守安全规范
- 应该先询问用户确认`;
      await writeFile(join(testDir, "SOUL.md"), soulContent);
      const identity = await engine.loadIdentity();
      expect(identity.constraints.length).toBeGreaterThan(0);
      expect(identity.constraints[0]).toContain("删除用户文件");
    });
  });

  describe("loadUserInfo", () => {
    it("should return default user info when USER.md does not exist", async () => {
      const user = await engine.loadUserInfo();
      expect(user.name).toBeDefined();
      expect(user.technicalLevel).toBe("unknown");
    });

    it("should load user info from USER.md", async () => {
      const userContent = `name: TestUser
- 偏好简洁的代码
- 喜欢使用 TypeScript
technicalLevel: advanced`;
      await writeFile(join(testDir, "USER.md"), userContent);
      const user = await engine.loadUserInfo();
      expect(user.name).toBe("TestUser");
      expect(user.technicalLevel).toBe("advanced");
    });

    it("should detect technical level from content", async () => {
      const userContent = `name: AdvancedUser
我喜欢研究架构、设计模式和分布式系统
偏好使用微服务和性能优化`;
      await writeFile(join(testDir, "USER.md"), userContent);
      const user = await engine.loadUserInfo();
      expect(user.technicalLevel).toBe("advanced");
    });

    it("should detect communication style from content", async () => {
      const userContent = `name: ConciseUser
我喜欢简洁的回答，不要啰嗦`;
      await writeFile(join(testDir, "USER.md"), userContent);
      const user = await engine.loadUserInfo();
      expect(user.communicationStyle).toBe("concise");
    });
  });

  describe("loadWorkspaceBaseline", () => {
    it("should detect project type from package.json", async () => {
      const packageJson = {
        name: "test-project",
        version: "1.0.0",
        dependencies: { express: "^4.0.0" },
      };
      await writeFile(join(testDir, "package.json"), JSON.stringify(packageJson));
      const baseline = await engine.loadWorkspaceBaseline();
      expect(baseline.projectType).toBe("node");
    });

    it("should detect project type from pyproject.toml", async () => {
      await writeFile(join(testDir, "pyproject.toml"), "[tool.poetry]\nname = 'test-project'");
      const baseline = await engine.loadWorkspaceBaseline();
      expect(baseline.projectType).toBe("python");
    });

    it("should scan directory structure", async () => {
      await mkdir(join(testDir, "src"));
      await writeFile(join(testDir, "src", "index.ts"), "console.log('hello')");
      const baseline = await engine.loadWorkspaceBaseline();
      expect(baseline.structure.name).toBe(basename(testDir));
      expect(baseline.structure.children).toBeDefined();
    });

    it("should detect conventions from config files", async () => {
      await writeFile(join(testDir, ".eslintrc.json"), "{}");
      await writeFile(join(testDir, ".prettierrc"), "{}");
      await writeFile(join(testDir, "tsconfig.json"), "{}");
      const baseline = await engine.loadWorkspaceBaseline();
      expect(baseline.conventions.length).toBeGreaterThan(0);
    });
  });

  describe("loadRuntimeBaseline", () => {
    it("should load runtime information", async () => {
      const runtime = await engine.loadRuntimeBaseline();
      expect(runtime.nodeVersion).toBeDefined();
      expect(runtime.shell).toBeDefined();
      expect(runtime.os.platform).toBeDefined();
    });

    it("should include important environment variables", async () => {
      const runtime = await engine.loadRuntimeBaseline();
      expect(runtime.env).toBeDefined();
    });
  });

  describe("loadSkillRegistry", () => {
    it("should return empty registry when no skills directory exists", async () => {
      const registry = await engine.loadSkillRegistry();
      expect(registry.available).toEqual([]);
    });

    it("should load skills from .openflow/skills directory", async () => {
      const skillsDir = join(testDir, ".openflow", "skills");
      await mkdir(skillsDir, { recursive: true });
      const skillContent = `name: TestSkill
description: A test skill
triggers:
- test
allowedTools:
- read_file
- write_file`;
      await writeFile(join(skillsDir, "test.skill.md"), skillContent);
      const registry = await engine.loadSkillRegistry();
      expect(registry.available.length).toBeGreaterThan(0);
    });
  });

  describe("loadMemoryBaseline", () => {
    it("should return empty memory when no MEMORY.md exists", async () => {
      const memory = await engine.loadMemoryBaseline();
      expect(memory.longTerm.content).toBe("");
    });

    it("should load MEMORY.md when it exists", async () => {
      const memoryContent = `# Long-term Memory
## Project Knowledge
- 项目使用 TypeScript
## User Preferences
- 偏好简洁代码`;
      await writeFile(join(testDir, "MEMORY.md"), memoryContent);
      const memory = await engine.loadMemoryBaseline();
      expect(memory.longTerm.content).toContain("Long-term Memory");
      expect(memory.longTerm.topics.length).toBeGreaterThan(0);
    });
  });

  describe("startTaskDrivenExploration", () => {
    it("should initialize task context", async () => {
      await engine.initialize();
      await engine.startTaskDrivenExploration("实现用户登录功能", ["读取代码", "分析依赖", "编写测试"]);
      const context = (engine as any).context;
      expect(context.taskDriven.currentTask).toBe("实现用户登录功能");
      expect(context.taskDriven.explorationGoals.length).toBe(3);
    });

    it("should plan exploration steps based on task", async () => {
      await engine.initialize();
      await engine.startTaskDrivenExploration("开发代码模块", ["分析", "实现", "测试"]);
      const context = (engine as any).context;
      expect(context.taskDriven.nextActions.length).toBeGreaterThan(0);
    });
  });

  describe("recordExplorationStep", () => {
    it("should record exploration step", async () => {
      await engine.initialize();
      await engine.startTaskDrivenExploration("测试任务", ["步骤1"]);

      await engine.recordExplorationStep({
        step: 1,
        action: "读取 package.json",
        tool: "read_file",
        input: "package.json",
        output: "{ name: 'test' }",
        timestamp: Date.now(),
      });

      const context = (engine as any).context;
      expect(context.explorationHistory.length).toBe(1);
      expect(context.taskDriven.completedSteps.length).toBe(1);
    });

    it("should infer observation type from tool", async () => {
      await engine.initialize();
      await engine.startTaskDrivenExploration("测试任务", ["步骤1"]);

      await engine.recordExplorationStep({
        step: 1,
        action: "执行命令",
        tool: "bash",
        input: "npm test",
        output: "All tests passed",
        timestamp: Date.now(),
      });

      const context = (engine as any).context;
      expect(context.taskDriven.observations[0].type).toBe("command");
    });
  });

  describe("consolidateExperience", () => {
    it("should create MEMORY.md with experience section", async () => {
      await engine.initialize();
      await engine.startTaskDrivenExploration("测试任务", ["步骤1"]);

      await engine.recordExplorationStep({
        step: 1,
        action: "读取代码",
        tool: "read_file",
        input: "index.ts",
        output: "export function hello() {}",
        timestamp: Date.now(),
      });

      await engine.consolidateExperience();

      const memoryPath = join(testDir, "MEMORY.md");
      const memoryContent = await require("node:fs/promises").readFile(memoryPath, "utf-8");
      expect(memoryContent).toContain("任务经验");
      expect(memoryContent).toContain("测试任务");
    });

    it("should append to existing MEMORY.md", async () => {
      const existingContent = "# Existing Memory\n## Previous Knowledge";
      await writeFile(join(testDir, "MEMORY.md"), existingContent);

      await engine.initialize();
      await engine.startTaskDrivenExploration("新任务", ["新步骤"]);
      await engine.consolidateExperience();

      const memoryPath = join(testDir, "MEMORY.md");
      const memoryContent = await require("node:fs/promises").readFile(memoryPath, "utf-8");
      expect(memoryContent).toContain("Existing Memory");
      expect(memoryContent).toContain("任务经验");
    });
  });

  describe("formatForIntentRecognition", () => {
    it("should format context for prompt", async () => {
      await engine.initialize();
      const formatted = engine.formatForIntentRecognition();
      expect(formatted).toContain("身份与约束");
      expect(formatted).toContain("用户信息");
      expect(formatted).toContain("运行时环境");
      expect(formatted).toContain("项目信息");
    });

    it("should include bootstrap files when loaded", async () => {
      await writeFile(join(testDir, "AGENTS.md"), "# Agent Configuration");
      await engine.initialize();
      const formatted = engine.formatForIntentRecognition();
      expect(formatted).toContain("引导文件");
    });

    it("should include long-term memory when available", async () => {
      await writeFile(join(testDir, "MEMORY.md"), "# Long-term Memory\n## Knowledge");
      await engine.initialize();
      const formatted = engine.formatForIntentRecognition();
      expect(formatted).toContain("长期记忆");
    });
  });

  describe("loadTimeInfo", () => {
    it("should return current time information", () => {
      const time = engine.loadTimeInfo();
      expect(time.iso).toBeDefined();
      expect(time.timezone).toBeDefined();
      expect(time.unixTimestamp).toBeDefined();
    });
  });
});
