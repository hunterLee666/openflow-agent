import type { ToolDefinition } from "../types/index.js";
import { z } from "zod";

export const ExploreAgentConfigSchema = z.object({
  maxSearchResults: z.number(),
  maxDepth: z.number(),
  enableSymbolSearch: z.boolean(),
  enableCallChainAnalysis: z.boolean(),
  maxTokens: z.number(),
});

export const ExploreSymbolSchema = z.object({
  name: z.string(),
  type: z.enum(["function", "class", "variable", "import", "export"]),
  file: z.string(),
  line: z.number().optional(),
  usageCount: z.number().optional(),
});

export const ExploreResultSchema = z.object({
  files: z.array(z.string()),
  symbols: z.array(ExploreSymbolSchema),
  directoryStructure: z.array(z.string()),
  gitStatus: z.string().optional(),
  summary: z.string(),
  evidence: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type ExploreAgentConfig = z.infer<typeof ExploreAgentConfigSchema>;
export type ExploreSymbol = z.infer<typeof ExploreSymbolSchema>;
export type ExploreResult = z.infer<typeof ExploreResultSchema>;

const DEFAULT_CONFIG: ExploreAgentConfig = {
  maxSearchResults: 50,
  maxDepth: 3,
  enableSymbolSearch: true,
  enableCallChainAnalysis: false,
  maxTokens: 4096,
};

const READONLY_TOOLS = ["Read", "Glob", "Grep", "LS", "GitStatus", "GitLog", "GitDiff"];

const SYSTEM_PROMPT = `You are an Explore agent — a codebase GPS. Your ONLY job is to READ and LOCATE files, symbols, and call chains.

## HARD CONSTRAINTS (VIOLATION = FAILURE)
1. READ-ONLY: You MUST NOT create, modifying, moving, or deleting files.
2. Bash is restricted to: ls, git status, git log, git diff, find, grep, tree
3. You MUST NOT invoke the Task tool or spawn subagents.
4. You MUST NOT ask for clarification — make reasonable assumptions and proceed.
5. You MUST return structured findings, not opinions.

## OUTPUT FORMAT
When complete, return a structured summary:

### Files Found
- path/to/file1.ext (reason)
- path/to/file2.ext (reason)

### Key Symbols
- FunctionName in file:line — brief description
- ClassName in file:line — brief description

### Directory Structure
- Relevant directories and their purposes

### Evidence
- Specific line numbers and code snippets that support your findings

### Open Questions
- Any ambiguities or areas needing further exploration

## IMPORTANT
- Be thorough but concise
- Include file paths and line numbers for all claims
- Do NOT suggest changes — that is the Worker's job
- Do NOT plan architecture — that is the Plan agent's job`;

export class ExploreAgent {
  private config: ExploreAgentConfig;
  private llmProvider: ((messages: Array<{ role: string; content: string }>, tools: ToolDefinition[]) => Promise<{ content: string }>) | null = null;
  private toolExecutor: ((toolName: string, args: Record<string, unknown>) => Promise<unknown>) | null = null;

  constructor(config?: Partial<ExploreAgentConfig>) {
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
  ): Promise<ExploreResult> {
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

  private parseResponse(content: string): ExploreResult {
    const files: string[] = [];
    const symbols: ExploreSymbol[] = [];
    const directoryStructure: string[] = [];
    const evidence: string[] = [];
    const openQuestions: string[] = [];

    const fileRegex = /^[-*]\s*(.+?\.\w+)\s*(?:\((.+?)\))?$/gm;
    let match;
    while ((match = fileRegex.exec(content)) !== null) {
      files.push(match[1].trim());
    }

    const symbolRegex = /^[-*]\s*(\w+)\s+in\s+(\S+?)(?::(\d+))?\s*[—-]\s*(.+)$/gm;
    while ((match = symbolRegex.exec(content)) !== null) {
      symbols.push({
        name: match[1],
        type: this.detectSymbolType(match[1]),
        file: match[2],
        line: match[3] ? parseInt(match[3], 10) : undefined,
        usageCount: undefined,
      });
    }

    const evidenceRegex = /^[-*]\s*(.+?)(?::(\d+))?\s*[—-]\s*(.+)$/gm;
    while ((match = evidenceRegex.exec(content)) !== null) {
      evidence.push(`${match[1]}${match[2] ? `:${match[2]}` : ""} — ${match[3]}`);
    }

    const questionRegex = /^[-*]\s*(.+?\?)$/gm;
    while ((match = questionRegex.exec(content)) !== null) {
      openQuestions.push(match[1].trim());
    }

    return {
      files,
      symbols,
      directoryStructure,
      summary: this.extractSummary(content),
      evidence,
      openQuestions,
    };
  }

  private detectSymbolType(name: string): ExploreSymbol["type"] {
    if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) return "class";
    if (name.startsWith("use") || name.startsWith("handle") || name.startsWith("get")) return "function";
    return "variable";
  }

  private extractSummary(content: string): string {
    const lines = content.split("\n").filter((l) => l.trim());
    const firstMeaningful = lines.find((l) => !l.startsWith("#") && !l.startsWith("-") && l.trim().length > 20);
    return firstMeaningful?.trim() || content.slice(0, 200);
  }
}

export function createExploreAgent(config?: Partial<ExploreAgentConfig>): ExploreAgent {
  return new ExploreAgent(config);
}
