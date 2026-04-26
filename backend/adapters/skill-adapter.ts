import type { CapabilityPlugin, CapabilityContext } from "../types/index.js";
import { CapabilityType } from "../types/index.js";

export interface LegacySkill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  steps: SkillStep[];
  allowedTools?: string[];
  markdown?: string;
}

export interface SkillStep {
  type: "prompt" | "tool" | "condition";
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  condition?: string;
}

export function adaptSkillToPlugin(skill: LegacySkill): CapabilityPlugin {
  return {
    manifest: {
      name: skill.name,
      version: "1.0.0",
      type: CapabilityType.SKILL,
      description: skill.description,
      triggers: skill.triggers,
      allowedTools: skill.allowedTools,
    },

    async activate(ctx: CapabilityContext) {
      ctx.tools.register({
        name: `skill_${skill.name}`,
        description: skill.description,
        inputSchema: {},
        isReadOnly: true,
        handler: async (_input: unknown) => {
          const results: string[] = [];
          for (const step of skill.steps) {
            switch (step.type) {
              case "prompt":
                results.push(step.content || "");
                break;
              case "tool":
                if (step.tool) {
                  const result = await ctx.tools.call(step.tool, step.input || {});
                  results.push(String(result));
                }
                break;
              case "condition":
                break;
            }
          }
          return results.join("\n");
        },
      });

      return { dispose: () => ctx.tools.unregister(`skill_${skill.name}`) };
    },

    async deactivate() {
      // Cleanup handled by dispose in activate return
    },
  };
}

export function adaptSkillsToPlugins(skills: LegacySkill[]): CapabilityPlugin[] {
  return skills.map(adaptSkillToPlugin);
}
