import type { CapabilityContext, CapabilityPlugin } from "../types/index.js";
import { CapabilityType, CapabilityStatus } from "../types/index.js";
import type { SkillDocument } from "../memory/memory-core.js";
import type { ProceduralMemory } from "../memory/procedural-memory.js";

export interface GEPAConfig {
  minSuccessCount: number;
  maxFailureCount: number;
  distillInterval: number;
  skillDir: string;
}

export interface TaskTrace {
  id: string;
  goal: string;
  steps: Array<{
    tool: string;
    input: unknown;
    output: unknown;
    timestamp: number;
  }>;
  outcome: "success" | "failure" | "partial";
  duration: number;
  timestamp: number;
}

export class GEPASelfEvolution {
  private traces: TaskTrace[] = [];
  private skillUsageCount = new Map<string, number>();
  private config: GEPAConfig;
  private context: CapabilityContext;
  private proceduralMemory?: ProceduralMemory;

  constructor(context: CapabilityContext, config: Partial<GEPAConfig>) {
    this.context = context;
    this.config = {
      minSuccessCount: config.minSuccessCount || 3,
      maxFailureCount: config.maxFailureCount || 5,
      distillInterval: config.distillInterval || 60,
      skillDir: config.skillDir || "./skills",
    };
  }

  setProceduralMemory(memory: ProceduralMemory): void {
    this.proceduralMemory = memory;
  }

  recordTask(trace: TaskTrace): void {
    this.traces.push(trace);

    for (const step of trace.steps) {
      const count = this.skillUsageCount.get(step.tool) || 0;
      this.skillUsageCount.set(step.tool, count + 1);
    }

    if (this.traces.length % 100 === 0) {
      this.pruneOldTraces();
    }
  }

  async analyzeAndDistill(): Promise<SkillDocument[]> {
    const patterns = this.findRecurringPatterns();
    const newSkills: SkillDocument[] = [];

    for (const pattern of patterns) {
      if (pattern.successCount >= this.config.minSuccessCount) {
        const skill = this.createSkillFromPattern(pattern);
        newSkills.push(skill);

        if (this.proceduralMemory) {
          await this.proceduralMemory.learnSkill({
            id: skill.frontmatter.name,
            skillName: skill.frontmatter.name,
            description: skill.frontmatter.description,
            steps: this.parseSkillBody(skill.body),
          });
        }
      }
    }

    return newSkills;
  }

  async suggestSkill(query: string): Promise<SkillDocument | null> {
    const relevantTraces = this.traces.filter((t) =>
      t.goal.toLowerCase().includes(query.toLowerCase())
    );

    if (relevantTraces.length < this.config.minSuccessCount) {
      return null;
    }

    const successTraces = relevantTraces.filter((t) => t.outcome === "success");
    if (successTraces.length < this.config.minSuccessCount) {
      return null;
    }

    const skill = this.createSkillFromTraces(query, successTraces);

    if (this.proceduralMemory) {
      await this.proceduralMemory.learnSkill({
        id: skill.frontmatter.name,
        skillName: skill.frontmatter.name,
        description: skill.frontmatter.description,
        steps: this.parseSkillBody(skill.body),
      });
    }

    return skill;
  }

  getSkillUsageStats(): Map<string, number> {
    return new Map(this.skillUsageCount);
  }

  getFrequentlyUsedSkills(threshold = 10): string[] {
    const result: string[] = [];
    for (const [tool, count] of this.skillUsageCount.entries()) {
      if (count >= threshold) {
        result.push(tool);
      }
    }
    return result;
  }

  private findRecurringPatterns(): Array<{
    goal: string;
    steps: Array<{ tool: string; input: unknown }>;
    successCount: number;
    failureCount: number;
    traces: TaskTrace[];
  }> {
    const grouped = new Map<string, TaskTrace[]>();

    for (const trace of this.traces) {
      const normalizedGoal = this.normalizeGoal(trace.goal);
      const existing = grouped.get(normalizedGoal) || [];
      existing.push(trace);
      grouped.set(normalizedGoal, existing);
    }

    const patterns: Array<{
      goal: string;
      steps: Array<{ tool: string; input: unknown }>;
      successCount: number;
      failureCount: number;
      traces: TaskTrace[];
    }> = [];

    for (const [goal, goalTraces] of grouped.entries()) {
      if (goalTraces.length < 2) continue;

      const successCount = goalTraces.filter((t) => t.outcome === "success").length;
      const failureCount = goalTraces.filter((t) => t.outcome === "failure").length;

      const commonSteps = this.findCommonSteps(goalTraces);

      patterns.push({
        goal,
        steps: commonSteps,
        successCount,
        failureCount,
        traces: goalTraces,
      });
    }

    return patterns;
  }

