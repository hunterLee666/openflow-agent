import type { QueryContext, AgentConfig } from "../types/index.js";
import { query } from "../core/query-engine.js";
import { DefaultToolRegistry } from "../tools/registry.js";
import { getDefaultTools } from "../tools/file-tools.js";
import { EnhancedToolRegistry, StreamingToolExecutor, registerExternalTools } from "../tools/index.js";
import { createToolLoader, type BuiltInTool, type ToolLoaderConfig } from "../tools/tool-loader.js";
import { defineTool, ReadOnlyTool, ReadWriteTool, defineBashTool, defineSearchTool } from "../tools/define-tool.js";
import { getTaskAgentTools, TaskAgentRegistry, createTaskAgent, type TaskAgentType, type TaskResult } from "../agent/index.js";
import { FileSessionStore } from "../services/session.js";
import { ConsoleTelemetry } from "../services/telemetry.js";
import { DefaultTelemetryCollector, DefaultPerfettoTracer, type TelemetryEvent, type TraceSpan } from "../services/telemetry/index.js";
import { DefaultMemorySystem, DualModelRetriever, ConsolidationManager, TokenBudgetInjector, MemoryConsolidator, SessionLifecycleManager, type RetrievalCandidate } from "../memory/index.js";
import { DefaultHookRegistry } from "../hooks/index.js";
import { DefaultPromptCache } from "../services/cache/prompt-cache.js";
import { DefaultCommandRegistry, createBuiltinCommands, CommandAliasManager, defaultAliasManager, type CommandAlias, type CommandHistoryEntry } from "../commands/index.js";
import { WorkspaceBoundaryValidator } from "../security/workspace-boundary.js";
import { createPermissionPipeline } from "../permissions/index.js";
import { SettingsLoader, ConfigHotReloader, LayeredConfigManager, type ConfigChangeEvent, type LayeredConfigSource } from "../config/index.js";
import { CommandParser } from "../utils/command-parser.js";
import { MemoryTruncator, DEFAULT_MEMORY_LIMITS } from "../memory/memory-truncator.js";
import { createSandboxAdapter } from "../security/sandbox.js";
import { ResourceMonitor, type ResourceMonitorConfig, type ResourceLimit, type ResourceType } from "../security/resource-control.js";
import { loadConfig } from "../services/config.js";
import { DefaultAcpAgent, createAcpAgent, type AcpAgentConfig, type AgentCapabilities } from "../services/acp/index.js";
import { compactMessages, shouldCompact, estimateTokenCount, type CompactOptions, type CompactResult } from "../services/compact.js";
import { OAuthTokenManager, createOAuthManager, type OAuthConfig as ServiceOAuthConfig } from "../services/auth/index.js";
import { DefaultSkillRegistry, loadBuiltinSkills, type Skill, type SkillRegistry, type SkillStep } from "../skills/index.js";
import { SideEffectSynchronizer, createSynchronizer, type SideEffect, type EffectHandler } from "../state/side-effect/index.js";
import { DIContainer, QueryContextFactory, createDefaultContainer } from "../di/container.js";
import { ErrorHandler, defaultErrorHandler, ErrorCatalog, SmartRetry, defaultSmartRetry, type ErrorEntry } from "../error/index.js";
import { TaskStateMachine, defaultTaskStateMachine, type Task, type TaskState } from "../task/state-machine.js";
import { ProgressTracker, defaultProgressTracker, MultiTaskProgressTracker, defaultMultiTaskTracker } from "../task/progress.js";
import { CommandCompleter, defaultCompleter } from "../commands/completion.js";
import { MessageGrouper, defaultMessageGrouper } from "../../frontend/tui/collapse.js";
import { Virtualizer, createVirtualizer } from "../../frontend/tui/virtual-list.js";
import { FileSystemAdapter } from "../state/persistence/index.js";

import { UndercoverMode, createUndercoverMode, type UndercoverConfig, type StealthSession } from "../modes/undercover.js";
import { Buddy, createBuddy, type BuddyConfig, type BuddyMood } from "../modes/buddy.js";
import { DeepPlanner, createDeepPlanner, type DeepPlanConfig, type PlanNode } from "../modes/deep-planning.js";
import { EasterEggManager, createEasterEggManager, type EasterEgg, type Badge } from "../modes/easter-eggs.js";
import { ParallelPrefetcher, createPrefetcher, type PrefetchConfig, type PrefetchResult } from "../modes/prefetch.js";

