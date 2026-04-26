import type { CapabilityPlugin, CapabilityContext } from "../types/index.js";
import { z } from "zod";

export const SkillStepSchema = z.object({
  type: z.enum(["prompt", "tool", "condition"]),
  content: z.string().optional(),
  tool: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  condition: z.string().optional(),
});

export const LegacySkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  triggers: z.array(z.string()),
  steps: z.array(SkillStepSchema),
  allowedTools: z.array(z.string()).optional(),
  markdown: z.string().optional(),
});

export type LegacySkill = z.infer<typeof LegacySkillSchema>;
export type SkillStep = z.infer<typeof SkillStepSchema>;

export function adaptSkillToPlugin(skill: LegacySkill): CapabilityPlugin {
  return {
    manifest: {
      name: skill.name,
      version: "1.0.0",
      type: "skill" as const,
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
