import type { CapabilityContext, CapabilitySource, ToolDefinition } from "./types/index.js";
import { PluginManager } from "./plugins/index.js";
import { MemoryCore } from "./memory/memory-core.js";
import { GEPASelfEvolution } from "./evolution/index.js";
import { SubAgentSystem } from "./agents/index.js";
import { UnifiedEngine } from "./runtime/unified-engine.js";
import { WorkflowEngine } from "./runtime/workflow-engine.js";
import { VisualizationRenderer } from "./runtime/visualization-renderer.js";
import { LayeredConfigLoader } from "./runtime/layered-config.js";
import { LLMClient, createLLMClient } from "./llm/index.js";
import type { LLMClientConfig, LLMMessage, LLMToolDefinition, StreamCallbacks, CompletionResult } from "./llm/index.js";
import { SessionManager, FileSessionStore } from "./session/index.js";
import type { SessionConfig } from "./session/index.js";
import { query } from "./query/index.js";
import type { QueryInput, QueryResult, StreamEvent, QueryContext, QueryToolRegistry } from "./query/index.js";
import type { Transport, TransportConfig, TransportHandler, TransportMessage } from "./transport/index.js";
import { createTransport } from "./transport/index.js";
import { FourteenStepGovernancePipeline } from "./governance/pipeline.js";
import type { GovernanceContext } from "./governance/types.js";
import { createHookSystem, setupDefaultHooks } from "./hooks/index.js";
import type { HookSystem } from "./hooks/hook-system.js";
import { buildTier3SummaryPrompt, formatTier3Summary, TokenBudgetInjector, createTokenBudgetInjector } from "./compaction/index.js";
import type { Tier3Summary, ContextSegment } from "./compaction/index.js";
import { DefaultSystemPromptBuilder } from "./prompts/system-prompt.js";
import type { PromptContext, PromptCache } from "./prompts/system-prompt.js";
import { createLogger, createMetricsCollector, createHealthChecker } from "./telemetry/index.js";
import type { Logger, MetricsCollector, HealthChecker } from "./telemetry/index.js";
import { TokenRefreshScheduler } from "./token/token-refresh.js";
import { serializeMessages, deserializeMessages } from "./serialization/index.js";
import { CommandRegistry, createCommandRegistry } from "./commands/command-registry.js";
import { createPluginCommands } from "./commands/plugin-commands.js";
import { createAgentCommands } from "./commands/agent-commands.js";
import { createDevCommands } from "./commands/development-commands.js";
import { createLoopCommand } from "./commands/loop-command.js";
import { CronScheduler } from "./scheduler/cron-scheduler.js";

export interface OpenFlowConfig {
  workspaceRoot: string;
  memoryDir: string;
  pluginSources: CapabilitySource[];
  nudgeInterval?: number;
  maxSubAgentConcurrency?: number;
  llmConfig?: LLMClientConfig;
  sessionConfig?: SessionConfig;
  transportConfig?: TransportConfig;
  queryConfig?: {
    maxTokens?: number;
    maxTurns?: number;
    tokenBudget?: number;
    moneyBudgetUsd?: number;
    compactionThreshold?: number;
    maxCompactionFailures?: number;
  };
  visualizationConfig?: {
    port?: number;
    autoOpen?: boolean;
    browser?: string;
  };
  securityConfig?: {
    sandbox?: boolean;
    maxExecutionTime?: number;
    allowNetworkAccess?: boolean;
  };
  governanceConfig?: {
    riskThreshold?: "low" | "medium" | "high";
    maskSensitiveOutputs?: boolean;
  };
  tokenBudgetConfig?: {
    maxTokens?: number;
    reservedTokens?: number;
    enableCompression?: boolean;
  };
  telemetryConfig?: {
    logLevel?: "debug" | "info" | "warn" | "error";
    enableMetrics?: boolean;
    enableHealthCheck?: boolean;
  };
  tokenRefreshConfig?: {
    refreshBeforeExpiryMs?: number;
    defaultExpiryMs?: number;
  };
}

export class OpenFlowCore {
  private pluginManager: PluginManager;
  private memoryCore: MemoryCore;
  private gepa: GEPASelfEvolution;
  private subAgentSystem: SubAgentSystem;
  private unifiedEngine: UnifiedEngine;
  private workflowEngine: WorkflowEngine;
  private visualizationRenderer: VisualizationRenderer;
  private layeredConfigLoader: LayeredConfigLoader;
  private llmClient: LLMClient | null = null;
  private sessionManager: SessionManager;
  private transport: Transport | null = null;
  private abortController: AbortController;
  private config: OpenFlowConfig;