import { BaseIDEClient, VSCodeClient, CursorClient, JetBrainsClient, createIDEClient, detectIDE, createAutoDetectClient, type IDEClient, type IDEType } from "../services/ide/index.js";
import { GenericLspClient, detectLspForProject, type LspClient, type DocumentSymbol, type CompletionItem } from "../services/lsp/index.js";
import { BaseTransport, StdioTransport, WebSocketTransport, TcpTransport, createTransport, type TransportConfig, type TransportMessage } from "../services/transport/index.js";
import { DefaultVerificationAgent, type VerificationAgent, type VerificationTask, type VerificationResult, type VerificationCheck } from "../verification/index.js";
import { CircuitBreaker, ExponentialBackoff, LinearBackoff, FibonacciBackoff, createBackoff, retry, ErrorRecoveryManager, createErrorRecoveryManager, type CircuitBreakerConfig, type RetryConfig, type ErrorRecoveryPolicy } from "../resilience/index.js";
import { MessageBroker, createMessageBroker, type AgentMessage, type Subscription } from "../agent/routing/index.js";
import { SwarmOrchestrator, createSwarmOrchestrator, type SwarmConfig, type CollaborationMode } from "../agent/swarm/index.js";
import { DefaultSubAgentCache, DefaultRecursionGuard, buildForkKey, type SubAgentCache, type RecursionGuard, type SubAgentCacheEntry } from "../agent/cache/index.js";
import { createAgentTool, type AgentToolConfig } from "../tools/agent-tool.js";
import { BridgeClient, JsonRpcBridgeServer, generateBridgeToken, type BridgeConfig, type BridgeServer, type BridgeMessage, type BridgeSession, type BridgeEvent } from "../services/bridge/index.js";
import { DefaultCoordinator, isCoordinatorMode, getCoordinatorSystemPrompt, createWorkerAgent, type Coordinator, type CoordinatorPlan, type SubAgent, type SubAgentResult, type Phase } from "../agent/coordinator/index.js";
import { computeDiff, TerminalDiffRenderer, createDiffRenderer, type DiffRenderer, type DiffResult, type DiffBlock } from "../diff/index.js";
import { McpServer, EnhancedMCPClient, ServiceDiscovery, defaultServiceDiscovery, type McpServerConfig, type McpOAuthConfig } from "../services/mcp/index.js";
import { loadAllPlugins, getPluginById, getBuiltinPlugins, registerBuiltinPlugin, type LoadedPlugin, type PluginLoadResult, type BuiltinPluginDefinition } from "../plugins/index.js";

export interface SystemServices {
  toolRegistry: DefaultToolRegistry;
  enhancedToolRegistry: EnhancedToolRegistry;
  streamingToolExecutor: StreamingToolExecutor;
  sessionStore: FileSessionStore;
  telemetry: ConsoleTelemetry;
  telemetryCollector: DefaultTelemetryCollector;
  perfettoTracer: DefaultPerfettoTracer;
  memorySystem: DefaultMemorySystem;
  hookRegistry: DefaultHookRegistry;
  promptCache: DefaultPromptCache;
  commandRegistry: DefaultCommandRegistry;
  aliasManager: CommandAliasManager;
  workspaceValidator: WorkspaceBoundaryValidator;
  permissionPipeline: ReturnType<typeof createPermissionPipeline>;
  settingsLoader: SettingsLoader;
  configManager: LayeredConfigManager;
  memoryTruncator: MemoryTruncator;
  sandboxAdapter: ReturnType<typeof createSandboxAdapter>;
  resourceMonitor: ResourceMonitor;
  acpAgent: DefaultAcpAgent;
  oauthTokenManager: OAuthTokenManager;
  skillRegistry: DefaultSkillRegistry;
  sideEffectSynchronizer: SideEffectSynchronizer;
  commandParser: CommandParser;
  diContainer: DIContainer;
  queryContextFactory: QueryContextFactory;
  errorHandler: ErrorHandler;
  taskStateMachine: TaskStateMachine;
  progressTracker: ProgressTracker;
  multiTaskTracker: MultiTaskProgressTracker;
  commandCompleter: CommandCompleter;
  messageGrouper: MessageGrouper;

  undercoverMode: UndercoverMode;
  buddy: Buddy;
  deepPlanner: DeepPlanner;
  easterEggManager: EasterEggManager;
  prefetcher: ParallelPrefetcher;

