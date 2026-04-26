import type { ToolDefinition } from "../types/index.js";

export interface PlanAgentConfig {
  maxPhases: number;
  enableRiskAnalysis: boolean;
  enableRollbackStrategy: boolean;
  maxTokens: number;
}

export interface PlanPhase {
  order: number;
  name: string;
  description: string;
  files: string[];
  estimatedComplexity: "low" | "medium" | "high";
  dependencies: string[];
  risks: string[];
  rollbackStrategy: string;
}

export interface PlanResult {
  phases: PlanPhase[];
  risks: string[];
  testChecklist: string[];
  summary: string;
  evidence: string[];
  openQuestions: string[];
  recommendedAgents: string[];
}

const DEFAULT_CONFIG: PlanAgentConfig = {
  maxPhases: 5,
  enableRiskAnalysis: true,
  enableRollbackStrategy: true,
  maxTokens: 4096,
};

const READONLY_TOOLS = ["Read", "Glob", "Grep", "LS", "GitStatus", "GitLog", "GitDiff"];

const SYSTEM_PROMPT = `You are a Plan agent — an architecture and strategy planner. Your ONLY job is to READ code, analyze architecture, and produce actionable implementation plans.

## HARD CONSTRAINTS (VIOLATION = FAILURE)
1. READ-ONLY: You MUST NOT create, modify, move, or delete files.
2. Bash is restricted to: ls, git status, git log, git diff, find, grep, tree
3. You MUST NOT invoke the Task tool or spawn subagents.
4. You MUST NOT ask for clarification — make reasonable assumptions and proceed.
5. You MUST return structured plans, not vague suggestions.

## PLANNING PRINCIPLES
1. Think before acting: analyze architecture, identify dependencies, assess risks
2. Phase decomposition: break work into sequential, verifiable stages
3. Risk-first: identify what could go wrong before suggesting what to do
4. Rollback-aware: every phase should have a rollback strategy
5. Test-driven: include a test checklist for each phase

## OUTPUT FORMAT
When complete, return a structured plan:

### Phase 1: [Name]
- Description: [what to do]
- Files: [list of files to touch]
- Complexity: [low/medium/high]
- Dependencies: [what must be done first]
- Risks: [what could go wrong]
- Rollback: [how to undo if it fails]

### Phase 2: [Name]
...

### Risks
- [Risk 1]
- [Risk 2]

### Test Checklist
- [ ] Test 1
- [ ] Test 2

### Recommended Agents
- [Agent type] for [reason]

### Open Questions
- [Any ambiguities]

## IMPORTANT
- Be specific: file paths, function names, line numbers
- Do NOT implement changes — that is the Worker's job
- Do NOT just search — that is the Explore agent's job
- Focus on HOW and IN WHAT ORDER, not just WHAT`;

export class PlanAgent {
  private config: PlanAgentConfig;
  private llmProvider: ((messages: Array<{ role: string; content: string }>, tools: ToolDefinition[]) => Promise<{ content: string }>) | null = null;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;

