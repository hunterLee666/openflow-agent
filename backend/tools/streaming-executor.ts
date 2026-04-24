import type { ToolDefinition, ToolContext } from "../types/index.js";
import type { TrackedTool, ConcurrencyConfig, ToolProgressEvent } from "./types.js";
import { DEFAULT_CONCURRENCY_CONFIG } from "./types.js";
import { safeValidateInput, safeValidateOutput } from "./validation.js";

export interface StreamingExecutorOptions {
  concurrency?: Partial<ConcurrencyConfig>;
  onToolStart?: (tool: TrackedTool) => void;
  onToolEnd?: (tool: TrackedTool, result: unknown) => void;
  onToolError?: (tool: TrackedTool, error: Error) => void;
  onProgress?: (event: ToolProgressEvent) => void;
  abortSignal?: AbortSignal;
}

export interface ToolExecutionResult {
  toolUseId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  isConcurrencySafe: boolean;
}

export class StreamingToolExecutor {
  private tools: TrackedTool[] = [];
  private toolMap = new Map<string, TrackedTool>();
  private executing = new Set<string>();
  private abortController: AbortController;
  private discarded = false;
  private progressAvailableResolve?: () => void;
  private results: ToolExecutionResult[] = [];

  constructor(
    private readonly toolRegistry: { get(name: string): ToolDefinition | undefined },
    options: StreamingExecutorOptions = {}
  ) {
    this.abortController = new AbortController();

    if (options.abortSignal) {
      options.abortSignal.addEventListener("abort", () => {
        this.abortController.abort();
      });
    }
  }

  addTool(toolUseId: string, name: string, input: Record<string, unknown>): void {
    if (this.discarded) return;

    const tool = this.toolRegistry.get(name);
    if (!tool) {
      this.tools.push({
        id: toolUseId,
        name,
        input,
        status: "error",
        isConcurrencySafe: false,
        progressEvents: [],
      });
      this.toolMap.set(toolUseId, this.tools[this.tools.length - 1]);
      return;
    }

    const isConcurrencySafe = tool.isConcurrencySafe ?? false;

    const tracked: TrackedTool = {
      id: toolUseId,
      name,
      input,
      status: "queued",
      isConcurrencySafe,
      progressEvents: [],
    };

    this.tools.push(tracked);
    this.toolMap.set(toolUseId, tracked);
  }

  private canExecuteTool(isConcurrencySafe: boolean): boolean {
    if (this.executing.size === 0) return true;

    if (isConcurrencySafe) {
      return Array.from(this.executing).every((id) => {
        const tool = this.toolMap.get(id);
        return tool?.isConcurrencySafe === true;
      });
    }

    return false;
  }

  private async processQueue(): Promise<void> {
    while (this.tools.length > 0) {
      const pendingTool = this.tools.find(
        (t) =>
          t.status === "queued" &&
          this.canExecuteTool(t.isConcurrencySafe)
      );

      if (!pendingTool) {
        if (this.executing.size === 0) {
          const hasUnprocessableTool = this.tools.some((t) => t.status === "queued");
          if (hasUnprocessableTool) {
            const nonConcurrentTool = this.tools.find(
              (t) => t.status === "queued" && !t.isConcurrencySafe
            );
            if (nonConcurrentTool) {
              await this.executeTool(nonConcurrentTool);
            }
          }
        }
        await new Promise<void>((resolve) => {
          this.progressAvailableResolve = resolve;
        });
        continue;
      }

      await this.executeTool(pendingTool);
    }
  }

  private async executeTool(tracked: TrackedTool): Promise<void> {
    const tool = this.toolRegistry.get(tracked.name);
    if (!tool) {
      tracked.status = "error";
      this.finalizeTool(tracked, { toolUseId: tracked.id, success: false, error: `Tool not found: ${tracked.name}`, durationMs: 0, isConcurrencySafe: tracked.isConcurrencySafe });
      return;
    }

    if (this.abortController.signal.aborted || this.discarded) {
      tracked.status = "cancelled";
      this.finalizeTool(tracked, { toolUseId: tracked.id, success: false, error: "Aborted", durationMs: 0, isConcurrencySafe: tracked.isConcurrencySafe });
      return;
    }

    tracked.status = "executing";
    tracked.startTime = Date.now();
    this.executing.add(tracked.id);

    const timeoutMs = 300000;

    try {
      const inputResult = safeValidateInput(tool.inputSchema, tracked.input);

      if (!inputResult.ok) {
        tracked.status = "error";
        const errorResult = {
          toolUseId: tracked.id,
          success: false,
          error: `Input validation failed: ${JSON.stringify(inputResult.error.issues)}`,
          durationMs: Date.now() - tracked.startTime,
          isConcurrencySafe: tracked.isConcurrencySafe,
        };
        this.finalizeTool(tracked, errorResult);
        return;
      }

      const toolContext: ToolContext = {
        cwd: process.cwd(),
        signal: this.abortController.signal,
        config: {} as any,
      };

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Tool timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      const handlerPromise = tool.handler(inputResult.data, toolContext);

      const rawOutput = await Promise.race([handlerPromise, timeoutPromise]);

      if (tool.outputSchema) {
        const outputResult = safeValidateOutput(tool.outputSchema, rawOutput);
        if (!outputResult.ok) {
          tracked.status = "error";
          const errorResult = {
            toolUseId: tracked.id,
            success: false,
            error: `Output validation failed: ${JSON.stringify(outputResult.error.issues)}`,
            durationMs: Date.now() - tracked.startTime,
            isConcurrencySafe: tracked.isConcurrencySafe,
          };
          this.finalizeTool(tracked, errorResult);
          return;
        }
        tracked.result = { success: true, data: outputResult.data };
      } else {
        tracked.result = { success: true, data: rawOutput };
      }

      tracked.status = "completed";
      tracked.endTime = Date.now();

      const successResult: ToolExecutionResult = {
        toolUseId: tracked.id,
        success: true,
        data: tracked.result.data,
        durationMs: tracked.endTime - tracked.startTime,
        isConcurrencySafe: tracked.isConcurrencySafe,
      };
      this.finalizeTool(tracked, successResult);

    } catch (error) {
      tracked.status = "error";
      tracked.endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorResult: ToolExecutionResult = {
        toolUseId: tracked.id,
        success: false,
        error: errorMessage,
        durationMs: tracked.endTime - tracked.startTime,
        isConcurrencySafe: tracked.isConcurrencySafe,
      };
      this.finalizeTool(tracked, errorResult);
    }
  }