  ideClient: IDEClient | null;
  lspClient: LspClient | null;

  transport: BaseTransport | null;
  verificationAgent: VerificationAgent;
  errorRecoveryManager: ErrorRecoveryManager;
  circuitBreaker: CircuitBreaker;

  taskAgentRegistry: TaskAgentRegistry;
  messageBroker: MessageBroker;
  swarmOrchestrator: SwarmOrchestrator | null;
  coordinator: Coordinator;
  subAgentCache: SubAgentCache;
  recursionGuard: RecursionGuard;
  bridgeServer: BridgeServer | null;
  diffRenderer: DiffRenderer;
  mcpServiceDiscovery: ServiceDiscovery;
  loadedPlugins: PluginLoadResult;
  dualModelRetriever: DualModelRetriever;
  consolidationManager: ConsolidationManager;
  tokenBudgetInjector: TokenBudgetInjector;
  memoryConsolidator: MemoryConsolidator;
  sessionLifecycleManager: SessionLifecycleManager;
}

let systemServices: SystemServices | null = null;

export async function initializeSystemServices(): Promise<SystemServices> {
  if (systemServices) {
    return systemServices;
  }

  const config = await loadConfig();
  const homeDir = process.env.HOME || process.env.USERPROFILE || "~";
  const projectDir = process.cwd();

  const toolRegistry = new DefaultToolRegistry();
  const enhancedToolRegistry = new EnhancedToolRegistry();
  const streamingToolExecutor = new StreamingToolExecutor(toolRegistry);
  for (const tool of getDefaultTools()) {
    toolRegistry.register(tool);
  }
  registerExternalTools(toolRegistry);

  const sessionStore = new FileSessionStore();
  const telemetry = new ConsoleTelemetry();
  const telemetryCollector = new DefaultTelemetryCollector();
  const perfettoTracer = new DefaultPerfettoTracer();
  const memorySystem = new DefaultMemorySystem();
  const hookRegistry = new DefaultHookRegistry();
  const promptCache = new DefaultPromptCache();
  const commandRegistry = new DefaultCommandRegistry();
  for (const cmd of createBuiltinCommands()) {
    commandRegistry.register(cmd);
  }
  const aliasManager = new CommandAliasManager();

  const workspaceValidator = new WorkspaceBoundaryValidator({
    boundaries: {
      root: projectDir,
      allowedPaths: [],
      deniedPaths: ["/.git/", "/.ssh/", "/.aws/", "/etc/passwd", "/etc/shadow"],
    },
    checkOnRead: true,
    checkOnWrite: true,
    checkOnExecute: true,
  });

  const settingsLoader = new SettingsLoader(homeDir, projectDir);
  const configManager = new LayeredConfigManager(projectDir, true);

  const memoryTruncator = new MemoryTruncator({
    maxEntryPointLines: DEFAULT_MEMORY_LIMITS.maxEntryPointLines,
    maxEntryPointBytes: DEFAULT_MEMORY_LIMITS.maxEntryPointBytes,
    retentionDays: DEFAULT_MEMORY_LIMITS.retentionDays,
  });

  const sandboxAdapter = createSandboxAdapter();
  const resourceMonitor = new ResourceMonitor({
    enabled: true,
    checkIntervalMs: 5000,
    thresholds: {
      cpu: 80,
      memory: 85,
      disk: 90,
    },
  });
  const acpAgent = new DefaultAcpAgent();
  const oauthTokenManager = new OAuthTokenManager({
    oauth: {
      clientId: "openflow-cli",
      authorizationUrl: "",
      tokenUrl: "",
      redirectUri: "",
      scopes: [],
    },
    autoRefresh: true,
  });
  const skillRegistry = new DefaultSkillRegistry();
  const builtinSkills = await loadBuiltinSkills();
  for (const skill of builtinSkills) {
    skillRegistry.register(skill);
  }
  const sideEffectSynchronizer = createSynchronizer({
    enabled: true,
    handlers: [],
    policy: {
      maxRetries: 3,
      retryDelayMs: 1000,
      autoRevert: true,
      atomic: true,
    },
    enableLogging: true,
    enableMetrics: true,
  });
  const commandParser = new CommandParser();

  const permissionPipeline = createPermissionPipeline();

  const rules = settingsLoader.getPermissionRules("userSettings");
  for (const rule of rules) {
    permissionPipeline.addRule(rule);
  }

  const diContainer = createDefaultContainer();
  diContainer.registerSingleton("tools", () => toolRegistry);
  diContainer.registerSingleton("memory", () => memorySystem);
  diContainer.registerSingleton("permissions", () => permissionPipeline);
  diContainer.registerSingleton("config", () => settingsLoader);
  diContainer.registerSingleton("session", () => sessionStore);
  diContainer.registerSingleton("telemetry", () => telemetry);
  diContainer.registerSingleton("hooks", () => hookRegistry);
  diContainer.registerSingleton("promptCache", () => promptCache);
  diContainer.registerSingleton("commandRegistry", () => commandRegistry);
  diContainer.registerSingleton("workspaceValidator", () => workspaceValidator);
  diContainer.registerSingleton("sandbox", () => sandboxAdapter);

  const queryContextFactory = new QueryContextFactory(diContainer);

  const errorHandler = new ErrorHandler(
    new ErrorCatalog(),
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: ["retryable", "timeout", "rate-limit", "network"],
      jitter: true,
    }
  );

  const taskStateMachine = new TaskStateMachine();
  const progressTracker = new ProgressTracker();
  const multiTaskTracker = new MultiTaskProgressTracker();
  const commandCompleter = new CommandCompleter();
  const messageGrouper = new MessageGrouper();

  const undercoverMode = createUndercoverMode({ enabled: false });
  const buddy = new Buddy({});
  const deepPlanner = new DeepPlanner({});
  const easterEggManager = createEasterEggManager();
  const prefetcher = new ParallelPrefetcher({});

  let ideClient: IDEClient | null = null;
  try {
    ideClient = await createAutoDetectClient() || null;
  } catch {
    ideClient = null;
  }

  let lspClient: LspClient | null = null;
  try {
    lspClient = detectLspForProject(projectDir);
    if (lspClient) {
      await lspClient.initialize(projectDir);
    }
  } catch {
    lspClient = null;
  }

  let transport: BaseTransport | null = null;
  try {
    transport = new StdioTransport({ type: "stdio" }, { onMessage: () => {} });
  } catch {
    transport = null;
  }

  const verificationAgent = new DefaultVerificationAgent();

  const errorRecoveryManager = new ErrorRecoveryManager(
    true,
    true,
    true,
    { failureThreshold: 5, successThreshold: 3, timeout: 30000, resetTimeout: 30000 },
    { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2 }
  );

  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    resetTimeout: 30000,
  });

  const taskAgentRegistry = TaskAgentRegistry.getInstance();

  const messageBroker = new MessageBroker({
    agentId: "main-broker",
    routeConfig: {
      routes: [],
      defaultPriority: "normal",
      maxHops: 10,
      timeout: 30000,
      retryPolicy: {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableTypes: ["request", "event"],
      },
    },
    enableMetrics: true,
    enableTracing: false,
  });

  let swarmOrchestrator: SwarmOrchestrator | null = null;
  try {
    swarmOrchestrator = new SwarmOrchestrator({
      enabled: true,
      agents: ["explore", "plan", "verify", "general"],
      handoffs: [
        { from: "explore", to: "plan", condition: "exploration_complete" },
        { from: "plan", to: "verify", condition: "plan_complete" },
      ],
      maxTurns: 50,
    });
  } catch {
    swarmOrchestrator = null;
  }

  const agentConfig: AgentConfig = {
    apiKey: config.apiKey,
    model: config.model,
    provider: config.provider,
    baseUrl: config.baseUrl,
    maxTokens: 8192,
    maxTurns: 100,
    tokenBudget: 100000,
    compactionThreshold: 80000,
    maxCompactionFailures: 3,
    permissionMode: "askUser",
  };

  for (const tool of getTaskAgentTools(agentConfig)) {
    toolRegistry.register(tool);
  }

  const subAgentCache = new DefaultSubAgentCache(100);
  const recursionGuard = new DefaultRecursionGuard(3);

  const agentTool = createAgentTool({
    maxDepth: 3,
    cache: subAgentCache,
    guard: recursionGuard,
    executeSubAgent: async (task: string, context: Record<string, unknown>) => {
      return { task, context, result: "Sub-agent execution placeholder" };
    },
  });
  toolRegistry.register(agentTool);

  let bridgeServer: BridgeServer | null = null;
  try {
    bridgeServer = new JsonRpcBridgeServer({
      port: 8080,
      maxSessions: 10,
      enableWorktree: false,
    });
  } catch {
    bridgeServer = null;
  }

  const coordinator = new DefaultCoordinator();
  const diffRenderer = createDiffRenderer();
  const mcpServiceDiscovery = defaultServiceDiscovery;
  const loadedPlugins = await loadAllPlugins();
  const dualModelRetriever = new DualModelRetriever();
  const consolidationManager = new ConsolidationManager();
  const tokenBudgetInjector = new TokenBudgetInjector();
  const memoryConsolidator = new MemoryConsolidator();
  const sessionLifecycleManager = new SessionLifecycleManager();

  systemServices = {
    toolRegistry,
    enhancedToolRegistry,
    streamingToolExecutor,
    sessionStore,
    telemetry,
    telemetryCollector,
    perfettoTracer,
    memorySystem,
    hookRegistry,
    promptCache,
    commandRegistry,
    aliasManager,
    workspaceValidator,
    permissionPipeline,
    settingsLoader,
    configManager,
    memoryTruncator,
    sandboxAdapter,
    resourceMonitor,
    acpAgent,
    oauthTokenManager,
    skillRegistry,
    sideEffectSynchronizer,
    commandParser,
    diContainer,
    queryContextFactory,
    errorHandler,
    taskStateMachine,
    progressTracker,
    multiTaskTracker,
    commandCompleter,
    messageGrouper,

    undercoverMode,
    buddy,
    deepPlanner,
    easterEggManager,
    prefetcher,

    ideClient,
    lspClient,

    transport,
    verificationAgent,
    errorRecoveryManager,
    circuitBreaker,

    taskAgentRegistry,
    messageBroker,
    swarmOrchestrator,
    coordinator,
    subAgentCache,
    recursionGuard,
    bridgeServer,
    diffRenderer,
    mcpServiceDiscovery,
    loadedPlugins,
    dualModelRetriever,
    consolidationManager,
    tokenBudgetInjector,
    memoryConsolidator,
    sessionLifecycleManager,
  };

  return systemServices;
}

