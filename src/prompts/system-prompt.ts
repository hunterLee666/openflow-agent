import type { AgentConfig, ToolDefinition } from "../types/index.js";
import type { MemorySystem } from "../memory/types.js";

export interface PromptLayer {
  name: string;
  content: string;
  stability: "static" | "dynamic";
  priority: number;
}

export interface SystemPromptBuilder {
  build(ctx: PromptContext): Promise<string>;
  getLayers(ctx: PromptContext): Promise<PromptLayer[]>;
}

export interface PromptContext {
  config: AgentConfig;
  tools: ToolDefinition[];
  memory: MemorySystem;
  cwd: string;
  turn: number;
  sessionId?: string;
}

export class DefaultSystemPromptBuilder implements SystemPromptBuilder {
  async build(ctx: PromptContext): Promise<string> {
    const layers = await this.getLayers(ctx);
    const boundary = "\n\n=== DYNAMIC POLICY BELOW ===\n\n";

    const staticParts: string[] = [];
    const dynamicParts: string[] = [];

    for (const layer of layers.sort((a, b) => a.priority - b.priority)) {
      if (layer.stability === "static") {
        staticParts.push(`<!-- ${layer.name} -->\n${layer.content}`);
      } else {
        dynamicParts.push(`<!-- ${layer.name} -->\n${layer.content}`);
      }
    }

    return [
      staticParts.join("\n\n"),
      boundary,
      dynamicParts.join("\n\n"),
    ].join("\n");
  }

  async getLayers(ctx: PromptContext): Promise<PromptLayer[]> {
    const layers: PromptLayer[] = [];

    // === STATIC LAYERS (cached prefix) ===

    // 1. Identity & Constitution
    layers.push({
      name: "identity",
      stability: "static",
      priority: 1,
      content: `You are an AI coding assistant operating in a terminal environment.
Your role is to help users write, read, debug, and modify code safely and efficiently.

Core principles:
- Always read files before modifying them
- Ask for confirmation before destructive operations
- Provide clear explanations of your actions
- Prefer incremental changes over large rewrites`,
    });

    // 2. Operational Norms
    layers.push({
      name: "operational_norms",
      stability: "static",
      priority: 2,
      content: `Work method:
1. Plan: Understand the request and identify affected files
2. Read: Use read_file to examine current code
3. Modify: Make targeted changes with write_file or bash
4. Verify: Confirm changes are correct
5. Report: Summarize what was done

Error handling:
- If a tool fails, report the error clearly
- Do not guess file contents; always read first
- If uncertain, ask the user for clarification`,
    });

    // 3. Tool Discipline
    const toolDescriptions = ctx.tools
      .map((t) => `- ${t.name}: ${t.description} (${t.isReadOnly ? "read-only" : "read-write"})`)
      .join("\n");

    layers.push({
      name: "tool_discipline",
      stability: "static",
      priority: 3,
      content: `Available tools:\n${toolDescriptions}\n\nTool usage rules:\n- Use read-only tools before read-write tools\n- Batch independent read operations\n- Never use rm -rf / or similar dangerous commands\n- Respect permission modes`,
    });

    // 4. Safety & Security
    layers.push({
      name: "safety",
      stability: "static",
      priority: 4,
      content: `Security rules:
- Never expose API keys, tokens, or credentials
- Do not execute untrusted code
- Respect .gitignore and sensitive files
- Warn before modifying configuration files`,
    });

    // === DYNAMIC LAYERS (below boundary) ===

    // 5. Session Preamble (turn-based)
    layers.push({
      name: "session_preamble",
      stability: "dynamic",
      priority: 10,
      content: `Current turn: ${ctx.turn}\nSession: ${ctx.sessionId || "new"}\nWorking directory: ${ctx.cwd}`,
    });

    // 6. Memory Injections (max 5)
    const memoryContext = await ctx.memory.inject("current task", { cwd: ctx.cwd });
    if (memoryContext) {
      layers.push({
        name: "memory_injections",
        stability: "dynamic",
        priority: 11,
        content: memoryContext,
      });
    }

    // 7. Environment Snapshot
    layers.push({
      name: "environment",
      stability: "dynamic",
      priority: 12,
      content: `Environment:\n- OS: ${process.platform}\n- Node: ${process.version}\n- Shell: ${process.env.SHELL || "unknown"}`,
    });

    // 8. Token Budget Hint
    layers.push({
      name: "budget_hint",
      stability: "dynamic",
      priority: 13,
      content: `Context management: Be concise. Avoid redundant explanations. Prefer code over prose when possible.`,
    });

    return layers;
  }
}

export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "=== DYNAMIC POLICY BELOW ===";