  // 新增模块
  private governancePipeline: FourteenStepGovernancePipeline;
  private hookSystem: HookSystem;
  private systemPromptBuilder: DefaultSystemPromptBuilder;
  private tokenBudgetInjector: TokenBudgetInjector;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private healthChecker: HealthChecker;
  private tokenRefreshScheduler: TokenRefreshScheduler;
  private commandRegistry: CommandRegistry;
  private cronScheduler: CronScheduler;

  constructor(context: CapabilityContext, config: OpenFlowConfig) {
    this.config = config;
    this.abortController = new AbortController();
    this.pluginManager = new PluginManager({
      telemetry: {
        log: (event: string, data?: Record<string, unknown>) => {
          console.debug(`Plugin event: ${event}`, data);
        },
      },
    });
    this.memoryCore = new MemoryCore(config.memoryDir, {
      interval: config.nudgeInterval || 30,
    });
    this.gepa = new GEPASelfEvolution(context, {
      skillDir: `${config.memoryDir}/skills`,
    });
    this.subAgentSystem = new SubAgentSystem({
      maxConcurrency: config.maxSubAgentConcurrency || 5,
    });
    this.unifiedEngine = new UnifiedEngine(
      config.workspaceRoot,
      config.securityConfig?.sandbox ?? true,
      config.securityConfig
    );
    this.workflowEngine = new WorkflowEngine();
    this.visualizationRenderer = new VisualizationRenderer(config.visualizationConfig);
    this.layeredConfigLoader = new LayeredConfigLoader(config.workspaceRoot);
    this.sessionManager = new SessionManager(new FileSessionStore(config.sessionConfig));

    // 初始化新增模块
    const riskThreshold = config.governanceConfig?.riskThreshold || "medium";
    this.governancePipeline = new FourteenStepGovernancePipeline(undefined, riskThreshold);

    this.hookSystem = createHookSystem();
    setupDefaultHooks(this.hookSystem);

    this.systemPromptBuilder = new DefaultSystemPromptBuilder();

    this.tokenBudgetInjector = createTokenBudgetInjector({
      maxTokens: config.tokenBudgetConfig?.maxTokens,
      reservedTokens: config.tokenBudgetConfig?.reservedTokens,
      enableCompression: config.tokenBudgetConfig?.enableCompression,
    });

    this.logger = createLogger({
      minLevel: config.telemetryConfig?.logLevel || "info",
      enableConsole: true,
    }, "openflow-core");

    this.metricsCollector = createMetricsCollector();
    this.healthChecker = createHealthChecker();

    this.tokenRefreshScheduler = new TokenRefreshScheduler({
      refreshBeforeExpiryMs: config.tokenRefreshConfig?.refreshBeforeExpiryMs,
      defaultExpiryMs: config.tokenRefreshConfig?.defaultExpiryMs,
    }, () => {
      return this.config.llmConfig?.apiKey;
    });

    this.commandRegistry = createCommandRegistry();
    this.cronScheduler = new CronScheduler();

    if (config.llmConfig?.apiKey) {
      this.llmClient = createLLMClient({
        apiKey: config.llmConfig.apiKey,
        providerConfig: {},
        provider: config.llmConfig.provider,
        baseUrl: config.llmConfig.baseUrl,
        model: config.llmConfig.model,
        maxTokens: config.llmConfig.maxTokens,
        temperature: config.llmConfig.temperature,
        timeout: config.llmConfig.timeout,
      });
    }

    if (config.transportConfig) {
      const handler: TransportHandler = {
        onMessage: (msg: TransportMessage) => this.handleTransportMessage(msg),
        onError: (err: Error) => console.error("Transport error:", err),
      };
      this.transport = createTransport(config.transportConfig, handler);
    }
  }

  async initialize(): Promise<void> {
    await this.memoryCore.initialize();
    await this.cronScheduler.initialize();

    if (this.config.pluginSources.length > 0) {
      const basePath = this.config.workspaceRoot;
      await this.pluginManager.loadFromDirectory(basePath);
    }

    await this.layeredConfigLoader.loadAll();

    await this.unifiedEngine.initialize();

    this.memoryCore.startNudgeCycle();

    this.registerCommands();
  }