export function getSystemServices(): SystemServices | null {
  return systemServices;
}

export async function createIntegratedQueryContext(
  abortController: AbortController,
  _options?: { sessionId?: string; cwd?: string; userId?: string }
): Promise<QueryContext> {
  const services = await initializeSystemServices();
  const config = await loadConfig();

  return {
    session: services.sessionStore,
    config: {
      apiKey: config.apiKey,
      model: config.model,
      provider: config.provider,
      baseUrl: config.baseUrl,
      maxTokens: 8192,
      maxTurns: 100,
      tokenBudget: 100000,
      compactionThreshold: 80000,
      maxCompactionFailures: 3,
      permissionMode: "askUser",
    },
    telemetry: services.telemetry,
    abortSignal: abortController.signal,
    toolRegistry: services.toolRegistry,
    memory: services.memorySystem,
    hooks: services.hookRegistry,
    promptCache: services.promptCache,
    commandRegistry: services.commandRegistry,
    workspaceValidator: services.workspaceValidator,
    permissionPipeline: services.permissionPipeline,
  };
}

export async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  options?: {
    operationId?: string;
    onError?: (error: ErrorEntry) => void;
    skipRetry?: boolean;
  }
): Promise<{ success: boolean; result?: T; error?: string }> {
  const services = getSystemServices();
  if (!services) {
    throw new Error("System services not initialized");
  }

  const result = await services.errorHandler.handle(operation, {
    operationId: options?.operationId,
    skipRetry: options?.skipRetry,
    onError: options?.onError,
  });

  return {
    success: result.success,
    result: result.result,
    error: result.error?.category.userMessage,
  };
}