  private findCommonSteps(traces: TaskTrace[]): Array<{ tool: string; input: unknown }> {
    if (traces.length === 0) return [];

    const stepSequences = traces.map((t) => t.steps.map((s) => s.tool));
    const first = stepSequences[0];

    const commonSteps: Array<{ tool: string; input: unknown }> = [];

    for (let i = 0; i < first.length; i++) {
      const tool = first[i];
      const allMatch = stepSequences.every((seq) => seq[i] === tool);

      if (allMatch) {
        commonSteps.push({
          tool,
          input: traces[0].steps[i].input,
        });
      } else {
        break;
      }
    }

    return commonSteps;
  }

  private createSkillFromPattern(pattern: {
    goal: string;
    steps: Array<{ tool: string; input: unknown }>;
    traces: TaskTrace[];
  }): SkillDocument {
    const allowedTools = [...new Set(pattern.steps.map((s) => s.tool))];

    return {
      frontmatter: {
        name: this.generateSkillName(pattern.goal),
        description: `Auto-generated skill from ${pattern.traces.length} successful executions`,
        triggers: [pattern.goal.toLowerCase()],
        allowedTools,
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
      },
      overview: `This skill automates: "${pattern.goal}"`,
      body: pattern.steps
        .map((step, i) => `${i + 1}. Call \`${step.tool}\``)
        .join("\n"),
      references: [],
    };
  }

  private createSkillFromTraces(goal: string, traces: TaskTrace[]): SkillDocument {
    const allSteps = traces.flatMap((t) => t.steps);
    const toolCounts = new Map<string, number>();

    for (const step of allSteps) {
      toolCounts.set(step.tool, (toolCounts.get(step.tool) || 0) + 1);
    }

    const allowedTools = Array.from(toolCounts.keys());

    return {
      frontmatter: {
        name: this.generateSkillName(goal),
        description: `Auto-generated skill from ${traces.length} executions`,
        triggers: [goal.toLowerCase()],
        allowedTools,
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
      },
      overview: `This skill handles: "${goal}"`,
      body: traces[0].steps
        .map((step, i) => `${i + 1}. Call \`${step.tool}\``)
        .join("\n"),
      references: [],
    };
  }

  private parseSkillBody(body: string): Array<{ order: number; action: string }> {
    const lines = body.split("\n").filter((line) => line.trim().length > 0);
    return lines.map((line, index) => ({
      order: index + 1,
      action: line.replace(/^\d+\.\s*/, "").trim(),
    }));
  }

  private generateSkillName(goal: string): string {
    return goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "unnamed-skill";
  }

  private normalizeGoal(goal: string): string {
    return goal
      .toLowerCase()
      .replace(/[?.!]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private pruneOldTraces(): void {
    const maxTraces = 1000;
    if (this.traces.length > maxTraces) {
      this.traces = this.traces.slice(-maxTraces);
    }
  }
}

export function createGEPASkillPlugin(
  gepa: GEPASelfEvolution,
  skill: SkillDocument
): CapabilityPlugin {
  return {
    manifest: {
      name: skill.frontmatter.name,
      version: skill.frontmatter.version,
      type: CapabilityType.SKILL,
      description: skill.frontmatter.description,
      triggers: skill.frontmatter.triggers,
      allowedTools: skill.frontmatter.allowedTools,
    },

    async activate(ctx: CapabilityContext): Promise<unknown> {
      ctx.telemetry.log("skill:auto_learned", {
        name: skill.frontmatter.name,
        triggers: skill.frontmatter.triggers,
      });

      return {
        dispose: () => {
          ctx.telemetry.log("skill:disposed", { name: skill.frontmatter.name });
        },
      };
    },

    async deactivate(): Promise<void> {
      // Cleanup handled by dispose
    },
  };
}