  private registerCommands(): void {
    const pluginCommands = createPluginCommands(this.pluginManager);
    for (const [name, handler] of Object.entries(pluginCommands)) {
      this.commandRegistry.register({
        name: `plugin:${name}`,
        description: `Plugin command: ${name}`,
        handler,
      });
    }

    const agentCommands = createAgentCommands(this.pluginManager);
    for (const [name, handler] of Object.entries(agentCommands)) {
      this.commandRegistry.register({
        name: `agent:${name}`,
        description: `Agent command: ${name}`,
        handler,
      });
    }

    this.commandRegistry.register({
      name: "plugin",
      description: "Manage plugins (list, enable, disable, reload, info, health, stats)",
      handler: async (args: string) => {
        const parts = args.trim().split(/\s+/);
        const subcommand = parts[0] || "list";
        const subArgs = parts.slice(1).join(" ");

        const pluginCommands = createPluginCommands(this.pluginManager);
        const handler = pluginCommands[subcommand];
        if (!handler) {
          return `Unknown plugin subcommand: ${subcommand}\nAvailable: list, enable, disable, reload, info, health, stats`;
        }
        return handler(subArgs);
      },
      aliases: ["plugins"],
    });

    this.commandRegistry.register({
      name: "agent",
      description: "Manage agents (run, analyze, list, modes)",
      handler: async (args: string) => {
        const parts = args.trim().split(/\s+/);
        const subcommand = parts[0] || "list";
        const subArgs = parts.slice(1).join(" ");

        const agentCommands = createAgentCommands(this.pluginManager);
        const handler = agentCommands[subcommand];
        if (!handler) {
          return `Unknown agent subcommand: ${subcommand}\nAvailable: run, analyze, list, modes`;
        }
        return handler(subArgs);
      },
      aliases: ["agents"],
    });

    const devCommands = createDevCommands(this.config.workspaceRoot);

    this.commandRegistry.register({
      name: "review",
      description: "Review code for quality, security, and performance",
      handler: devCommands.review,
      aliases: ["code-review"],
    });

    this.commandRegistry.register({
      name: "init",
      description: "Initialize project with AI configuration",
      handler: devCommands.init,
    });

    this.commandRegistry.register({
      name: "tree",
      description: "Show project directory tree",
      handler: devCommands.tree,
    });

    this.commandRegistry.register({
      name: "overview",
      description: "Show project overview and analysis",
      handler: devCommands.overview,
    });

    this.commandRegistry.register({
      name: "diff",
      description: "View code changes (git diff)",
      handler: devCommands.diff,
      aliases: ["changes"],
    });

    this.commandRegistry.register({
      name: "staged",
      description: "View staged changes",
      handler: devCommands.staged,
    });

    this.commandRegistry.register({
      name: "undo",
      description: "Undo last change or restore to checkpoint",
      handler: devCommands.undo,
      aliases: ["rewind"],
    });

    this.commandRegistry.register({
      name: "checkpoint",
      description: "Manage checkpoints (create, list)",
      handler: devCommands.checkpoint,
      aliases: ["checkpoints"],
    });

    this.commandRegistry.register({
      name: "dev",
      description: "Development commands (review, init, tree, overview, diff, undo, checkpoint)",
      handler: async (args: string) => {
        const parts = args.trim().split(/\s+/);
        const subcommand = parts[0] || "help";
        const subArgs = parts.slice(1).join(" ");

        const commandMap: Record<string, (args: string) => Promise<string>> = {
          review: devCommands.review,
          init: devCommands.init,
          tree: devCommands.tree,
          overview: devCommands.overview,
          diff: devCommands.diff,
          staged: devCommands.staged,
          undo: devCommands.undo,
          checkpoint: devCommands.checkpoint,
        };

        if (subcommand === "help") {
          return `Available development commands:
- /dev review [path] - Review code
- /dev init [name] - Initialize project
- /dev tree [path] - Show directory tree
- /dev overview - Show project overview
- /dev diff [target] - View changes
- /dev staged - View staged changes
- /dev undo [last|to <id>] - Undo changes
- /dev checkpoint [create|list] - Manage checkpoints`;
        }

        const handler = commandMap[subcommand];
        if (!handler) {
          return `Unknown dev subcommand: ${subcommand}\nUse /dev help for available commands`;
        }
        return handler(subArgs);
      },
      aliases: ["development"],
    });

    this.commandRegistry.register({
      name: "loop",
      description: "Create and manage scheduled cron jobs",
      handler: createLoopCommand(this.cronScheduler).handler,
      aliases: ["cron", "schedule"],
    });
  }

  async shutdown(): Promise<void> {
    this.memoryCore.stopNudgeCycle();
    await this.memoryCore.persist();
    await this.pluginManager.shutdown();
    await this.visualizationRenderer.stopServer();
    await this.disconnectTransport();
    await this.cronScheduler.shutdown();

    // 清理新增模块
    this.tokenRefreshScheduler.cancelAll();
    this.logger.info("OpenFlowCore shutdown complete");

    this.abortController.abort();
  }

  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  getCronScheduler(): CronScheduler {
    return this.cronScheduler;
  }