export async function executeWithResilience<T>(
  operation: () => Promise<T>,
  options?: {
    useCircuitBreaker?: boolean;
    retryConfig?: Partial<RetryConfig>;
    fallback?: () => T;
  }
): Promise<T> {
  const services = getSystemServices();
  if (!services) {
    throw new Error("System services not initialized");
  }

  const { circuitBreaker, errorRecoveryManager } = services;

  if (options?.useCircuitBreaker) {
    return circuitBreaker.execute(operation);
  }

  return errorRecoveryManager.execute(operation, options?.fallback ? options.fallback() : undefined);
}

export async function verifyChanges(
  target: string,
  context?: string
): Promise<VerificationResult> {
  const services = getSystemServices();
  if (!services) {
    throw new Error("System services not initialized");
  }

  const checks = services.verificationAgent.generateChecks(target, context);
  return services.verificationAgent.verify({ 
    id: `verify-${Date.now()}`, 
    target, 
    checks, 
    context 
  });
}

export async function getIDESymbols(
  filePath: string
): Promise<DocumentSymbol[] | null> {
  const services = getSystemServices();
  if (!services?.lspClient) {
    return null;
  }

  return services.lspClient.documentSymbols(filePath);
}

export async function getIDECompletions(
  filePath: string,
  line: number,
  character: number
): Promise<CompletionItem[] | null> {
  const services = getSystemServices();
  if (!services?.lspClient) {
    return null;
  }

  return services.lspClient.completions(filePath, line, character);
}

