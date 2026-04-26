import type { CapabilityContext, CapabilitySource } from "./types/index.js";
import { PluginManager } from "./plugins/index.js";
import { EnhancedMemoryCore, createEnhancedMemoryCore } from "./memory/enhanced-memory-core.js";
import type { EnhancedMemoryCore as EnhancedMemoryCoreType } from "./memory/enhanced-memory-core.js";
import { OpenflowMdLoader, createOpenflowMdLoader } from "./memory/openflow-md-loader.js";
import { DualModelRetriever, createDualModelRetriever } from "./memory/dual-model-retriever.js";
import { AutoMemoryExtractor, createAutoMemoryExtractor } from "./memory/auto-memory-extractor.js";
import { KairosDreaming, createKairosDreaming } from "./memory/kairos-dreaming.js";
import type { MemoryCard } from "./memory/dual-model-retriever.js";
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
import { PromptCacheMonitor } from "./prompts/cache-monitor.js";
import { createLogger, createMetricsCollector, createHealthChecker } from "./telemetry/index.js";
import type { Logger, MetricsCollector, HealthChecker } from "./telemetry/index.js";
import { TokenRefreshScheduler } from "./token/token-refresh.js";
import { serializeMessages, deserializeMessages } from "./serialization/index.js";
import { CommandRegistry, createCommandRegistry } from "./commands/command-registry.js";
import { createPluginCommands } from "./commands/plugin-commands.js";
import { createAgentCommands } from "./commands/agent-commands.js";
import { createDevCommands } from "./commands/development-commands.js";
import { createLoopCommand } from "./commands/loop-command.js";
import { createCompactCommand } from "./commands/compact-command.js";
import { createIMCommands, loadIMConfigFromFile } from "./commands/im-commands.js";
import { createAllTools } from "./tools/index.js";
import type { ToolDefinition } from "./types/index.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { CronScheduler } from "./scheduler/cron-scheduler.js";
import { MessagingGateway, createMessagingGateway } from "./messaging/index.js";
import type { GatewayConfig, PlatformMessage, PlatformType } from "./messaging/index.js";
import { PermissionSystem } from "./permissions/index.js";
import type { PermissionSystemConfig } from "./permissions/index.js";
import { StartupPrefetcher, createPrefetchTask } from "./startup/index.js";
import type { PrefetchReport } from "./startup/index.js";

export interface OpenFlowConfig {
  workspaceRoot: string;
  memoryDir: string;
  pluginSources: CapabilitySource[];
  nudgeInterval?: number;
  maxSubAgentConcurrency?: number;
  sessionId?: string;
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
  messagingConfig?: GatewayConfig;
}

export class OpenFlowCore {
  private pluginManager: PluginManager;
  private memoryCore: EnhancedMemoryCoreType;
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
  private cacheMonitor: PromptCacheMonitor;
  private tokenBudgetInjector: TokenBudgetInjector;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private healthChecker: HealthChecker;
  private tokenRefreshScheduler: TokenRefreshScheduler;
  private commandRegistry: CommandRegistry;
  private cronScheduler: CronScheduler;
  private messagingGateway: MessagingGateway | null = null;
  private permissionSystem: PermissionSystem | null = null;
  private openflowMdLoader: OpenflowMdLoader;
  private dualModelRetriever: DualModelRetriever;
  private autoMemoryExtractor: AutoMemoryExtractor;
  private kairosDreaming: KairosDreaming;
  private prefetcher: StartupPrefetcher;
  private lastPrefetchReport: PrefetchReport | null = null;

