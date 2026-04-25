export enum CapabilityType {
  SKILL = "skill",
  TOOL = "tool",
  COMMAND = "command",
  AGENT = "agent",
  MEMORY_STRATEGY = "memory_strategy",
  OUTPUT_STYLE = "output_style",
}

export enum CapabilityStatus {
  LOADED = "loaded",
  ACTIVATED = "activated",
  DISABLED = "disabled",
  ERROR = "error",
}

export interface CapabilityManifest {
  name: string;
  version: string;
  type: CapabilityType;
  description: string;
  author?: string;
  license?: string;
  dependencies?: string[];
  triggers?: string[];
  allowedTools?: string[];
  requiredPermissions?: string[];
  tags?: string[];
}

export interface CapabilityContext {
  llm: LLMClientInterface;
  tools: ToolRegistry;
  memory: MemoryCore;
  state: StateManager;
  security: SecurityEngine;
  telemetry: TelemetryService;
  workspace: WorkspaceContext;
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (payload: unknown) => void): void;
  once(event: string, handler: (payload: unknown) => void): void;
  off(event: string, handler: (payload: unknown) => void): void;
}

export interface LLMClientInterface {
  chat(messages: unknown[], options?: Record<string, unknown>): Promise<unknown>;
  stream(messages: unknown[], options?: Record<string, unknown>): AsyncIterable<unknown>;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  unregister(name: string): void;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  call(name: string, input: unknown): Promise<unknown>;
}

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: I;
  handler: (input: unknown, ctx: unknown) => Promise<O>;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  resourceKeys?: string[];
}

export interface MemoryCore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  search(query: string, limit?: number): Promise<unknown[]>;
  persist(): Promise<void>;
}

export interface StateManager {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  subscribe<T>(key: string, callback: (value: T) => void): () => void;
}

export interface SecurityEngine {
  checkPermission(permission: string, context?: Record<string, unknown>): Promise<boolean>;
  sandbox(command: string, config?: Record<string, unknown>): Promise<{ success: boolean; output: string }>;
}

export interface TelemetryService {
  log(event: string, data?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

export interface WorkspaceContext {
  rootPath: string;
  isPathAllowed(path: string): boolean;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
}

export interface CapabilityPlugin<T = unknown> {
  manifest: CapabilityManifest;
  activate(ctx: CapabilityContext): Promise<T>;
  deactivate?(): Promise<void>;
  healthCheck?(): Promise<boolean>;
  onBeforeActivate?(): Promise<void>;
  onAfterActivate?(): Promise<void>;
  onBeforeDeactivate?(): Promise<void>;
  onAfterDeactivate?(): Promise<void>;
}

export interface CapabilityInfo {
  name: string;
  version: string;
  type: CapabilityType;
  status: CapabilityStatus;
  description: string;
  source: string;
  enabled: boolean;
}

export interface CapabilitySource {
  type: "filesystem" | "npm" | "remote" | "builtin";
  path?: string;
  url?: string;
  packages?: string[];
}

export interface DiscoveryResult {
  plugins: CapabilityPlugin[];
  errors: DiscoveryError[];
}

export interface DiscoveryError {
  source: string;
  message: string;
  path?: string;
}

export interface CapabilityEventMap {
  "plugin:registered": { name: string; type: CapabilityType };
  "plugin:activated": { name: string };
  "plugin:deactivated": { name: string };
  "plugin:error": { name: string; error: Error };
  "plugin:updated": { name: string };
  "capability:triggered": { name: string; input: string };
}