  constructor(config?: Partial<PlanAgentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setLlmProvider(provider: (messages: Array<{ role: string; content: string }>, tools: ToolDefinition[]) => Promise<{ content: string }>): void {
    this.llmProvider = provider;
  }

  setToolExecutor(executor: (toolName: string, args: Record<string, unknown>) => Promise<unknown>): void {
    this.toolExecutor = executor;
  }

  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  getAllowedTools(availableTools: ToolDefinition[]): ToolDefinition[] {
    const allowedSet = new Set(READONLY_TOOLS);
    return availableTools.filter((t) => allowedSet.has(t.name));
  }

  async execute(
    taskDescription: string,
    availableTools: ToolDefinition[],
    projectDir: string
  ): Promise<PlanResult> {
    const allowedTools = this.getAllowedTools(availableTools);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Fork started — processing in background: ${taskDescription}\n\nProject directory: ${projectDir}\n\nTask: ${taskDescription}`,
      },
    ];

    if (!this.llmProvider) {
      throw new Error("LLM provider not configured");
    }

    const response = await this.llmProvider(messages, allowedTools);

    return this.parseResponse(response.content);
  }

  private parseResponse(content: string): PlanResult {
    const phases: PlanPhase[] = [];
    const risks: string[] = [];
    const testChecklist: string[] = [];
    const evidence: string[] = [];
    const openQuestions: string[] = [];
    const recommendedAgents: string[] = [];

    const phaseRegex = /^###\s*Phase\s+(\d+):\s*(.+)$/gm;
    let match;
    let currentPhase: PlanPhase | null = null;

    const lines = content.split("\n");
    for (const line of lines) {
      const phaseMatch = line.match(/^###\s*Phase\s+(\d+):\s*(.+)$/);
      if (phaseMatch) {
        if (currentPhase) phases.push(currentPhase);
        currentPhase = {
          order: parseInt(phaseMatch[1], 10),
          name: phaseMatch[2].trim(),
          description: "",
          files: [],
          estimatedComplexity: "medium",
          dependencies: [],
          risks: [],
          rollbackStrategy: "",
        };
        continue;
      }

      if (currentPhase) {
        const descMatch = line.match(/^-?\s*Description:\s*(.+)$/);
        if (descMatch) { currentPhase.description = descMatch[1].trim(); continue; }

        const filesMatch = line.match(/^-?\s*Files:\s*(.+)$/);
        if (filesMatch) { currentPhase.files = filesMatch[1].split(",").map((f) => f.trim()); continue; }

        const complexityMatch = line.match(/^-?\s*Complexity:\s*(low|medium|high)$/i);
        if (complexityMatch) { currentPhase.estimatedComplexity = complexityMatch[1].toLowerCase() as PlanPhase["estimatedComplexity"]; continue; }

        const depsMatch = line.match(/^-?\s*Dependencies:\s*(.+)$/);
        if (depsMatch) { currentPhase.dependencies = depsMatch[1].split(",").map((d) => d.trim()); continue; }

        const phaseRiskMatch = line.match(/^-?\s*Risks?:\s*(.+)$/);
        if (phaseRiskMatch) { currentPhase.risks = phaseRiskMatch[1].split(",").map((r) => r.trim()); continue; }

        const rollbackMatch = line.match(/^-?\s*Rollback:\s*(.+)$/);
        if (rollbackMatch) { currentPhase.rollbackStrategy = rollbackMatch[1].trim(); continue; }
      }

      const riskMatch = line.match(/^[-*]\s*(.+)$/);
      if (line.startsWith("### Risks") || line.startsWith("## Risks")) {
        continue;
      }
      if (riskMatch && !line.startsWith("###") && !line.startsWith("##")) {
        risks.push(riskMatch[1].trim());
      }

      const testMatch = line.match(/^[-*]\s*\[.\]\s*(.+)$/);
      if (testMatch) {
        testChecklist.push(testMatch[1].trim());
      }

      const agentMatch = line.match(/^[-*]\s*(\w+)\s+for\s+(.+)$/);
      if (agentMatch) {
        recommendedAgents.push(agentMatch[1].trim());
      }

      const questionMatch = line.match(/^[-*]\s*(.+?\?)$/);
      if (questionMatch) {
        openQuestions.push(questionMatch[1].trim());
      }
    }

    if (currentPhase) phases.push(currentPhase);

    return {
      phases,
      risks,
      testChecklist,
      summary: this.extractSummary(content),
      evidence,
      openQuestions,
      recommendedAgents,
    };
  }

  private extractSummary(content: string): string {
    const lines = content.split("\n").filter((l) => l.trim());
    const firstMeaningful = lines.find((l) => !l.startsWith("#") && !l.startsWith("-") && l.trim().length > 20);
    return firstMeaningful?.trim() || content.slice(0, 200);
  }
}

export function createPlanAgent(config?: Partial<PlanAgentConfig>): PlanAgent {
  return new PlanAgent(config);
}
