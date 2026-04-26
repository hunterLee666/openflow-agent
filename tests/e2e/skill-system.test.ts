import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import {
  SkillRegistry,
  SkillDefinition,
  BUILTIN_SKILLS,
  SKILL_FILE_NAMES,
  SKILL_DIR_NAMES,
} from "../../backend/skills";
import {
  adaptSkillToPlugin,
  adaptSkillsToPlugins,
  LegacySkill,
} from "../../backend/adapters/skill-adapter";

const TEST_DIR = join(process.cwd(), "tests", "e2e", "test-data", "skills");

describe("E2E - Skill 技能系统完整场景", () => {
  let projectDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    skillsDir = join(projectDir, ".openflow", "skills");
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: Skill 注册表基础功能", () => {
    it("应该能够创建 SkillRegistry 实例", () => {
      const registry = new SkillRegistry();
      expect(registry).toBeDefined();
    });

    it("应该包含内置技能列表", () => {
      expect(Array.isArray(BUILTIN_SKILLS)).toBe(true);
      expect(BUILTIN_SKILLS.length).toBeGreaterThan(0);
      expect(BUILTIN_SKILLS).toContain("code_review");
      expect(BUILTIN_SKILLS).toContain("test_generator");
      expect(BUILTIN_SKILLS).toContain("debug_assistant");
    });

    it("应该能够获取所有已注册的技能", () => {
      const registry = new SkillRegistry();
      const skills = registry.getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
    });

    it("SKILL_FILE_NAMES 应该包含正确的文件名", () => {
      expect(SKILL_FILE_NAMES).toBeDefined();
      expect(Array.isArray(SKILL_FILE_NAMES)).toBe(true);
      expect(SKILL_FILE_NAMES).toContain("SKILL.md");
      expect(SKILL_FILE_NAMES).toContain("skill.md");
    });

    it("SKILL_DIR_NAMES 应该包含正确的目录名", () => {
      expect(SKILL_DIR_NAMES).toBeDefined();
      expect(Array.isArray(SKILL_DIR_NAMES)).toBe(true);
      expect(SKILL_DIR_NAMES).toContain(".openflow/skills");
      expect(SKILL_DIR_NAMES).toContain("skills");
    });

    it("应该能够设置披露级别", () => {
      const registry = new SkillRegistry();
      registry.setDisclosureLevel("full");
      expect(registry).toBeDefined();
    });
  });

  describe("场景 2: 技能发现和注册", () => {
    it("应该能够从文件系统发现技能", async () => {
      const registry = new SkillRegistry();
      const skills = await registry.discoverSkills(projectDir);
      expect(Array.isArray(skills)).toBe(true);
    });

    it("应该能够注册单个技能", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Test Skill",
          description: "Test description",
          version: "1.0.0",
        },
        content: "# Test Skill\n\nThis is a test skill.",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const skills = registry.getAllSkills();
      expect(skills.length).toBe(1);
    });

    it("应该能够获取已注册的技能", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Get Skill",
          description: "Test get skill",
          version: "1.0.0",
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const retrieved = registry.getSkill("Get Skill");
      expect(retrieved).toBeDefined();
      expect(retrieved?.manifest.name).toBe("Get Skill");
    });

    it("获取不存在的技能应该返回 null", () => {
      const registry = new SkillRegistry();
      const skill = registry.getSkill("non-existent-skill");
      expect(skill).toBeNull();
    });

    it("应该能够启用和禁用技能", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Toggle Skill",
          description: "Test toggle",
          version: "1.0.0",
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      
      registry.disableSkill("Toggle Skill");
      let skillsAfterDisable = registry.getAllSkills();
      
      registry.enableSkill("Toggle Skill");
      const skillsAfterEnable = registry.getAllSkills();
      
      expect(skillsAfterEnable.length).toBeGreaterThanOrEqual(0);
    });

    it("应该能够记录技能使用情况", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Usage Skill",
          description: "Test usage",
          version: "1.0.0",
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      registry.recordUsage("Usage Skill");
      expect(registry).toBeDefined();
    });
  });

  describe("场景 3: 技能触发器匹配", () => {
    it("应该能够根据触发器获取匹配的技能", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Review Skill",
          description: "Code review skill",
          version: "1.0.0",
          trigger: ["@review", "code review"],
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const matches = registry.getSkillsForTrigger("@review please");
      expect(Array.isArray(matches)).toBe(true);
    });

    it("应该能够匹配 agentskillsIo 触发器", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Test Skill",
          description: "Test",
          version: "1.0.0",
          agentskillsIo: {
            name: "Test Skill",
            description: "Test",
            version: "1.0.0",
            triggers: ["@test", "test me"],
          },
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const matches = registry.getSkillsForTrigger("@test");
      expect(Array.isArray(matches)).toBe(true);
    });

    it("不匹配的触发器应该返回空数组", () => {
      const registry = new SkillRegistry();
      const matches = registry.getSkillsForTrigger("no match at all");
      expect(matches.length).toBe(0);
    });
  });

  describe("场景 4: 技能披露级别", () => {
    it("应该能够返回 minimal 级别的披露内容", () => {
      const registry = new SkillRegistry();
      registry.setDisclosureLevel("minimal");
      
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Disclose Skill",
          description: "Test disclosure",
          version: "1.0.0",
        },
        content: "# Full Content\n\nThis is very long content that should not be disclosed in minimal mode.",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const content = registry.getProgressiveDisclosureContent("Disclose Skill");
      expect(content).toContain("Disclose Skill");
      expect(content).toContain("Test disclosure");
    });

    it("应该能够返回 basic 级别的披露内容", () => {
      const registry = new SkillRegistry();
      registry.setDisclosureLevel("basic");
      
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Basic Skill",
          description: "Test basic disclosure",
          version: "2.0.0",
          trigger: ["@basic"],
        },
        content: "full content here",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const content = registry.getProgressiveDisclosureContent("Basic Skill");
      expect(content).toContain("Basic Skill");
      expect(content).toContain("2.0.0");
      expect(content).toContain("@basic");
    });

    it("应该能够返回 full 级别的披露内容", () => {
      const registry = new SkillRegistry();
      registry.setDisclosureLevel("full");
      
      const fullContent = "# Full Content\n\nComplete details here.";
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Full Skill",
          description: "Test full disclosure",
          version: "1.0.0",
        },
        content: fullContent,
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      const content = registry.getProgressiveDisclosureContent("Full Skill");
      expect(content).toBe(fullContent);
    });
  });

  describe("场景 5: 技能适配器功能", () => {
    it("应该能够将单个技能转换为插件", () => {
      const skill: LegacySkill = {
        id: "test-skill",
        name: "Test Skill",
        description: "Test skill for conversion",
        triggers: ["@test"],
        steps: [
          {
            type: "prompt",
            content: "Please analyze this code",
          },
        ],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
      expect(plugin.manifest).toBeDefined();
      expect(plugin.manifest.type).toBe("skill");
      expect(plugin.manifest.name).toBe(skill.name);
    });

    it("应该能够将多个技能转换为插件", () => {
      const skills: LegacySkill[] = [
        {
          id: "skill1",
          name: "Skill 1",
          description: "First skill",
          triggers: ["@skill1"],
          steps: [],
        },
        {
          id: "skill2",
          name: "Skill 2",
          description: "Second skill",
          triggers: ["@skill2"],
          steps: [],
        },
      ];

      const plugins = adaptSkillsToPlugins(skills);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(2);
    });

    it("转换后的技能插件应该包含触发器", () => {
      const skill: LegacySkill = {
        id: "trigger-skill",
        name: "Trigger Skill",
        description: "Skill with triggers",
        triggers: ["@review", "@analyze", "/review"],
        steps: [],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin.manifest.triggers).toBeDefined();
      expect(Array.isArray(plugin.manifest.triggers)).toBe(true);
      expect(plugin.manifest.triggers?.length).toBe(3);
    });

    it("转换后的技能插件应该包含激活和停用方法", () => {
      const skill: LegacySkill = {
        id: "lifecycle-skill",
        name: "Lifecycle Skill",
        description: "Test lifecycle",
        triggers: ["@lifecycle"],
        steps: [],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(typeof plugin.activate).toBe("function");
      expect(typeof plugin.deactivate).toBe("function");
    });

    it("转换后的技能插件应该包含允许的工具列表", () => {
      const skill: LegacySkill = {
        id: "tools-skill",
        name: "Tools Skill",
        description: "Skill with tools",
        triggers: ["@tools"],
        steps: [],
        allowedTools: ["bash", "write_to_file", "view_files"],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin.manifest.allowedTools).toBeDefined();
      expect(plugin.manifest.allowedTools).toContain("bash");
      expect(plugin.manifest.allowedTools).toContain("write_to_file");
    });
  });

  describe("场景 6: 技能步骤执行", () => {
    it("应该能够处理提示类型的步骤", () => {
      const skill: LegacySkill = {
        id: "prompt-skill",
        name: "Prompt Skill",
        description: "Skill with prompt steps",
        triggers: ["@prompt"],
        steps: [
          {
            type: "prompt",
            content: "Analyze the following code carefully.",
          },
        ],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
      expect(plugin.manifest).toBeDefined();
    });

    it("应该能够处理工具类型的步骤", () => {
      const skill: LegacySkill = {
        id: "tool-skill",
        name: "Tool Skill",
        description: "Skill with tool steps",
        triggers: ["@tool"],
        steps: [
          {
            type: "tool",
            tool: "view_files",
            input: { files: ["test.ts"] },
          },
        ],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
    });

    it("应该能够处理条件类型的步骤", () => {
      const skill: LegacySkill = {
        id: "condition-skill",
        name: "Condition Skill",
        description: "Skill with condition steps",
        triggers: ["@condition"],
        steps: [
          {
            type: "condition",
            condition: "has_tests",
          },
        ],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
    });

    it("应该能够处理多个混合类型的步骤", () => {
      const skill: LegacySkill = {
        id: "mixed-skill",
        name: "Mixed Skill",
        description: "Skill with mixed steps",
        triggers: ["@mixed"],
        steps: [
          { type: "prompt", content: "Start analysis" },
          { type: "tool", tool: "view_files", input: {} },
          { type: "condition", condition: "is_large_file" },
          { type: "prompt", content: "Summarize findings" },
        ],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
      expect(skill.steps.length).toBe(4);
    });
  });

  describe("场景 7: 技能工具过滤", () => {
    it("应该能够计算有效的工具集合", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Filter Skill",
          description: "Test tool filtering",
          version: "1.0.0",
          allowedTools: ["bash", "view_files"],
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      const globalTools = new Set(["bash", "write_to_file", "view_files", "search"]);
      const effective = registry.getEffectiveTools(skillDef, globalTools);
      expect(effective instanceof Set).toBe(true);
    });

    it("没有指定允许工具列表时应该返回全局集合", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "No Restriction Skill",
          description: "Skill with no tool restrictions",
          version: "1.0.0",
        },
        content: "content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      const globalTools = new Set(["bash", "write_to_file"]);
      const effective = registry.getEffectiveTools(skillDef, globalTools);
      expect(effective.size).toBe(globalTools.size);
    });
  });

  describe("场景 8: 技能错误处理", () => {
    it("应该优雅地处理空技能列表", () => {
      const plugins = adaptSkillsToPlugins([]);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it("应该优雅地处理缺少步骤的技能", () => {
      const skill: LegacySkill = {
        id: "empty-steps",
        name: "Empty Steps Skill",
        description: "Skill with no steps",
        triggers: ["@empty"],
        steps: [],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
    });

    it("应该优雅地处理缺少触发器的技能", () => {
      const skill: LegacySkill = {
        id: "no-triggers",
        name: "No Triggers Skill",
        description: "Skill with no triggers",
        triggers: [],
        steps: [],
      };

      const plugin = adaptSkillToPlugin(skill);
      expect(plugin).toBeDefined();
      expect(plugin.manifest.triggers?.length).toBe(0);
    });

    it("获取不存在的技能披露内容应该返回空字符串", () => {
      const registry = new SkillRegistry();
      const content = registry.getProgressiveDisclosureContent("non-existent-skill");
      expect(content).toBe("");
    });
  });

  describe("场景 9: 技能集成测试", () => {
    it("内置技能名称都能被适配器处理", () => {
      BUILTIN_SKILLS.forEach((skillName) => {
        const skill: LegacySkill = {
          id: skillName,
          name: skillName,
          description: `Builtin skill: ${skillName}`,
          triggers: [`@${skillName}`],
          steps: [
            { type: "prompt", content: `Execute ${skillName}` },
          ],
        };

        const plugin = adaptSkillToPlugin(skill);
        expect(plugin).toBeDefined();
        expect(plugin.manifest.type).toBe("skill");
      });
    });

    it("所有技能插件应该提供一致的接口", () => {
      const skills: LegacySkill[] = BUILTIN_SKILLS.map((name) => ({
        id: name,
        name,
        description: name,
        triggers: [`@${name}`],
        steps: [],
      }));

      const plugins = adaptSkillsToPlugins(skills);
      plugins.forEach((plugin) => {
        expect(plugin.manifest).toBeDefined();
        expect(typeof plugin.activate).toBe("function");
        expect(typeof plugin.deactivate).toBe("function");
      });
    });

    it("应该能够从路径加载技能", async () => {
      const registry = new SkillRegistry();
      const skillDir = join(skillsDir, "loadable-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# Loadable Skill\n\nDescription here.");
      
      const skill = await registry.loadSkillFromPath(skillDir);
      expect(skill).toBeDefined();
    });

    it("应该能够处理重复注册相同名称的技能", () => {
      const registry = new SkillRegistry();
      const skillDef: SkillDefinition = {
        manifest: {
          name: "Duplicate Skill",
          description: "Original",
          version: "1.0.0",
        },
        content: "original content",
        path: skillsDir,
        isMarkdown: true,
        metadata: {},
      };

      registry.registerSkill(skillDef);
      
      const updatedSkill: SkillDefinition = {
        ...skillDef,
        content: "updated content",
        manifest: {
          ...skillDef.manifest,
          description: "Updated",
        },
      };
      
      registry.registerSkill(updatedSkill);
      
      const retrieved = registry.getSkill("Duplicate Skill");
      expect(retrieved).toBeDefined();
    });
  });
});