  private finalizeTool(tracked: TrackedTool, result: ToolExecutionResult): void {
    this.executing.delete(tracked.id);
    this.results.push(result);
    this.progressAvailableResolve?.();
  }

  async *execute(): AsyncGenerator<ToolExecutionResult, void, unknown> {
    const processPromise = this.processQueue();

    for (const result of this.results) {
      yield result;
    }
    this.results = [];

    while (this.tools.some((t) => t.status !== "completed" && t.status !== "error" && t.status !== "cancelled")) {
      await new Promise<void>((resolve) => {
        this.progressAvailableResolve = resolve;
      });

      for (const result of this.results) {
        yield result;
      }
      this.results = [];
    }

    await processPromise;

    for (const result of this.results) {
      yield result;
    }
  }

  discard(): void {
    this.discarded = true;
    this.abortController.abort();
    this.tools.forEach((t) => {
      if (t.status === "queued" || t.status === "executing") {
        t.status = "cancelled";
      }
    });
  }

  getTool(toolUseId: string): TrackedTool | undefined {
    return this.toolMap.get(toolUseId);
  }

  getExecutingCount(): number {
    return this.executing.size;
  }

  getQueuedCount(): number {
    return this.tools.filter((t) => t.status === "queued").length;
  }
}

export interface BatchOptions {
  maxConcurrent?: number;
  maxConcurrentReadOnly?: number;
  allowMixedConcurrency?: boolean;
}

export function partitionToolCalls(
  tools: Array<{ toolUseId: string; name: string; input: unknown; isConcurrencySafe?: boolean }>,
  concurrencyConfig?: BatchOptions
): Array<{ isConcurrencySafe: boolean; tools: typeof tools }> {
  const config = { ...DEFAULT_CONCURRENCY_CONFIG, ...concurrencyConfig };
  const batches: Array<{ isConcurrencySafe: boolean; tools: typeof tools }> = [];

  for (const tool of tools) {
    const isConcurrencySafe = tool.isConcurrencySafe ?? false;

    if (config.allowMixedConcurrency) {
      if (batches.length === 0 || batches[batches.length - 1].isConcurrencySafe !== isConcurrencySafe) {
        batches.push({ isConcurrencySafe, tools: [tool] });
      } else {
        batches[batches.length - 1].tools.push(tool);
      }
    } else {
      if (batches.length === 0 || !batches[batches.length - 1].isConcurrencySafe) {
        batches.push({ isConcurrencySafe, tools: [tool] });
      } else {
        batches[batches.length - 1].tools.push(tool);
      }
    }
  }

  return batches;
}

export async function* runToolsConcurrently(
  tools: Array<{ toolUseId: string; name: string; input: Record<string, unknown> }>,
  toolRegistry: { get(name: string): ToolDefinition | undefined },
  ctx: ToolContext,
  options?: StreamingExecutorOptions
): AsyncGenerator<ToolExecutionResult, void, unknown> {
  const executor = new StreamingToolExecutor(toolRegistry, {
    ...options,
    concurrency: { ...options?.concurrency, maxConcurrent: tools.length },
  });

  for (const tool of tools) {
    executor.addTool(tool.toolUseId, tool.name, tool.input);
  }

  yield* executor.execute();
}

export async function* runToolsSerially(
  tools: Array<{ toolUseId: string; name: string; input: Record<string, unknown> }>,
  toolRegistry: { get(name: string): ToolDefinition | undefined },
  ctx: ToolContext,
  options?: StreamingExecutorOptions
): AsyncGenerator<ToolExecutionResult, void, unknown> {
  for (const tool of tools) {
    const executor = new StreamingToolExecutor(toolRegistry, options);

    if (ctx.signal?.aborted) {
      break;
    }

    executor.addTool(tool.toolUseId, tool.name, tool.input);

    for await (const result of executor.execute()) {
      yield result;
    }
  }
}

export async function* runTools(
  tools: Array<{ toolUseId: string; name: string; input: Record<string, unknown>; isConcurrencySafe?: boolean }>,
  toolRegistry: { get(name: string): ToolDefinition | undefined },
  ctx: ToolContext,
  options?: StreamingExecutorOptions
): AsyncGenerator<ToolExecutionResult, void, unknown> {
  const batches = partitionToolCalls(tools, options?.concurrency);

  for (const batch of batches) {
    if (ctx.signal?.aborted) {
      break;
    }

    const batchTools = batch.tools.map((t) => ({
      toolUseId: t.toolUseId,
      name: t.name,
      input: t.input as Record<string, unknown>,
    }));

    if (batch.isConcurrencySafe) {
      yield* runToolsConcurrently(batchTools, toolRegistry, ctx, options);
    } else {
      yield* runToolsSerially(batchTools, toolRegistry, ctx, options);
    }
  }
}