  constructor(context: CapabilityContext, config: OpenFlowConfig) {
    if (!config.messagingConfig) {
      const imConfig = loadIMConfigFromFile();
      if (imConfig) {
        config.messagingConfig = imConfig;
      }
    }

    this.config = config;
    this.abortController = new AbortController();
    this.pluginManager = new PluginManager({
      telemetry: {
        log: (event: string, data?: Record<string, unknown>) => {
          console.debug(`Plugin event: ${event}`, data);
        },
      },
    });
    this.memoryCore = createEnhancedMemoryCore({
      memoryDir: config.memoryDir,
      enableVectorSearch: true,
      vectorBackend: "hnsw",
      enableKnowledgeGraph: true,
      enableConfidenceScoring: true,
      enableConsolidationScheduler: true,
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

    this.cacheMonitor = new PromptCacheMonitor(
      {
        windowMs: 300_000,
        warningThreshold: 5,
        criticalThreshold: 15,
      },
      (report, event) => {
        this.logger.warn("Prompt cache health alert", {
          layerName: event.layerName,
          reason: event.reason,
          severity: event.severity,
          recommendations: report.recommendations,
        });
      }
    );

    this.systemPromptBuilder.setCacheMonitor(this.cacheMonitor);

    this.openflowMdLoader = createOpenflowMdLoader();
    this.dualModelRetriever = createDualModelRetriever({
      maxInject: 5,
      precisionThreshold: 0.78,
    });
    this.autoMemoryExtractor = createAutoMemoryExtractor({
      memoryDir: `${config.memoryDir}/auto`,
      enableAutoWrite: true,
    });
    this.kairosDreaming = createKairosDreaming({
      memoryDir: `${config.memoryDir}/dreams`,
      enableNightDream: true,
      enableIdleDream: true,
    });

    this.tokenBudgetInjector = createTokenBudgetInjector({
      maxTokens: config.tokenBudgetConfig?.maxTokens,
      reservedTokens: config.tokenBudgetConfig?.reservedTokens,
      enableCompression: config.tokenBudgetConfig?.enableCompression,
    });

    this.prefetcher = new StartupPrefetcher({
      defaultTimeoutMs: 5000,
      concurrencyLimit: 8,
      logTiming: true,
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
      const sessionId = config.sessionId || `session_${Date.now()}`;
      this.llmClient = createLLMClient({
        apiKey: config.llmConfig.apiKey,
        providerConfig: {},
        provider: config.llmConfig.provider,
        baseUrl: config.llmConfig.baseUrl,
        model: config.llmConfig.model,
        maxTokens: config.llmConfig.maxTokens,
        temperature: config.llmConfig.temperature,
        timeout: config.llmConfig.timeout,
        sessionId,
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
    const ac = new AbortController();

    const tasks = [
      createPrefetchTask("memory_core", async () => {
        await this.memoryCore.initialize();
      }, { critical: true, timeoutMs: 10000 }),

      createPrefetchTask("cron_scheduler", async () => {
        await this.cronScheduler.initialize();
      }, { critical: false, timeoutMs: 5000 }),

      createPrefetchTask("layered_config", async () => {
        await this.layeredConfigLoader.loadAll();
      }, { critical: true, timeoutMs: 5000 }),

      createPrefetchTask("unified_engine", async () => {
        await this.unifiedEngine.initialize();
      }, { critical: true, timeoutMs: 10000, dependsOn: ["layered_config"] }),

      createPrefetchTask("auto_memory", async () => {
        await this.autoMemoryExtractor.initialize();
      }, { critical: false, timeoutMs: 5000 }),

      createPrefetchTask("kairos_dreaming", async () => {
        await this.kairosDreaming.initialize();
      }, { critical: false, timeoutMs: 5000 }),

      createPrefetchTask("llm_client", async () => {
        if (this.config.llmConfig?.apiKey) {
          const llmClient = createLLMClient({
            apiKey: this.config.llmConfig.apiKey,
            providerConfig: {},
            provider: this.config.llmConfig.provider,
            baseUrl: this.config.llmConfig.baseUrl,
            model: this.config.llmConfig.model,
            maxTokens: this.config.llmConfig.maxTokens,
            temperature: this.config.llmConfig.temperature,
            timeout: this.config.llmConfig.timeout,
          });
          this.memoryCore.setLLMClient(llmClient);
        }
      }, { critical: false, timeoutMs: 5000 }),

      createPrefetchTask("plugins", async () => {
        if (this.config.pluginSources.length > 0) {
          const basePath = this.config.workspaceRoot;
          await this.pluginManager.loadFromDirectory(basePath);
        }
      }, { critical: false, timeoutMs: 15000 }),
    ];

    const report = await this.prefetcher.run(tasks, ac.signal);
    this.lastPrefetchReport = report;

    if (!report.allCriticalPassed) {
      const failed = report.results.filter((r) => r.status === "rejected");
      throw new Error(`Critical startup tasks failed: ${failed.map((r) => `${r.name}: ${r.error?.message}`).join(", ")}`);
    }

    if (this.config.messagingConfig) {
      this.messagingGateway = createMessagingGateway(this.config.messagingConfig);
      await this.messagingGateway.initialize();
      this.messagingGateway.onMessage(async (message, platform) => {
        await this.handleMessagingMessage(message, platform);
      });
      await this.messagingGateway.start();
    }

    this.memoryCore.startNudgeCycle();

    this.kairosDreaming.startIdleWatcher((result) => {
      this.logger.info("KAIROS dreaming completed", {
        distilled: result.distilled,
        reason: result.reason,
      });
    });
    await this.kairosDreaming.checkNightDream((result) => {
      this.logger.info("KAIROS night dreaming completed", {
        distilled: result.distilled,
      });
    });

    const settings = await this.layeredConfigLoader.loadSettings();
    this.permissionSystem = PermissionSystem.fromSettings(
      settings,
      this.config.workspaceRoot,
      undefined
    );
    await this.permissionSystem.initialize();

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

    this.commandRegistry.register({
      name: "compact",
      description: "手动压缩上下文，可选焦点提示（如 /compact --focus \"重构用户认证模块\"）",
      handler: async (args: string) => {
        const sessionId = "default";
        const compactCmd = createCompactCommand(this.sessionManager, sessionId);
        return compactCmd.handler(args);
      },
      aliases: ["compress", "summarize"],
    });

    createIMCommands(this.commandRegistry);

    this.commandRegistry.register({
      name: "im",
      description: "IM platform commands (setup, status, test)",
      handler: async (args: string) => {
        const parts = args.trim().split(/\s+/);
        const subcommand = parts[0] || "help";
        const subArgs = parts.slice(1);

        if (subcommand === "help") {
          return `IM 平台命令:
- /im setup <平台> enable [参数...] - 启用平台
- /im setup <平台> disable - 禁用平台
- /im setup <平台> show - 查看配置
- /im status - 查看所有状态
- /im test <平台> - 测试连接

支持的平台: telegram, slack, dingtalk, feishu, wecom, whatsapp, line, wechat`;
        }

        const handler = this.commandRegistry.get(`im-${subcommand}`);
        if (!handler) {
          return `未知 IM 子命令: ${subcommand}\n使用 /im help 查看可用命令`;
        }
        return handler.handler(subArgs.join(" "));
      },
      aliases: ["messaging", "chat"],
    });
  }

  async shutdown(): Promise<void> {
    this.memoryCore.stopNudgeCycle();
    await this.pluginManager.shutdown();
    await this.visualizationRenderer.stopServer();
    await this.disconnectTransport();
    await this.cronScheduler.shutdown();

    if (this.messagingGateway) {
      await this.messagingGateway.stop();
    }

    if (this.llmClient) {
      this.llmClient.shutdown();
    }

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

  getMessagingGateway(): MessagingGateway | null {
    return this.messagingGateway;
  }

  getPrefetchReport(): PrefetchReport | null {
    return this.lastPrefetchReport;
  }

  getMemoryCore(): EnhancedMemoryCoreType {
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

  getTools(): ToolDefinition[] {
    return createAllTools(this.config.workspaceRoot, this.commandRegistry, this.cronScheduler);
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

  getLLMCircuitBreakerStats() {
    if (!this.llmClient) return null;
    return this.llmClient.getCircuitBreakerStats();
  }

  getLLMCircuitBreakerState() {
    if (!this.llmClient) return null;
    return this.llmClient.getCircuitBreakerState();
  }

  resetLLMCircuitBreaker() {
    if (!this.llmClient) return;
    this.llmClient.resetCircuitBreaker();
  }

  getLLMTranscriptStore() {
    if (!this.llmClient) return null;
    return this.llmClient.getTranscriptStore();
  }

  getLLMDegradationStatus() {
    if (!this.llmClient) return null;
    return this.llmClient.getDegradationStatus();
  }

  resetLLMDegradation() {
    if (!this.llmClient) return;
    this.llmClient.resetDegradation();
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

  getCacheMonitor(): PromptCacheMonitor {
    return this.cacheMonitor;
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

    const openflowMdResult = await this.openflowMdLoader.loadStack(this.config.workspaceRoot);
    const memoryWarnings = [...openflowMdResult.warnings];

    const ctx: PromptContext = {
      config: {},
      tools,
      cwd: this.config.workspaceRoot,
      turn: 0,
      sessionId,
      openflowMdStack: openflowMdResult.mergedContent,
      memoryWarnings,
    };
    const cache: PromptCache = new Map();
    return this.systemPromptBuilder.build(ctx, cache);
  }

  async buildSystemPromptWithMemory(
    sessionId: string,
    userQuery: string
  ): Promise<string> {
    const tools = this.subAgentSystem.getAllStatuses().map((s: any) => ({
      name: s.id,
      description: s.type,
    }));

    const openflowMdResult = await this.openflowMdLoader.loadStack(this.config.workspaceRoot);
    const memoryWarnings = [...openflowMdResult.warnings];

    const autoObservations = await this.autoMemoryExtractor.getObservations(this.config.workspaceRoot);
    const candidates: MemoryCard[] = autoObservations.map((obs) => ({
      id: obs.id,
      title: `${obs.type}: ${obs.content.slice(0, 40)}`,
      description: obs.content,
      scope: obs.scope,
      createdAt: new Date(obs.firstObserved).toISOString(),
      confidence: obs.confidence,
    }));

    const distilledCards = this.kairosDreaming.getDistilledCards();
    const allCandidates = [...candidates, ...distilledCards.map((card) => ({
      id: card.id,
      title: card.title,
      description: card.description,
      scope: this.config.workspaceRoot,
      createdAt: new Date(card.createdAt).toISOString(),
      confidence: card.confidence,
    }))];

    const retrievalResult = await this.dualModelRetriever.retrieve(
      allCandidates,
      userQuery,
      async (card, query) => {
        const titleMatch = card.title.toLowerCase().includes(query.toLowerCase()) ? 0.4 : 0;
        const descMatch = card.description.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;
        const tagMatch = card.tags?.some((t) => query.toLowerCase().includes(t.toLowerCase())) ? 0.2 : 0;
        return titleMatch + descMatch + tagMatch + (card.confidence * 0.1);
      }
    );

    const memoryInjections = this.dualModelRetriever.formatInjections(retrievalResult.cards);

    const ctx: PromptContext = {
      config: {},
      tools,
      cwd: this.config.workspaceRoot,
      turn: 0,
      sessionId,
      openflowMdStack: openflowMdResult.mergedContent,
      memoryInjections,
      memoryWarnings,
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

    const allTools = this.getTools();

    const toolRegistry: QueryToolRegistry = {
      list: () => {
        return allTools.map((t: ToolDefinition) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
          isConcurrencySafe: t.isConcurrencySafe ?? false,
          resourceKeys: t.resourceKeys,
          handler: t.handler as (input: Record<string, unknown>) => Promise<unknown>,
        }));
      },
      get: (name: string) => {
        const tool = allTools.find((t: ToolDefinition) => t.name === name);
        if (!tool) return undefined;
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown>,
          isConcurrencySafe: tool.isConcurrencySafe ?? false,
          resourceKeys: tool.resourceKeys,
          handler: tool.handler as (input: Record<string, unknown>) => Promise<unknown>,
        };
      },
    };

    const queryConfig: QueryContext["config"] = {
      apiKey: this.config.llmConfig?.apiKey || "",
      provider: this.config.llmConfig?.provider,
      baseUrl: this.config.llmConfig?.baseUrl,
      model: this.config.llmConfig?.model || "",
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
      memoryCore: this.memoryCore,
      permissionSystem: this.permissionSystem || undefined,
      cacheMonitor: this.cacheMonitor,
    };

    const systemPrompt = input.systemPrompt || await this.buildSystemPromptWithMemory(
      input.threadId || "default",
      input.message
    );

    await this.autoMemoryExtractor.observe(
      input.message,
      {
        scope: this.config.workspaceRoot,
        turnCount: 0,
        previousMessages: [],
      }
    );

    const queryInput: QueryInput = {
      ...input,
      systemPrompt,
    };

    const gen = query(queryInput, ctx);
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

  private async handleMessagingMessage(message: PlatformMessage, platform: PlatformType): Promise<void> {
    if (!this.llmClient) {
      await this.messagingGateway?.sendMessage({
        ...message,
        direction: "outbound",
        content: "LLM 未配置，无法处理消息",
      });
      return;
    }

    if (this.messagingGateway) {
      await this.messagingGateway.sendTypingIndicator(platform, message.chatId);
    }

    const envContext = await this.memoryCore.loadExplorationContext();
    const intentResult = await this.memoryCore.recognizeIntent(message.content);

    const messages: LLMMessage[] = [
      { role: "system", content: `你是 OpenFlow AI 助手。当前平台: ${platform}\n\n${envContext}` },
      { role: "user", content: message.content },
    ];

    try {
      const result = await this.llmClient.complete(messages);
      const responseContent = result.content || "无响应";

      if (this.messagingGateway) {
        await this.messagingGateway.sendMessage({
          id: `resp_${Date.now()}`,
          platform,
          type: "text",
          direction: "outbound",
          chatId: message.chatId,
          userId: message.userId,
          content: responseContent,
          timestamp: new Date(),
          threadId: message.threadId,
        });
      }

      await this.memoryCore.addMemory(
        `用户 (${platform}): ${message.content}\n助手: ${responseContent}`,
        {
          type: "context",
          tags: [platform, intentResult.primaryIntent],
        }
      );
    } catch (error) {
      this.logger.error(`Messaging error on ${platform}: ${(error as Error).message}`);
      if (this.messagingGateway) {
        await this.messagingGateway.sendMessage({
          id: `err_${Date.now()}`,
          platform,
          type: "text",
          direction: "outbound",
          chatId: message.chatId,
          userId: message.userId,
          content: `处理消息时出错: ${(error as Error).message}`,
          timestamp: new Date(),
          threadId: message.threadId,
        });
      }
    }
  }
}
