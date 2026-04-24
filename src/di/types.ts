export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  unregister(name: string): void;
  get(name: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
  execute(name: string, input: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  handler?: ToolHandler;
}

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolResult>;

export interface ToolExecutionContext {
  sessionId: string;
  cwd: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MemorySystem {
  add( entry: MemoryEntry): void;
  get(id: string): MemoryEntry | undefined;
  query(text: string, limit?: number): MemoryEntry[];
  getRecent(limit?: number): MemoryEntry[];
  clear(): void;
  getStats(): MemoryStats;
}

export interface MemoryEntry {
  id: string;
  type: "working" | "episodic" | "semantic";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<string, number>;
  oldestEntry?: number;
  newestEntry?: number;
}

export interface PermissionPipeline {
  evaluate(ctx: PermissionContext): Promise<PermissionDecision>;
  addRule(rule: PermissionRule): void;
  removeRule(id: string): void;
  getRules(source?: PermissionRuleSource): PermissionRule[];
  clearRules(source?: PermissionRuleSource): void;
}

export interface PermissionContext {
  tool: string;
  input: Record<string, unknown>;
  cwd: string;
  mode: PermissionMode;
  isReadOnly: boolean;
  isDestructive: boolean;
  isGitCommand: boolean;
  isNetworkCommand: boolean;
  sessionId?: string;
  timestamp?: number;
}

export type PermissionMode = "default" | "acceptEdits" | "plan" | "auto" | "dontAsk" | "bypass" | "readonly";

export type PermissionDecision =
  | { type: "allow"; reason?: string; updatedInput?: Record<string, unknown> }
  | { type: "deny"; reason: string }
  | { type: "ask"; prompt: string; risk: string; suggestions?: string[] };

export interface PermissionRule {
  id: string;
  source: PermissionRuleSource;
  behavior: PermissionBehavior;
  priority: number;
  ruleContent: PermissionRuleContent;
  metadata?: PermissionRuleMetadata;
}

export type PermissionRuleSource = "userSettings" | "projectSettings" | "localSettings" | "flagSettings" | "policySettings" | "cliArg" | "command" | "session";

export type PermissionBehavior = "allow" | "ask" | "deny";

export interface PermissionRuleContent {
  toolName?: string;
  commandPattern?: string;
  pathPattern?: string;
}

export interface PermissionRuleMetadata {
  createdAt: number;
  expiresAt?: number;
  tags?: string[];
}

export interface McpServer {
  start(): Promise<void>;
  stop(): void;
  registerToolHandler(name: string, handler: ToolHandler): void;
  getRegisteredTools(): string[];
  isConnected(): boolean;
}

export interface ConfigService {
  get<T = unknown>(key: string, defaultValue?: T): T | undefined;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
  reload(): Promise<void>;
  onChange(key: string, callback: (value: unknown) => void): () => void;
}

export interface SessionService {
  id: string;
  start(): Promise<void>;
  end(): Promise<void>;
  pause(): void;
  resume(): void;
  getState(): SessionState;
  onStateChange(callback: (state: SessionState) => void): () => void;
}

export type SessionState = "active" | "paused" | "ended";

export interface TelemetryService {
  track(event: string, properties?: Record<string, unknown>): void;
  flush(): Promise<void>;
  setUser(userId: string): void;
}

export interface HealthCheckService {
  check(): Promise<HealthStatus>;
  registerCheck(name: string, check: () => Promise<boolean>): void;
  getStatus(): HealthStatus;
}

export interface HealthStatus {
  healthy: boolean;
  checks: Record<string, boolean>;
  responseTimeMs?: number;
}

export interface LifecycleService {
  emit(event: LifecycleEvent, payload?: Record<string, unknown>): Promise<void>;
  on(event: LifecycleEvent, callback: (payload?: Record<string, unknown>) => void): () => void;
}

export type LifecycleEvent = "appStart" | "appStop" | "sessionStart" | "sessionEnd" | "error";

export interface SandboxService {
  execute(command: string, config: SandboxConfig): Promise<SandboxResult>;
  isAvailable(): boolean;
}

export interface SandboxConfig {
  enabled: boolean;
  allowedPaths?: string[];
  deniedPaths?: string[];
  maxMemory?: string;
  maxCpuTime?: string;
}

export interface SandboxResult {
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  violations?: SandboxViolation[];
}

export interface SandboxViolation {
  type: "path" | "network" | "memory" | "cpu";
  message: string;
  timestamp: number;
}