export function enableUndercoverMode(config?: Partial<UndercoverConfig>): void {
  const services = getSystemServices();
  if (!services) {
    return;
  }

  if (config) {
    services.undercoverMode = createUndercoverMode(config);
  }
  services.undercoverMode.enable();
}

export function getBuddyMood(): BuddyMood | null {
  const services = getSystemServices();
  if (!services) {
    return null;
  }

  return services.buddy.getMood();
}

export async function createDeepPlan(goal: string): Promise<PlanNode | null> {
  const services = getSystemServices();
  if (!services) {
    return null;
  }

  services.deepPlanner.initialize(goal);
  const branch = await services.deepPlanner.plan(goal, async (node) => {
    return [];
  });
  return branch?.nodes[0] || null;
}

export async function prefetchResources(
  requests: Array<{ type: string; path: string }>
): Promise<PrefetchResult[]> {
  const services = getSystemServices();
  if (!services) {
    return [];
  }

  const results: PrefetchResult[] = [];
  for (const req of requests) {
    const result = await services.prefetcher.prefetch(req.path);
    results.push(result);
  }
  return results;
}

export async function createTask(
  name: string,
  options?: Partial<Task>
): Promise<Task> {
  const services = await initializeSystemServices();

  return services.taskStateMachine.createTask({
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    ...options,
  });
}