  getCommandRegistry(): CommandRegistry {
    return this.commandRegistry;
  }

  getMemoryCore(): MemoryCore {
    return this.memoryCore;
  }

  getGEPASelfEvolution(): GEPASelfEvolution {
    return this.gepa;
  }

  getSubAgentSystem(): SubAgentSystem {
    return this.subAgentSystem;
  }

  getUnifiedEngine(): UnifiedEngine {
    return this.unifiedEngine;
  }

  getWorkflowEngine(): WorkflowEngine {
    return this.workflowEngine;
  }

  getVisualizationRenderer(): VisualizationRenderer {
    return this.visualizationRenderer;
  }

  getLayeredConfigLoader(): LayeredConfigLoader {
    return this.layeredConfigLoader;
  }

  getLLMClient(): LLMClient | null {
    return this.llmClient;
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    callbacks?: StreamCallbacks
  ): Promise<CompletionResult> {
    if (!this.llmClient) {
      throw new Error("LLM client not initialized. Please provide llmConfig in OpenFlowConfig.");
    }
    return this.llmClient.complete(messages, tools, callbacks);
  }

  async chatStream(
    messages: LLMMessage[],
    callbacks: StreamCallbacks,
    tools?: LLMToolDefinition[]
  ): Promise<CompletionResult> {
    if (!this.llmClient) {
      throw new Error("LLM client not initialized. Please provide llmConfig in OpenFlowConfig.");
    }
    return this.llmClient.complete(messages, tools, callbacks);
  }

  setLLMModel(model: string): void {
    if (!this.llmClient) {
      throw new Error("LLM client not initialized.");
    }
    this.llmClient.updateModel(model);
  }

  getLLMProvider(): string | null {
    return this.llmClient ? this.llmClient.getProvider() : null;
  }

  getLLMModel(): string | null {
    return this.llmClient ? this.llmClient.getModel() : null;
  }

  // 新增模块的getter方法
  getGovernancePipeline(): FourteenStepGovernancePipeline {
    return this.governancePipeline;
  }

  getHookSystem(): HookSystem {
    return this.hookSystem;
  }

  getSystemPromptBuilder(): DefaultSystemPromptBuilder {
    return this.systemPromptBuilder;
  }

  getTokenBudgetInjector(): TokenBudgetInjector {
    return this.tokenBudgetInjector;
  }

  getLogger(): Logger {
    return this.logger;
  }

  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  getTokenRefreshScheduler(): TokenRefreshScheduler {
    return this.tokenRefreshScheduler;
  }

  // 工具方法
  async buildSystemPrompt(sessionId: string): Promise<string> {
    const tools = this.subAgentSystem.getAllStatuses().map((s: any) => ({
      name: s.id,
      description: s.type,
    }));
    const ctx: PromptContext = {
      config: {},
      tools,
      cwd: this.config.workspaceRoot,
      turn: 0,
      sessionId,
    };
    const cache: PromptCache = new Map();
    return this.systemPromptBuilder.build(ctx, cache);
  }

  async executeToolWithGovernance(
    toolName: string,
    input: Record<string, unknown>,
    handler: (input: Record<string, unknown>) => Promise<unknown>,
    toolContext: Partial<GovernanceContext>
  ): Promise<unknown> {
    const ctx: GovernanceContext = {
      cwd: toolContext.cwd || this.config.workspaceRoot,
      tool: toolName,
      input,
      isReadOnly: toolContext.isReadOnly ?? false,
      isDestructive: toolContext.isDestructive ?? false,
      isNetworkAccess: toolContext.isNetworkAccess ?? false,
      isGitCommand: toolContext.isGitCommand ?? false,
      config: {
        maskSensitiveOutputs: this.config.governanceConfig?.maskSensitiveOutputs ?? true,
      },
    };

    const result = await this.governancePipeline.execute(toolName, input, handler, ctx);

    // 记录指标
    this.metricsCollector.record({
      name: result.status === "ok" ? "tool_success" : "tool_error",
      value: 1,
      timestamp: Date.now(),
      tags: { tool: toolName },
    });

    if (result.telemetry?.durationMs) {
      this.metricsCollector.record({
        name: "tool_execution_duration",
        value: result.telemetry.durationMs,
        timestamp: Date.now(),
        tags: { tool: toolName },
      });
    }

    if (result.status === "ok") {
      return result.data;
    } else {
      const errorMsg = result.error?.message || "Tool execution failed";
      throw new Error(errorMsg);
    }
  }

