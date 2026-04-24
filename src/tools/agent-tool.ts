import type { ToolDefinition, ToolContext } from "../types/index.js";
import type { SubAgentCache, RecursionGuard } from "../agent-cache/types.js";
import { buildForkKey } from "../agent-cache/cache.js";

export interface AgentToolConfig {
  maxDepth: number;
  cache: SubAgentCache;
  guard: RecursionGuard;
  executeSubAgent: (task: string, context: Record<string, unknown>) => Promise<unknown>;
}

export function createAgentTool(config: AgentToolConfig): ToolDefinition {
  return {
    name: "agent",
    description: "Delegate a sub-task to a sub-agent. Use for parallel exploration, verification, or complex multi-step tasks. Sub-agents cannot create further sub-agents.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The task to delegate" },
        context: { type: "object", description: "Context to pass to the sub-agent" },
        readonly: { type: "boolean", description: "Whether the sub-agent should only read", default: true },
      },
      required: ["task"],
    },
    isConcurrencySafe: true,
    isReadOnly: false,
    async handler(input: unknown, _ctx: ToolContext): Promise<unknown> {
      const args = input as Record<string, unknown>;
      const task = String(args.task);
      const context = (args.context as Record<string, unknown>) || {};
      const readonly = Boolean(args.readonly ?? true);

      // Check recursion depth
      if (!config.guard.check(config.guard.getCurrentDepth() + 1)) {
        return "Error: Maximum sub-agent recursion depth reached. Sub-agents cannot create further sub-agents.";
      }

      // Check cache
      const parentId = context.parentId as string || "root";
      const cacheKey = buildForkKey(parentId, task, context);
      const cached = config.cache.get(cacheKey);
      if (cached) {
        return `Cached result:\n${JSON.stringify(cached.result, null, 2)}`;
      }

      // Execute sub-agent
      config.guard.enter();
      try {
        const result = await config.executeSubAgent(task, {
          ...context,
          readonly,
          depth: config.guard.getCurrentDepth(),
        });

        // Cache result
        config.cache.set(cacheKey, {
          key: cacheKey,
          result,
          timestamp: Date.now(),
          ttl: 5 * 60 * 1000, // 5 minutes
          forkPrefix: parentId,
        });

        return JSON.stringify(result, null, 2);
      } catch (e) {
        return `Sub-agent error: ${(e as Error).message}`;
      } finally {
        config.guard.exit();
      }
    },
  };
}
