import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";
import type { Skill } from "../../backend/skills/types.js";

describe("E2E: Skill System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Skill Registry", () => {
    it("should have skill registry initialized", () => {
      expect(services.skillRegistry).toBeDefined();
    });

    it("should list all registered skills", () => {
      const skills = services.skillRegistry.list();
      expect(skills).toBeDefined();
      expect(Array.isArray(skills)).toBe(true);
    });

    it("should have builtin skills loaded", () => {
      const skills = services.skillRegistry.list();
      expect(skills.length).toBeGreaterThan(0);
    });

    it("should register a new skill", () => {
      const skill: Skill = {
        id: `test-skill-${Date.now()}`,
        name: "Test Skill",
        description: "A test skill for E2E testing",
        triggers: ["test-trigger"],
        steps: [
          {
            type: "prompt",
            content: "This is a test step",
          },
        ],
      };

      services.skillRegistry.register(skill);
      
      const retrieved = services.skillRegistry.find("test-trigger");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Test Skill");
    });

    it("should unregister a skill", () => {
      const skill: Skill = {
        id: `removable-skill-${Date.now()}`,
        name: "Removable Skill",
        description: "A skill to be removed",
        triggers: ["removable-trigger"],
        steps: [],
      };

      services.skillRegistry.register(skill);
      services.skillRegistry.unregister(skill.id);
      
      const retrieved = services.skillRegistry.find("removable-trigger");
      expect(retrieved).toBeUndefined();
    });

    it("should find skill by trigger", () => {
      const skill: Skill = {
        id: `trigger-skill-${Date.now()}`,
        name: "Trigger Skill",
        description: "A skill with specific trigger",
        triggers: ["find-me"],
        steps: [],
      };

      services.skillRegistry.register(skill);
      
      const found = services.skillRegistry.find("find-me");
      expect(found).toBeDefined();
      expect(found?.id).toBe(skill.id);
    });
  });

  describe("Skill Metadata", () => {
    it("should have skill metadata", () => {
      const skills = services.skillRegistry.list();
      
      for (const skill of skills) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.description).toBeDefined();
        expect(Array.isArray(skill.triggers)).toBe(true);
      }
    });

    it("should have skill steps defined", () => {
      const skills = services.skillRegistry.list();
      
      for (const skill of skills) {
        expect(Array.isArray(skill.steps)).toBe(true);
      }
    });

    it("should have step types", () => {
      const skill: Skill = {
        id: `step-type-skill-${Date.now()}`,
        name: "Step Type Skill",
        description: "Skill with various step types",
        triggers: ["step-types"],
        steps: [
          { type: "prompt", content: "Prompt step" },
          { type: "tool", tool: "read_file", input: { path: "test.txt" } },
          { type: "condition", condition: "true" },
        ],
      };

      services.skillRegistry.register(skill);
      
      const found = services.skillRegistry.find("step-types");
      expect(found).toBeDefined();
      expect(found?.steps.length).toBe(3);
    });
  });

  describe("Skill Steps", () => {
    it("should support prompt steps", () => {
      const skill: Skill = {
        id: `prompt-step-skill-${Date.now()}`,
        name: "Prompt Step Skill",
        description: "Skill with prompt step",
        triggers: ["prompt-step"],
        steps: [
          { type: "prompt", content: "This is a prompt step" },
        ],
      };

      services.skillRegistry.register(skill);
      const found = services.skillRegistry.find("prompt-step");
      expect(found?.steps[0].type).toBe("prompt");
    });

    it("should support tool steps", () => {
      const skill: Skill = {
        id: `tool-step-skill-${Date.now()}`,
        name: "Tool Step Skill",
        description: "Skill with tool step",
        triggers: ["tool-step"],
        steps: [
          { type: "tool", tool: "bash", input: { command: "echo test" } },
        ],
      };

      services.skillRegistry.register(skill);
      const found = services.skillRegistry.find("tool-step");
      expect(found?.steps[0].type).toBe("tool");
    });

    it("should support condition steps", () => {
      const skill: Skill = {
        id: `condition-step-skill-${Date.now()}`,
        name: "Condition Step Skill",
        description: "Skill with condition step",
        triggers: ["condition-step"],
        steps: [
          { type: "condition", condition: "context.query.includes('test')" },
        ],
      };

      services.skillRegistry.register(skill);
      const found = services.skillRegistry.find("condition-step");
      expect(found?.steps[0].type).toBe("condition");
    });

    it("should support loop steps", () => {
      const skill: Skill = {
        id: `loop-step-skill-${Date.now()}`,
        name: "Loop Step Skill",
        description: "Skill with loop step",
        triggers: ["loop-step"],
        steps: [
          { type: "loop", iterations: 3 },
        ],
      };

      services.skillRegistry.register(skill);
      const found = services.skillRegistry.find("loop-step");
      expect(found?.steps[0].type).toBe("loop");
    });
  });
});
