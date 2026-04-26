import { z } from "zod";

export const CapabilityTypeSchema = z.enum(["skill", "tool", "command", "agent", "memory_strategy", "output_style"]);

export const CapabilityStatusSchema = z.enum(["loaded", "activated", "disabled", "error"]);

export const CapabilityManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  type: CapabilityTypeSchema,
  description: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  triggers: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  requiredPermissions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.unknown(),
  handler: z.any(),
  isReadOnly: z.boolean().optional(),
  isConcurrencySafe: z.boolean().optional(),
  resourceKeys: z.array(z.string()).optional(),
});

export const CapabilityInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  type: CapabilityTypeSchema,
  status: CapabilityStatusSchema,
  description: z.string(),
  source: z.string(),
  enabled: z.boolean(),
});

export const CapabilitySourceSchema = z.object({
  type: z.enum(["filesystem", "npm", "remote", "builtin"]),
  path: z.string().optional(),
  url: z.string().optional(),
  packages: z.array(z.string()).optional(),
});

export const DiscoveryErrorSchema = z.object({
  source: z.string(),
  message: z.string(),
  path: z.string().optional(),
});

export const DiscoveryResultSchema = z.object({
  plugins: z.array(z.any()),
  errors: z.array(DiscoveryErrorSchema),
});

export type CapabilityType = z.infer<typeof CapabilityTypeSchema>;
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type CapabilityInfo = z.infer<typeof CapabilityInfoSchema>;
export type CapabilitySource = z.infer<typeof CapabilitySourceSchema>;
export type DiscoveryError = z.infer<typeof DiscoveryErrorSchema>;
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

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

export interface CapabilityEventMap {
  "plugin:registered": { name: string; type: CapabilityType };
  "plugin:activated": { name: string };
  "plugin:deactivated": { name: string };
  "plugin:error": { name: string; error: Error };
  "plugin:updated": { name: string };
  "capability:triggered": { name: string; input: string };
}
