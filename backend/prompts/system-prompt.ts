import { z } from "zod";

export const PromptLayerSchema = z.object({
  name: z.string(),
  content: z.string(),
  stability: z.enum(["static", "dynamic"]),
  priority: z.number(),
  cacheable: z.boolean().optional(),
});

export type PromptLayer = z.infer<typeof PromptLayerSchema>;

export interface PromptContext {
  config: Record<string, unknown>;
  tools: Array<{ name: string; description: string; isReadOnly?: boolean }>;
  memory?: {
    inject: (topic: string, ctx: Record<string, unknown>) => Promise<string | null>;
  };
  cwd: string;
  turn: number;
  sessionId?: string;
  mcpInstructions?: string[];
  enableLazyToolLoading?: boolean;
  openflowMdStack?: string;
  memoryInjections?: string;
  memoryWarnings?: string[];
  tokenBudget?: number;
  disabledModelInvocations?: Set<string>;
}

export interface PromptCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export interface SystemPromptBuilder {
  build(ctx: PromptContext, cache?: PromptCache): Promise<string>;
  buildCacheable(ctx: PromptContext, cache?: PromptCache): Promise<{ prefix: string; dynamic: string }>;
  getLayers(ctx: PromptContext): Promise<PromptLayer[]>;
}

export class DefaultSystemPromptBuilder implements SystemPromptBuilder {
  private toolManualRegistry?: any;
  private cacheMonitor?: any;

  setToolManualRegistry(registry: any): void {
    this.toolManualRegistry = registry;
  }

  setCacheMonitor(monitor: any): void {
    this.cacheMonitor = monitor;
  }

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
- If a tool failed, report the error clearly
- Do not guess file contents; always read first
- If uncertain, ask the user for clarification`,
    });

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

    const toolDescriptions = ctx.tools
      .map((t) => `- ${t.name}: ${t.description} (${t.isReadOnly ? "read-only" : "read-write"})`)
      .join("\n");

    if (ctx.enableLazyToolLoading && this.toolManualRegistry) {
      layers.push({
        name: "tool_discipline",
        stability: "static",
        cacheable: true,
        priority: 4,
        content: `Available tools (summary):\n${toolDescriptions}\n\nTool usage rules:\n- Use read-only tools before read-write tools\n- Batch independent read operations\n- Never use rm -rf / or similar dangerous commands\n- Respect permission modes\n\nFor detailed tool manuals, use the ToolSearch tool to retrieve documentation on demand.`,
      });
    } else {
      layers.push({
        name: "tool_discipline",
        stability: "static",
        cacheable: true,
        priority: 4,
        content: `Available tools:\n${toolDescriptions}\n\nTool usage rules:\n- Use read-only tools before read-write tools\n- Batch independent read operations\n- Never use rm -rf / or similar dangerous commands\n- Respect permission modes`,
      });
    }

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

    layers.push({
      name: "session_preamble",
      stability: "dynamic",
      priority: 10,
      content: `Current turn: ${ctx.turn}\nSession: ${ctx.sessionId || "new"}\nWorking directory: ${ctx.cwd}`,
    });

    if (ctx.openflowMdStack) {
      layers.push({
        name: "project_memory",
        stability: "dynamic",
        priority: 10.5,
        content: ctx.openflowMdStack,
      });
    }

    if (ctx.memoryInjections) {
      layers.push({
        name: "memory_injections",
        stability: "dynamic",
        priority: 11,
        content: ctx.memoryInjections,
      });
    } else if (ctx.memory) {
      try {
        const memoryContext = await ctx.memory.inject("current task", { cwd: ctx.cwd });
        if (memoryContext) {
          layers.push({
            name: "memory_injections",
            stability: "dynamic",
            priority: 11,
            content: memoryContext,
          });
        }
      } catch (e) {
        console.error("Memory injection failed:", e);
      }
    }

    if (ctx.memoryWarnings && ctx.memoryWarnings.length > 0) {
      layers.push({
        name: "memory_warnings",
        stability: "dynamic",
        priority: 11.5,
        content: `⚠️ Memory Warnings:\n${ctx.memoryWarnings.map((w) => `- ${w}`).join("\n")}`,
      });
    }

    layers.push({
      name: "environment",
      stability: "dynamic",
      priority: 12,
      content: `Environment:\n- OS: ${process.platform}\n- Node: ${process.version}\n- Shell: ${process.env.SHELL || "unknown"}`,
    });

    if (ctx.mcpInstructions && ctx.mcpInstructions.length > 0) {
      const mcpContent = ctx.mcpInstructions
        .map((inst, i) => `## MCP Server ${i + 1}\n${inst}`)
        .join("\n\n");

      let truncated = mcpContent;
      if (ctx.tokenBudget) {
        const estimatedTokens = this.estimateTokens(mcpContent);
        if (estimatedTokens > ctx.tokenBudget * 0.15) {
          const maxChars = Math.floor((ctx.tokenBudget * 0.15) / estimatedTokens * mcpContent.length);
          truncated = mcpContent.slice(0, maxChars) + "\n\n... (truncated to fit token budget)";
        }
      }

      layers.push({
        name: "mcp_instructions",
        stability: "dynamic",
        priority: 14,
        content: `### MCP Server Instructions\n${truncated}`,
      });
    }

    if (ctx.disabledModelInvocations && ctx.disabledModelInvocations.size > 0) {
      layers.push({
        name: "disabled_invocations",
        stability: "dynamic",
        priority: 15,
        content: `### Disabled Model Invocations\nThe following tools/commands must NOT be called automatically by the model:\n${Array.from(ctx.disabledModelInvocations).map((t) => `- ${t}`).join("\n")}`,
      });
    }

    layers.push({
      name: "budget_hint",
      stability: "dynamic",
      priority: 13,
      content: `Context management: Be concise. Avoid redundant explanations. Prefer code over prose when possible.`,
    });

    if (this.cacheMonitor) {
      for (const layer of layers) {
        this.cacheMonitor.trackLayerUpdate(layer.name, layer.content);
      }

      const report = this.cacheMonitor.getHealthReport();
      if (report.recommendations.length > 0 && report.recommendations[0].includes("CRITICAL") || report.recommendations[0].includes("WARNING")) {
        console.warn("Prompt cache health warning:", report.recommendations);
      }
    }

    return layers;
  }

  private estimateTokens(text: string): number {
    let tokens = 0;
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length <= 3) tokens += 1;
      else if (word.length <= 6) tokens += 1.5;
      else tokens += Math.ceil(word.length / 4);
    }
    return Math.ceil(tokens);
  }
}

export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "=== DYNAMIC POLICY BELOW ===";
