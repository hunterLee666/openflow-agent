import type { ToolDefinition } from "../tools/enhanced-registry.js";
import type { PermissionContext, PermissionDecision, PermissionMode } from "../permissions/types.js";
import type { MCPServerConnection } from "../services/mcp/types.js";

export interface QueryEngineConfig {
  cwd: string;
  model?: string;
  fallbackModel?: string;
  provider?: "anthropic" | "openai" | "google" | "custom";
  apiKey?: string;
  baseUrl?: string;
  tools: ToolDefinition[];
  mcpClients: MCPServerConnection[];
  permissionMode: PermissionMode;
  maxTurns?: number;
  maxBudgetUsd?: number;
  thinkingConfig?: ThinkingConfig;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  customInstructions?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  getAppState: () => AppState;
  setAppState: (f: (prev: AppState) => AppState) => void;
}

export interface ThinkingConfig {
  enabled: boolean;
  maxTokens?: number;
  minTokens?: number;
  stopSequences?: string[];
}

export interface AppState {
  verbose: boolean;
  mainLoopModel: string;
  sessionId?: string;
  threadId?: string;
  turnCount: number;
  contextMetrics: ContextMetrics;
  usage: UsageMetrics;
  permissions: PermissionState;
  tasks: TaskState;
  messages: MessageState;
}

export interface ContextMetrics {
  injectionTokens: number;
  claudeMdTokens: number;
  messagesTokens: number;
  systemPromptTokens: number;
  availableContext: number;
  usedContext: number;
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  lastUpdated: number;
}

export interface PermissionState {
  mode: PermissionMode;
  allowList: string[];
  denyList: string[];
  alwaysAsk: boolean;
}

export interface TaskState {
  active: TaskInfo | null;
  background: TaskInfo[];
  completed: TaskInfo[];
}

export interface TaskInfo {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  progress?: number;
  result?: unknown;
  error?: string;
}

export interface MessageState {
  count: number;
  lastMessage?: MessageInfo;
  totalBytes: number;
}

export interface MessageInfo {
  id: string;
  role: "user" | "assistant" | "system";
  timestamp: number;
  tokenCount: number;
}

export interface QueryContextFactoryConfig {
  cwd: string;
  sessionStore: SessionStore;
  toolRegistry: ToolRegistry;
  permissionHandler: PermissionHandler;
  telemetry: TelemetryService;
  memory?: MemoryService;
  hooks?: HookRegistry;
  mcpClients?: MCPServerConnection[];
  config: Partial<QueryEngineConfig>;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  listByCategory(category: string): ToolDefinition[];
}

export interface SessionStore {
  createThread(): Promise<string>;
  loadMessages(threadId: string): Promise<AppMessage[]>;
  saveMessages(threadId: string, messages: AppMessage[]): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  listThreads(): Promise<ThreadInfo[]>;
}

export interface ThreadInfo {
  id: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

export interface PermissionHandler {
  check(tool: string, input: Record<string, unknown>, context: PermissionContext): Promise<PermissionDecision>;
  approve(tool: string, input: Record<string, unknown>): Promise<void>;
  deny(tool: string, input: Record<string, unknown>, reason: string): Promise<void>;
  reset(): void;
}

export interface TelemetryService {
  track(event: string, data: Record<string, unknown>): void;
  trackError(error: Error, context?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

export interface MemoryService {
  load(prompt: string): Promise<string>;
  save(id: string, content: string): Promise<void>;
  clear(id?: string): Promise<void>;
}

export interface HookRegistry {
  dispatch(event: string, data: unknown): Promise<void>;
  register(event: string, handler: HookHandler): void;
}

export type HookHandler = (data: unknown) => Promise<void>;

export interface AppMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | AppMessageContent[];
  name?: string;
  toolUseId?: string;
}

export type AppMessageContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string };

export class DefaultQueryContextFactory implements QueryContextFactory {
  private config: QueryContextFactoryConfig;

  constructor(config: QueryContextFactoryConfig) {
    this.config = config;
  }

  createContext(overrides?: Partial<QueryEngineConfig>): QueryContext {
    const fullConfig: QueryEngineConfig = {
      cwd: this.config.cwd,
      permissionMode: this.config.config.permissionMode || "default",
      tools: this.config.toolRegistry.list(),
      mcpClients: this.config.mcpClients || [],
      getAppState: this.config.config.getAppState!,
      setAppState: this.config.config.setAppState!,
      ...this.config.config,
      ...overrides,
    };

    return {
      config: fullConfig,
      session: this.config.sessionStore,
      tools: this.config.toolRegistry,
      permissions: this.config.permissionHandler,
      telemetry: this.config.telemetry,
      memory: this.config.memory,
      hooks: this.config.hooks,
      mcpClients: this.config.mcpClients || [],
    };
  }

  getDefaultConfig(): Readonly<QueryEngineConfig> {
    return this.createContext().config;
  }

  updateConfig(updates: Partial<QueryEngineConfig>): void {
    this.config.config = {
      ...this.config.config,
      ...updates,
    };
  }
}

export interface QueryContext {
  config: QueryEngineConfig;
  session: SessionStore;
  tools: ToolRegistry;
  permissions: PermissionHandler;
  telemetry: TelemetryService;
  memory?: MemoryService;
  hooks?: HookRegistry;
  mcpClients: MCPServerConnection[];
}

export interface QueryContextFactory {
  createContext(overrides?: Partial<QueryEngineConfig>): QueryContext;
  getDefaultConfig(): Readonly<QueryEngineConfig>;
  updateConfig(updates: Partial<QueryEngineConfig>): void;
}

export function createQueryEngineConfig(
  partial: Partial<QueryEngineConfig> & { cwd: string; tools: ToolDefinition[] }
): QueryEngineConfig {
  return {
    cwd: partial.cwd,
    tools: partial.tools,
    mcpClients: partial.mcpClients || [],
    permissionMode: partial.permissionMode || "default",
    maxTurns: partial.maxTurns || 100,
    maxBudgetUsd: partial.maxBudgetUsd,
    thinkingConfig: partial.thinkingConfig,
    systemPrompt: partial.systemPrompt,
    appendSystemPrompt: partial.appendSystemPrompt,
    customInstructions: partial.customInstructions,
    temperature: partial.temperature,
    topP: partial.topP,
    maxTokens: partial.maxTokens,
    model: partial.model,
    fallbackModel: partial.fallbackModel,
    provider: partial.provider,
    apiKey: partial.apiKey,
    baseUrl: partial.baseUrl,
    getAppState: partial.getAppState!,
    setAppState: partial.setAppState!,
  };
}

export interface QueryEngineOptions {
  config: QueryEngineConfig;
  onTurnComplete?: (turn: number, state: QueryState) => void;
  onError?: (error: Error, turn: number) => void;
  onCompaction?: (reason: string) => void;
}

export interface QueryState {
  turn: number;
  messages: AppMessage[];
  model: string;
  compactionFailures: number;
  compactionCircuitOpen: boolean;
  usage: UsageMetrics;
  threadId: string;
  contextMetrics: ContextMetrics;
  retryAttempt: number;
}
