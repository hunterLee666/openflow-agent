import type { ToolDefinition } from "../types/index.js";
import { z } from "zod";

export const WorkerAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  allowedTools: z.array(z.string()),
});

export type WorkerAgent = z.infer<typeof WorkerAgentSchema>;

export const SwarmAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  allowedTools: z.array(z.string()),
  handoffs: z.array(z.string()),
});

export type SwarmAgent = z.infer<typeof SwarmAgentSchema>;

export const AgentTypeDefinitionSchema = z.object({
  description: z.string(),
  defaultTools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  readonly: z.boolean().optional(),
  canSpawnSubagents: z.boolean().optional(),
});

export type AgentTypeDefinition = z.infer<typeof AgentTypeDefinitionSchema>;

export const BUILTIN_AGENT_TYPES: Record<string, AgentTypeDefinition> = {
  "general-purpose": {
    description: "General-purpose sub-agent for research, code search, and analysis",
    canSpawnSubagents: true,
  },
  "statusline-setup": {
    description: "Configures the status line display format",
    defaultTools: ["Read", "Write"],
  },
  "output-style-setup": {
    description: "Configures the output style and formatting",
    defaultTools: ["Read", "Write"],
  },
  "code-reviewer": {
    description: "Reviews code for quality, security, and best practices",
    defaultTools: ["Read", "Grep", "Glob"],
    readonly: true,
  },
  "test-runner": {
    description: "Runs tests and reports results",
    defaultTools: ["Bash", "Read", "Glob"],
  },
  "file-organizer": {
    description: "Organizes and structures project files",
    defaultTools: ["Read", "Write", "Edit", "LS", "Glob"],
  },
  "explore": {
    description: "Explore agent — read-only codebase GPS for file/symbol/call-chain location",
    defaultTools: ["Read", "Glob", "Grep", "LS", "GitStatus", "GitLog", "GitDiff"],
    readonly: true,
    canSpawnSubagents: false,
  },
  "plan": {
    description: "Plan agent — read-only architecture analysis, phase planning, risk assessment",
    defaultTools: ["Read", "Glob", "Grep", "LS", "GitStatus", "GitLog", "GitDiff"],
    readonly: true,
    canSpawnSubagents: false,
  },
  "verification": {
    description: "Verification agent — independent QA with Build/Test/Lint/adversarial probes",
    defaultTools: ["Read", "Glob", "Grep", "LS", "Bash", "GitStatus", "GitLog", "GitDiff"],
    canSpawnSubagents: false,
  },
  "worker": {
    description: "Worker agent — doer with action bias, no delegation, no questions",
    defaultTools: ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "LS", "Glob", "Grep", "Bash"],
    canSpawnSubagents: false,
  },
};

export function createWorkerAgentFromType(
  agentType: string,
  overrides?: Partial<WorkerAgent>
): WorkerAgent {
  const typeDef = BUILTIN_AGENT_TYPES[agentType] || BUILTIN_AGENT_TYPES["general-purpose"];

  return {
    id: overrides?.id || agentType,
    name: overrides?.name || agentType,
    description: overrides?.description || typeDef.description,
    systemPrompt: overrides?.systemPrompt || buildSystemPromptForType(agentType),
    allowedTools: overrides?.allowedTools || typeDef.defaultTools || [],
  };
}

export function createSwarmAgentFromType(
  agentType: string,
  overrides?: Partial<SwarmAgent>
): SwarmAgent {
  const typeDef = BUILTIN_AGENT_TYPES[agentType] || BUILTIN_AGENT_TYPES["general-purpose"];

  return {
    id: overrides?.id || agentType,
    name: overrides?.name || agentType,
    description: overrides?.description || typeDef.description,
    systemPrompt: overrides?.systemPrompt || buildSystemPromptForType(agentType),
    allowedTools: overrides?.allowedTools || typeDef.defaultTools || [],
    handoffs: overrides?.handoffs || [],
  };
}

export function buildSystemPromptForType(agentType: string): string {
  const prompts: Record<string, string> = {
    "explore": `You are an Explore agent — a codebase GPS. Your ONLY job is to READ and LOCATE files, symbols, and call chains.

## HARD CONSTRAINTS
1. READ-ONLY: You MUST NOT create, modify, move, or delete files.
2. Bash is restricted to: ls, git status, git log, git diff, find, grep, tree
3. You MUST NOT invoke the Task tool or spawn subagents.
4. You MUST NOT ask for clarification — make reasonable assumptions and proceed.
5. You MUST return structured findings, not opinions.`,

    "plan": `You are a Plan agent — an architecture and strategy planner. Your ONLY job is to READ code, analyze architecture, and produce actionable implementation plans.

## HARD CONSTRAINTS
1. READ-ONLY: You MUST NOT create, modify, move, or delete files.
2. Bash is restricted to: ls, git status, git log, git diff, find, grep, tree
3. You MUST NOT invoke the Task tool or spawn subagents.
4. You MUST NOT ask for clarification — make reasonable assumptions and proceed.
5. You MUST return structured plans, not vague suggestions.`,

    "verification": `You are a Verification agent — an independent quality assurance inspector. Your motto is: "Try to break it."

## CORE PRINCIPLES
1. NEVER trust the implementation agent's self-assessment
2. NEVER judge by reading code alone — ALWAYS run executable checks
3. You are INDEPENDENT from the implementation — your job is to FIND FAILURES
4. Evidence over opinions: every judgment must include command output`,

    "worker": `You are a Worker agent — a doer with action bias.

## MANDATORY RULES
1. NO DELEGATION: You MUST NOT invoke the Task tool or spawn subagents.
2. NO QUESTIONS: You MUST NOT ask for clarification. Make reasonable assumptions and proceed.
3. ACTION BIAS: Prefer doing over discussing.
4. CONCISE OUTPUT: Return structured results, not essays.
5. OWN YOUR DECISIONS: If you make an assumption, state it and proceed.`,
  };

  return prompts[agentType] || `You are a specialized sub-agent of type "${agentType}". Focus on the given task and return concise, structured results.`;
}

export function resolveAllowedTools(
  agentType: string,
  allowedTools?: string[],
  availableTools?: ToolDefinition[]
): ToolDefinition[] {
  if (allowedTools && allowedTools.length > 0) {
    if (!availableTools) return [];
    const toolNames = new Set<string>();

    for (const toolRef of allowedTools) {
      if (toolRef.startsWith("group:")) {
        const groupTools = TOOL_GROUPS[toolRef];
        if (groupTools) {
          for (const t of groupTools) {
            toolNames.add(t);
          }
        }
      } else {
        toolNames.add(toolRef);
      }
    }

    return availableTools.filter((t) => toolNames.has(t.name));
  }

  const typeDef = BUILTIN_AGENT_TYPES[agentType];
  if (typeDef?.defaultTools && availableTools) {
    const defaultSet = new Set(typeDef.defaultTools);
    return availableTools.filter((t) => defaultSet.has(t.name));
  }

  return availableTools || [];
}

export const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "LS"],
  "group:search": ["Glob", "Grep"],
  "group:runtime": ["Bash", "BashOutput", "KillShell"],
  "group:web": ["WebFetch", "WebSearch"],
  "group:utility": ["TodoWrite", "ExitPlanMode", "SlashCommand", "Task"],
  "group:git": ["git_status", "git_diff", "git_log", "git_branch"],
};
