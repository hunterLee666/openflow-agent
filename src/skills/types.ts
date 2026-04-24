export interface Skill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  steps: SkillStep[];
  markdown?: string;
}

export interface SkillStep {
  type: "prompt" | "tool" | "condition" | "loop" | "merge";
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  condition?: string;
  branches?: { if: string; then: SkillStep[] }[];
  iterations?: number;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  unregister(id: string): void;
  find(trigger: string): Skill | undefined;
  list(): Skill[];
  loadFromMarkdown(path: string): Promise<Skill>;
}

export interface SkillContext {
  query: string;
  cwd: string;
  memory: Map<string, unknown>;
  results: unknown[];
}

export interface SkillExecutor {
  execute(skill: Skill, ctx: SkillContext): AsyncGenerator<SkillEvent, SkillResult, unknown>;
}

export interface SkillEvent {
  kind: "step_start" | "step_end" | "prompt" | "tool_call" | "thinking";
  step?: number;
  content?: string;
}

export interface SkillResult {
  success: boolean;
  summary: string;
  artifacts: Record<string, string>;
}
