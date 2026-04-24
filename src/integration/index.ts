import type { QueryContext, AgentConfig } from "../types/index.js";
import { query } from "../core/query-engine.js";
import { DefaultToolRegistry } from "../tools/registry.js";
import { getDefaultTools } from "../tools/file-tools.js";
import { getTaskAgentTools } from "../agent/task-agent.js";
import { FileSessionStore } from "../services/session.js";
import { ConsoleTelemetry } from "../services/telemetry.js";
import { DefaultMemorySystem } from "../memory/index.js";
import { DefaultHookRegistry } from "../hooks/registry.js";
import { DefaultPromptCache } from "../cache/prompt-cache.js";
import { DefaultCommandRegistry, createBuiltinCommands } from "../commands/registry.js";
import { WorkspaceBoundaryValidator } from "../security/workspace-boundary.js";
import { createPermissionPipeline } from "../permissions/index.js";
import { SettingsLoader } from "../config/settings.js";
import { CommandParser } from "../utils/command-parser.js";
import { MemoryTruncator, DEFAULT_MEMORY_LIMITS } from "../memory/memory-truncator.js";
import { createSandboxAdapter } from "../security/sandbox.js";
import { loadConfig } from "../services/config.js";
import { DIContainer, QueryContextFactory, createDefaultContainer } from "../di/container.js";
import { ErrorHandler, defaultErrorHandler, ErrorCatalog, SmartRetry, defaultSmartRetry, type ErrorEntry } from "../error/catalog.js";
import { TaskStateMachine, defaultTaskStateMachine, type Task, type TaskState } from "../task/state-machine.js";
import { ProgressTracker, defaultProgressTracker, MultiTaskProgressTracker, defaultMultiTaskTracker } from "../task/progress.js";
import { CommandCompleter, defaultCompleter } from "../commands/completion.js";
import { MessageGrouper, defaultMessageGrouper } from "../ui/collapse.js";
import { Virtualizer, createVirtualizer } from "../ui/virtual-list.js";
import { FileSystemAdapter } from "../state/persistence.js";

export interface SystemServices {
  toolRegistry: DefaultToolRegistry;
  sessionStore: FileSessionStore;
  telemetry: ConsoleTelemetry;
  memorySystem: DefaultMemorySystem;
  hookRegistry: DefaultHookRegistry;
  promptCache: DefaultPromptCache;
  commandRegistry: DefaultCommandRegistry;
  workspaceValidator: WorkspaceBoundaryValidator;
  permissionPipeline: ReturnType<typeof createPermissionPipeline>;
  settingsLoader: SettingsLoader;
  memoryTruncator: MemoryTruncator;
  sandboxAdapter: ReturnType<typeof createSandboxAdapter>;
  commandParser: CommandParser;
  diContainer: DIContainer;
  queryContextFactory: QueryContextFactory;
  errorHandler: ErrorHandler;
  taskStateMachine: TaskStateMachine;
  progressTracker: ProgressTracker;
  multiTaskTracker: MultiTaskProgressTracker;
  commandCompleter: CommandCompleter;
  messageGrouper: MessageGrouper;
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
  for (const tool of getDefaultTools()) {
    toolRegistry.register(tool);
  }

  const sessionStore = new FileSessionStore();
  const telemetry = new ConsoleTelemetry();
  const memorySystem = new DefaultMemorySystem();
  const hookRegistry = new DefaultHookRegistry();
  const promptCache = new DefaultPromptCache();
  const commandRegistry = new DefaultCommandRegistry();
  for (const cmd of createBuiltinCommands()) {
    commandRegistry.register(cmd);
  }

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

  const memoryTruncator = new MemoryTruncator({
    maxEntryPointLines: DEFAULT_MEMORY_LIMITS.maxEntryPointLines,
    maxEntryPointBytes: DEFAULT_MEMORY_LIMITS.maxEntryPointBytes,
    retentionDays: DEFAULT_MEMORY_LIMITS.retentionDays,
  });

  const sandboxAdapter = createSandboxAdapter();
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

  systemServices = {
    toolRegistry,
    sessionStore,
    telemetry,
    memorySystem,
    hookRegistry,
    promptCache,
    commandRegistry,
    workspaceValidator,
    permissionPipeline,
    settingsLoader,
    memoryTruncator,
    sandboxAdapter,
    commandParser,
    diContainer,
    queryContextFactory,
    errorHandler,
    taskStateMachine,
    progressTracker,
    multiTaskTracker,
    commandCompleter,
    messageGrouper,
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
export { ErrorHandler, ErrorCatalog, SmartRetry } from "../error/catalog.js";
export { TaskStateMachine, type Task, type TaskState, type TaskTransition } from "../task/state-machine.js";
export { ProgressTracker, MultiTaskProgressTracker, type ProgressUpdate } from "../task/progress.js";
export { CommandCompleter, type CompletionCandidate, type CompletionContext } from "../commands/completion.js";
export { MessageGrouper, type MessageGroup, type CollapseRule } from "../ui/collapse.js";
export { Virtualizer, type VirtualItem } from "../ui/virtual-list.js";
export { FileSystemAdapter, PersistentStateStore, type StateSnapshot } from "../state/persistence.js";
