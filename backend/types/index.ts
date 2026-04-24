export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  cacheControl?: CacheControl;
}

export * from "./ids.js";

export interface CacheControl {
  type: "ephemeral" | "hidden";
  category?: "system" | "user" | "context" | "memory";
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface StreamEvent {
  kind:
    | "assistant_text_delta"
    | "tool_input_delta"
    | "thinking_delta"
    | "tool_execution_start"
    | "tool_execution_end"
    | "error"
    | "completion";
  text?: string;
  thinking?: string;
  index?: number;
  partialJson?: string;
  toolName?: string;
  toolUseId?: string;
  error?: string;
  result?: QueryResult;
}

export interface QueryResult {
  status:
    | "completed"
    | "cancelled"
    | "budget_exceeded"
    | "fatal_error"
    | "compaction_circuit_breaker"
    | "max_turns_exceeded";
  reason?: string;
  finalText?: string;
  usage?: UsageCounters;
  diagnostics?: { requestId?: string };
}

export interface UsageCounters {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface QueryInput {
  message: string;
  threadId?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface QueryContext {
  session: SessionStore;
  config: AgentConfig;
  telemetry: Telemetry;
  abortSignal: AbortSignal;
  toolRegistry: ToolRegistry;
  memory?: import("../memory/types.js").MemorySystem;
  hooks?: InstanceType<typeof import("../hooks/registry.js").HookRegistry>;
  permissionPipeline?: import("../permissions/types.js").PermissionPipeline;
  promptCache?: import("../services/cache/types.js").PromptCache;
  commandRegistry?: import("../commands/types.js").CommandRegistry;
  workspaceValidator?: import("../security/workspace-boundary.js").WorkspaceBoundaryValidator;
}

export interface SessionStore {
  loadMessages(threadId?: string): Promise<Message[]>;
  saveMessages(threadId: string, messages: Message[]): Promise<void>;
  createThread(): Promise<string>;
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  provider?: 'anthropic' | 'openai' | 'dashscope' | 'zhipu' | 'zhipuai' | 'deepseek' | 'minimax' | 'moonshot' | 'openrouter' | 'nvidia';
  maxTokens: number;
  maxOutputTokens?: number;
  maxTurns: number;
  tokenBudget: number;
  moneyBudgetUsd?: number;
  permissionMode: PermissionMode;
  compactionThreshold: number;
  maxCompactionFailures: number;
  baseUrl?: string;
  maskSensitiveOutputs?: boolean;
  systemPrompt?: string;
  userContext?: Record<string, string>;
  systemContext?: Record<string, string>;
  tools?: unknown[];
}

export type PermissionMode = "acceptAll" | "acceptEdits" | "askUser" | "readonly";

export interface Telemetry {
  log(event: string, data?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

export interface ToolContext {
  cwd: string;
  signal: AbortSignal;
  config: AgentConfig;
  sessionId?: string;
  turnCount?: number;
  telemetry?: TelemetryContext;
  contentBudget?: ContentBudget;
  memory?: MemoryContext;
  permissionContext?: ToolPermissionContext;
  inProgressToolUseIds?: Set<string>;
  responseLength?: number;
  userInteractionHandler?: UserInteractionHandler;
  onProgress?: (toolUseId: string, progress: number, message?: string) => void;
  onInterrupt?: (toolUseId: string) => void;
}

export interface TelemetryContext {
  traceId: string;
  spanId: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

export interface ContentBudget {
  maxChars: number;
  currentChars: number;
  toolUseId?: string;
}

export interface MemoryContext {
  working?: {
    currentTask: string;
    taskStack: string[];
    recentToolResults: Array<{ tool: string; result: string; timestamp: number }>;
  };
  episodic?: {
    record: (event: unknown) => Promise<void>;
  };
  semantic?: {
    store: (fact: unknown) => Promise<void>;
    query: (question: string, limit?: number) => Promise<unknown[]>;
  };
}

export interface ToolPermissionContext {
  mode: PermissionMode;
  alwaysAllowRules?: Record<string, string[]>;
  alwaysDenyRules?: Record<string, string[]>;
  alwaysAskRules?: Record<string, string[]>;
  workspaceBoundaries?: WorkspaceBoundary[];
}

export interface WorkspaceBoundary {
  pathPattern: RegExp;
  action: "allow" | "deny" | "ask";
  reason?: string;
}

export interface UserInteractionHandler {
  requestPrompt?: (request: PromptRequest) => Promise<PromptResponse>;
  requestConfirmation?: (message: string) => Promise<boolean>;
}

export interface PromptRequest {
  type: "permission" | "input" | "confirmation";
  toolName?: string;
  message: string;
  options?: string[];
}

export interface PromptResponse {
  approved: boolean;
  input?: string;
  selectedOption?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  isConcurrencySafe: boolean;
  isReadOnly: boolean;
  isDestructive?: boolean;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
  validateInput?: (input: unknown, ctx: ToolContext) => Promise<{ result: boolean; message?: string }>;
  interruptBehavior?: () => "cancel" | "block";
  getToolUseSummary?: (input: unknown) => string | null;
  maxResultSizeChars?: number;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
}

export interface QueryState {
  turn: number;
  messages: Message[];
  model: string;
  compactionFailures: number;
  compactionCircuitOpen: boolean;
  usage: UsageCounters;
  threadId: string;
  contextMetrics: ContextMetrics;
  retryAttempt: number;
}

export interface ContextMetrics {
  injectionTokens: number;
  claudeMdTokens: number;
  messagesTokens: number;
}
