import type { AgentConfig, ToolDefinition } from "../types/index.js";
import type { MemorySystem } from "../memory/types.js";
import type { PromptCache } from "../cache/types.js";

export interface PromptLayer {
  name: string;
  content: string;
  stability: "static" | "dynamic";
  priority: number;
  cacheable?: boolean;
}

export interface SystemPromptBuilder {
  build(ctx: PromptContext, cache?: PromptCache): Promise<string>;
  buildCacheable(ctx: PromptContext, cache?: PromptCache): Promise<{ prefix: string; dynamic: string }>;
  getLayers(ctx: PromptContext): Promise<PromptLayer[]>;
}

export interface PromptContext {
  config: AgentConfig;
  tools: ToolDefinition[];
  memory: MemorySystem;
  cwd: string;
  turn: number;
  sessionId?: string;
  mcpInstructions?: string[];
}

export class DefaultSystemPromptBuilder implements SystemPromptBuilder {
  async build(ctx: PromptContext, cache?: PromptCache): Promise<string> {
    const { prefix, dynamic } = await this.buildCacheable(ctx, cache);
    const boundary = "\n\n=== DYNAMIC POLICY BELOW ===\n\n";
    return prefix + boundary + dynamic;
  }

  async buildCacheable(ctx: PromptContext, cache?: PromptCache): Promise<{ prefix: string; dynamic: string }> {
    const layers = await this.getLayers(ctx);

    const staticParts: string[] = [];
    const dynamicParts: string[] = [];

    for (const layer of layers.sort((a, b) => a.priority - b.priority)) {
      if (layer.stability === "static") {
        const content = `<!-- ${layer.name} -->\n${layer.content}`;
        if (layer.cacheable && cache) {
          const cacheKey = `prompt_layer_${layer.name}`;
          const cached = cache.get(cacheKey);
          if (cached) {
            staticParts.push(`[CACHED]<!-- ${layer.name} -->\n${cached}`);
            continue;
          }
          cache.set(cacheKey, layer.content);
        }
        staticParts.push(content);
      } else {
        dynamicParts.push(`<!-- ${layer.name} -->\n${layer.content}`);
      }
    }

    return {
      prefix: staticParts.join("\n\n"),
      dynamic: dynamicParts.join("\n\n"),
    };
  }

  async getLayers(ctx: PromptContext): Promise<PromptLayer[]> {
    const layers: PromptLayer[] = [];

    // === STATIC LAYERS (cached prefix) ===

    // 1. Identity & Constitution
    layers.push({
      name: "identity",
      stability: "static",
      cacheable: true,
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
      cacheable: true,
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

    // 3. Task Philosophy
    layers.push({
      name: "task_philosophy",
      stability: "static",
      cacheable: true,
      priority: 3,
      content: `Task completion principles:
- Focus on the user's actual request; avoid scope creep
- Prefer practical solutions over theoretical perfection
- Resist over-engineering: write code that solves the problem, not code that impresses
- If a simpler approach exists, use it
- "Done is better than perfect" - ship working code over polished prototypes`,
    });

    // 4. Tool Discipline
    const toolDescriptions = ctx.tools
      .map((t) => `- ${t.name}: ${t.description} (${t.isReadOnly ? "read-only" : "read-write"})`)
      .join("\n");

    layers.push({
      name: "tool_discipline",
      stability: "static",
      cacheable: true,
      priority: 4,
      content: `Available tools:\n${toolDescriptions}\n\nTool usage rules:\n- Use read-only tools before read-write tools\n- Batch independent read operations\n- Never use rm -rf / or similar dangerous commands\n- Respect permission modes`,
    });

    // 5. Safety & Security
    layers.push({
      name: "safety",
      stability: "static",
      cacheable: true,
      priority: 5,
      content: `Security rules:
- Never expose API keys, tokens, or credentials
- Do not execute untrusted code
- Respect .gitignore and sensitive files
- Warn before modifying configuration files`,
    });

    // 6. Voice & Tone
    layers.push({
      name: "voice_tone",
      stability: "static",
      cacheable: true,
      priority: 6,
      content: `Communication style:
- Be concise: prefer short, direct responses
- Use code blocks for code snippets
- Avoid filler words and unnecessary caveats
- When unsure, say "I don't know" rather than guessing
- If you need more information, ask one focused question`,
    });

    // === DYNAMIC LAYERS (below boundary) ===

    // 7. Session Preamble (turn-based)
    layers.push({
      name: "session_preamble",
      stability: "dynamic",
      priority: 10,
      content: `Current turn: ${ctx.turn}\nSession: ${ctx.sessionId || "new"}\nWorking directory: ${ctx.cwd}`,
    });

    // 8. Memory Injections (max 5)
    const memoryContext = await ctx.memory.inject("current task", { cwd: ctx.cwd });
    if (memoryContext) {
      layers.push({
        name: "memory_injections",
        stability: "dynamic",
        priority: 11,
        content: memoryContext,
      });
    }

    // 9. Environment Snapshot
    layers.push({
      name: "environment",
      stability: "dynamic",
      priority: 12,
      content: `Environment:\n- OS: ${process.platform}\n- Node: ${process.version}\n- Shell: ${process.env.SHELL || "unknown"}`,
    });

    // 10. MCP Server Instructions (from connected MCP servers)
    if (ctx.mcpInstructions && ctx.mcpInstructions.length > 0) {
      const mcpContent = ctx.mcpInstructions
        .map((inst, i) => `## MCP Server ${i + 1}\n${inst}`)
        .join("\n\n");
      layers.push({
        name: "mcp_instructions",
        stability: "dynamic",
        priority: 14,
        content: `### MCP Server Instructions\n${mcpContent}`,
      });
    }

    // 11. Token Budget Hint
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