export async function executeTaskWithProgress(
  taskId: string,
  operation: (progress: (p: number, step?: string) => void) => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  const services = await initializeSystemServices();
  const tracker = services.progressTracker;

  tracker.start(taskId);

  try {
    await operation((progress, step) => {
      tracker.update({ progress, currentStep: step || "Running" });
    });

    tracker.complete();
    return { success: true };
  } catch (error) {
    tracker.fail(error instanceof Error ? error.message : String(error));
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getCommandCompletions(
  input: string,
  cursorPosition: number
): Array<{ value: string; label: string; type: string }> {
  const services = getSystemServices();
  if (!services) {
    return [];
  }

  const parts = input.split(" ");
  const currentWord = parts[parts.length - 1] || "";

  const context = {
    input,
    cursorPosition,
    currentWord,
    currentWordStart: input.lastIndexOf(currentWord),
    fullCommand: input,
    args: parts.slice(1),
    flags: {} as Record<string, string | boolean>,
  };

  return services.commandCompleter.complete(context);
}

export function groupMessage(
  id: string,
  type: string,
  content: string,
  timestamp?: number
): string | null {
  const services = getSystemServices();
  if (!services) {
    return null;
  }

  return services.messageGrouper.addItem({
    id,
    type,
    content,
    timestamp: timestamp || Date.now(),
  });
}

export function createMessageVirtualizer<T>(
  items: T[],
  itemHeight: number
): Virtualizer<T> {
  return createVirtualizer({
    items,
    itemHeight,
    overscan: 3,
  });
}

export { DIContainer, QueryContextFactory } from "../di/container.js";
export { SettingsLoader, ConfigHotReloader, LayeredConfigManager, type OpenflowSettings, type ConfigChangeEvent, type LayeredConfigSource } from "../config/index.js";
export { ErrorHandler, ErrorCatalog, SmartRetry } from "../error/index.js";
export { TaskStateMachine, type Task, type TaskState, type TaskTransition } from "../task/state-machine.js";
export { ProgressTracker, MultiTaskProgressTracker, type ProgressUpdate } from "../task/progress.js";
export { CommandCompleter, type CompletionCandidate, type CompletionContext } from "../commands/completion.js";
export { CommandAliasManager, defaultAliasManager, type CommandAlias, type CommandHistoryEntry, type CommandHistoryQuery } from "../commands/index.js";
export { MessageGrouper, type MessageGroup, type CollapseRule } from "../../frontend/tui/collapse.js";
export { Virtualizer, type VirtualItem } from "../../frontend/tui/virtual-list.js";
export { FileSystemAdapter, PersistentStateStore, type StateSnapshot } from "../state/persistence/index.js";

export { UndercoverMode, createUndercoverMode, type UndercoverConfig, type StealthSession, type HiddenOperation, type MaskedResult } from "../modes/undercover.js";
export { Buddy, createBuddy, type BuddyConfig, type BuddyMood, type BuddyAction, type BuddyEmotion, type BuddyMemory } from "../modes/buddy.js";
export { DeepPlanner, createDeepPlanner, type DeepPlanConfig, type PlanNode, type PlanBranch, type PlanStep, type ExecutionTrace, type Reflection, type MetaCognition } from "../modes/deep-planning.js";
export { EasterEggManager, createEasterEggManager, type EasterEgg, type EasterEggTrigger, type EasterEggReward, type EggCollection, type Badge, type EggStats } from "../modes/easter-eggs.js";
export { ParallelPrefetcher, createPrefetcher, type PrefetchConfig, type PrefetchRequest, type PrefetchResult, type CacheEntry, type QueueMetrics, type PrefetchStrategy, type PredictionContext } from "../modes/prefetch.js";

export { BaseIDEClient, VSCodeClient, CursorClient, JetBrainsClient, createIDEClient, detectIDE, createAutoDetectClient, type IDEClient, type IDEConfig, type IDEType, type OpenFileOptions, type TextEditorEvent, type Diagnostic, type HoverInfo } from "../services/ide/index.js";
export { GenericLspClient, detectLspForProject, type LspClient, type Location, type Range, type Position, type DocumentSymbol, type SymbolInformation, type Hover, type CompletionItem as LspCompletionItem, type SymbolKind, type CompletionItemKind } from "../services/lsp/index.js";
export { BaseTransport, StdioTransport, WebSocketTransport, TcpTransport, createTransport, type TransportConfig, type TransportMessage as TransportMsg, type TransportHandler } from "../services/transport/index.js";
export { DefaultVerificationAgent, type VerificationAgent, type VerificationTask as VerificationTaskType, type VerificationResult as VerificationResultType, type VerificationCheck as VerificationCheckType, type CheckResult } from "../verification/index.js";
export { CircuitBreaker, ExponentialBackoff, LinearBackoff, FibonacciBackoff, createBackoff, retry, ErrorRecoveryManager, createErrorRecoveryManager, type CircuitBreakerConfig, type RetryConfig as ResilienceRetryConfig, type BackoffConfig, type FallbackHandler, type ErrorRecoveryPolicy } from "../resilience/index.js";

export { TaskAgentRegistry, createTaskAgent, getTaskAgentDefaults, isAgentActive, getActiveAgentCount, type TaskAgentType, type TaskResult } from "../agent/index.js";
export { MessageBroker, createMessageBroker, type AgentMessage, type Subscription, type MessageRoute, type RouteConfig, type MessageBrokerConfig } from "../agent/routing/index.js";
export { SwarmOrchestrator, createSwarmOrchestrator, type SwarmConfig, type CollaborationMode, type HandoffContext, type AgentCapability, type AgentState } from "../agent/swarm/index.js";
export { DefaultSubAgentCache, DefaultRecursionGuard, buildForkKey, type SubAgentCache, type RecursionGuard, type SubAgentCacheEntry, type AgentForkKey } from "../agent/cache/index.js";
export { createAgentTool, type AgentToolConfig } from "../tools/agent-tool.js";
export { BridgeClient, JsonRpcBridgeServer, generateBridgeToken, type BridgeConfig, type BridgeServer, type BridgeMessage, type BridgeSession, type BridgeEvent, type BridgeApiClient, type SessionSpawner, type BridgeLogger } from "../services/bridge/index.js";
export { DefaultCoordinator, isCoordinatorMode, getCoordinatorSystemPrompt, createWorkerAgent, getSubAgentResult, getDefaultWorkerTools, type Coordinator, type CoordinatorPlan, type SubAgent, type SubAgentResult as CoordinatorSubAgentResult, type Phase, type AgentRole, type TaskContext } from "../agent/coordinator/index.js";
export { computeDiff, TerminalDiffRenderer, createDiffRenderer, type DiffRenderer, type DiffResult, type DiffBlock } from "../diff/index.js";
export { McpServer, EnhancedMCPClient, ServiceDiscovery, defaultServiceDiscovery, type McpServerConfig, type McpOAuthConfig, type McpTool, type McpResource, type McpPrompt } from "../services/mcp/index.js";
export { loadAllPlugins, getPluginById, getBuiltinPlugins, registerBuiltinPlugin, type LoadedPlugin, type PluginLoadResult, type BuiltinPluginDefinition, type PluginManifest, type PluginError } from "../plugins/index.js";
export { DualModelRetriever, ConsolidationManager, TokenBudgetInjector, MemoryConsolidator, SessionLifecycleManager, type RetrievalCandidate, type RetrievalResult } from "../memory/index.js";
export { DefaultTelemetryCollector, DefaultPerfettoTracer, type TelemetryEvent, type TraceSpan } from "../services/telemetry/index.js";
export { EnhancedToolRegistry, StreamingToolExecutor } from "../tools/index.js";
export { registerExternalTools, webFetchTool, webSearchTool } from "../tools/external-tools.js";
export { createToolLoader, type BuiltInTool, type ToolLoaderConfig } from "../tools/tool-loader.js";
export { defineTool, ReadOnlyTool, ReadWriteTool, defineBashTool, defineSearchTool } from "../tools/define-tool.js";
export { ResourceMonitor, type ResourceMonitorConfig, type ResourceLimit, type ResourceType } from "../security/resource-control.js";
export { DefaultAcpAgent, createAcpAgent, type AcpAgentConfig, type AgentCapabilities } from "../services/acp/index.js";
export { compactMessages, shouldCompact, estimateTokenCount, type CompactOptions, type CompactResult } from "../services/compact.js";
export { OAuthTokenManager, createOAuthManager, type OAuthConfig as ServiceOAuthConfig, type TokenManagerConfig } from "../services/auth/index.js";
export { DefaultSkillRegistry, loadBuiltinSkills, type Skill, type SkillRegistry, type SkillStep } from "../skills/index.js";
export { SideEffectSynchronizer, createSynchronizer, type SideEffect, type EffectHandler, type SyncConfig, type EffectPolicy } from "../state/side-effect/index.js";

export function registerTaskAgent(id: string, type: TaskAgentType, config: AgentConfig): void {
  const services = getSystemServices();
  if (!services) return;
  
  const agent = createTaskAgent(config, type);
  services.taskAgentRegistry.register(id, agent);
}

export function getTaskAgent(id: string): ReturnType<typeof createTaskAgent> | undefined {
  const services = getSystemServices();
  if (!services) return undefined;
  return services.taskAgentRegistry.get(id);
}

export function listTaskAgents(): Array<{ id: string; type: TaskAgentType; prefix: string }> {
  const services = getSystemServices();
  if (!services) return [];
  return services.taskAgentRegistry.list();
}

export function subscribeToAgentMessages(
  agentId: string,
  topics: string[],
  callback: (message: AgentMessage) => void | Promise<void>
): () => void {
  const services = getSystemServices();
  if (!services) return () => {};

  const subscription: Subscription = {
    agentId,
    topics,
    callback,
    priority: "normal",
    unsubscribe: () => {},
  };

  services.messageBroker.subscribe(subscription);
  return () => services.messageBroker.unsubscribe(agentId, topics);
}

export async function sendAgentMessage(
  target: string,
  action: string,
  payload: unknown
): Promise<void> {
  const services = getSystemServices();
  if (!services) return;

  const message: AgentMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "request",
    priority: "normal",
    source: "main",
    target,
    action,
    payload,
    timestamp: new Date(),
  };

  await services.messageBroker.send(message);
}

export async function executeSwarmTask(
  taskDescription: string,
  requiredCapabilities?: string[]
): Promise<{ success: boolean; data?: unknown; errors?: string[] }> {
  const services = getSystemServices();
  if (!services?.swarmOrchestrator) {
    return { success: false, errors: ["Swarm orchestrator not available"] };
  }

  const task = {
    id: `swarm_${Date.now()}`,
    type: "general",
    description: taskDescription,
    requiredCapabilities,
  };

  const result = await services.swarmOrchestrator.executeTask(task);
  return {
    success: result.success,
    data: result.data,
    errors: result.errors,
  };
}