  async buildContextWithBudget(
    query: string,
    segments: ContextSegment[]
  ): Promise<{ content: string; tokenCount: number; hitRate: number }> {
    const bundle = this.tokenBudgetInjector.buildContext(query, segments);
    return {
      content: bundle.renderedContent,
      tokenCount: bundle.totalTokens,
      hitRate: bundle.hitRate,
    };
  }

  async triggerHealthCheck(): Promise<Record<string, unknown>> {
    const health = await this.healthChecker.check();
    return {
      status: health.status,
      uptime: health.uptime,
      checks: health.checks,
    };
  }

  getMetricsSummary(): Record<string, unknown> {
    return {
      tools: this.metricsCollector.getToolExecutionSummary(),
      tokens: this.metricsCollector.getTokenUsageSummary(),
    };
  }

  async serializeSessionMessages(sessionId: string): Promise<unknown> {
    const messages = await this.sessionManager.loadSession(sessionId);
    if (!messages || messages.length === 0) return null;
    const adapted = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return serializeMessages(adapted as any, sessionId);
  }

  deserializeSessionMessages(serialized: unknown[]): Array<{ role: string; content: unknown }> {
    const msgs = deserializeMessages(serialized as any);
    return msgs.map((m) => ({ role: m.role, content: m.content }));
  }

  async generateTier3Summary(messages: Array<{ role: string; content: unknown }>): Promise<string> {
    const prompt = buildTier3SummaryPrompt(messages);
    return prompt;
  }

  formatTier3Summary(summary: Tier3Summary): string {
    return formatTier3Summary(summary);
  }

  async executeQuery(input: QueryInput, onEvent?: (event: StreamEvent) => void): Promise<QueryResult> {
    if (!this.llmClient) {
      throw new Error("LLM client not initialized");
    }

    const toolRegistry: QueryToolRegistry = {
      list: () => {
        const tools: ToolDefinition[] = [];
        return tools.map((t: ToolDefinition) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
          handler: t.handler as (input: Record<string, unknown>) => Promise<unknown>,
        }));
      },
      get: (name: string) => {
        const tools: ToolDefinition[] = [];
        const tool = tools.find((t: ToolDefinition) => t.name === name);
        if (!tool) return undefined;
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown>,
          handler: tool.handler as (input: Record<string, unknown>) => Promise<unknown>,
        };
      },
    };

    const queryConfig: QueryContext["config"] = {
      apiKey: this.config.llmConfig?.apiKey || "",
      provider: this.config.llmConfig?.provider,
      baseUrl: this.config.llmConfig?.baseUrl,
      model: this.config.llmConfig?.model || "claude-sonnet-4-20250514",
      maxTokens: this.config.queryConfig?.maxTokens || 8192,
      maxTurns: this.config.queryConfig?.maxTurns || 50,
      tokenBudget: this.config.queryConfig?.tokenBudget || 100000,
      moneyBudgetUsd: this.config.queryConfig?.moneyBudgetUsd,
      compactionThreshold: this.config.queryConfig?.compactionThreshold || 50000,
      maxCompactionFailures: this.config.queryConfig?.maxCompactionFailures || 3,
    };

    const ctx: QueryContext = {
      llmClient: this.llmClient,
      session: this.sessionManager,
      toolRegistry,
      config: queryConfig,
      abortSignal: this.abortController.signal,
      onStreamEvent: onEvent,
    };

    const gen = query(input, ctx);
    let result: QueryResult | undefined;

    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
      onEvent?.(next.value);
    }

    if (!result) {
      throw new Error("Query did not produce a result");
    }

    return result;
  }

  async connectTransport(): Promise<void> {
    if (this.transport) {
      await this.transport.connect();
    }
  }

  async disconnectTransport(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
  }

  getTransport(): Transport | null {
    return this.transport;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  abortQuery(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  private async handleTransportMessage(msg: TransportMessage): Promise<void> {
    if (msg.type === "request" && msg.channel === "query") {
      const input = msg.payload as QueryInput;
      try {
        const result = await this.executeQuery(input, (event) => {
          this.transport?.send({
            id: `evt_${Date.now()}`,
            type: "event",
            channel: "stream",
            payload: event,
            timestamp: new Date(),
          });
        });

        await this.transport?.send({
          id: `resp_${Date.now()}`,
          type: "response",
          channel: "query",
          payload: result,
          timestamp: new Date(),
        });
      } catch (error) {
        await this.transport?.send({
          id: `err_${Date.now()}`,
          type: "error",
          channel: "query",
          payload: { error: (error as Error).message },
          timestamp: new Date(),
        });
      }
    }
  }
}
