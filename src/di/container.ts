import type {
  ToolRegistry,
  ToolDefinition,
  ToolResult,
  MemorySystem,
  PermissionPipeline,
  McpServer,
  ConfigService,
  SessionService,
  TelemetryService,
  HealthCheckService,
  LifecycleService,
  SandboxService,
} from "./types.js";

export interface ServiceFactory<T = unknown> {
  (container: DIContainer): T;
}

export interface ServiceRegistration<T = unknown> {
  name: string;
  factory: ServiceFactory<T>;
  singleton?: boolean;
  dependencies?: string[];
}

export class DIContainer {
  private services: Map<string, unknown> = new Map();
  private factories: Map<string, ServiceRegistration> = new Map();
  private instantiationOrder: string[] = [];
  private beingCreated: Set<string> = new Set();

  register<T = unknown>(registration: ServiceRegistration<T>): void {
    this.factories.set(registration.name, registration as ServiceRegistration);
  }

  registerSingleton<T = unknown>(name: string, factory: ServiceFactory<T>): void {
    this.register({ name, factory, singleton: true });
  }

  registerFactory<T = unknown>(name: string, factory: ServiceFactory<T>): void {
    this.register({ name, factory, singleton: false });
  }

  get<T = unknown>(name: string): T {
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    const registration = this.factories.get(name);
    if (!registration) {
      throw new Error(`Service not registered: ${name}`);
    }

    if (this.beingCreated.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    this.beingCreated.add(name);

    try {
      const instance = registration.factory(this);
      if (registration.singleton) {
        this.services.set(name, instance);
        this.instantiationOrder.push(name);
      }
      return instance as T;
    } finally {
      this.beingCreated.delete(name);
    }
  }

  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  clear(): void {
    this.services.clear();
    this.instantiationOrder = [];
  }

  getRegisteredServices(): string[] {
    return Array.from(this.factories.keys());
  }

  getInstantiatedServices(): string[] {
    return [...this.instantiationOrder];
  }
}

export interface QueryContextOptions {
  sessionId?: string;
  cwd?: string;
  userId?: string;
}

export class QueryContextFactory {
  private container: DIContainer;

  constructor(container?: DIContainer) {
    this.container = container || new DIContainer();
  }

  getContainer(): DIContainer {
    return this.container;
  }

  createContext(options: QueryContextOptions = {}): QueryContext {
    return {
      tools: this.container.get<ToolRegistry>("tools"),
      memory: this.container.get<MemorySystem>("memory"),
      permissions: this.container.get<PermissionPipeline>("permissions"),
      mcp: this.container.get<McpServer>("mcp"),
      config: this.container.get<ConfigService>("config"),
      session: this.container.get<SessionService>("session"),
      telemetry: this.container.get<TelemetryService>("telemetry"),
      health: this.container.get<HealthCheckService>("health"),
      lifecycle: this.container.get<LifecycleService>("lifecycle"),
      sandbox: this.container.get<SandboxService>("sandbox"),
      sessionId: options.sessionId || this.generateSessionId(),
      cwd: options.cwd || process.cwd(),
      userId: options.userId,
      timestamp: Date.now(),
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export interface QueryContext {
  tools: ToolRegistry;
  memory: MemorySystem;
  permissions: PermissionPipeline;
  mcp: McpServer;
  config: ConfigService;
  session: SessionService;
  telemetry: TelemetryService;
  health: HealthCheckService;
  lifecycle: LifecycleService;
  sandbox: SandboxService;
  sessionId: string;
  cwd: string;
  userId?: string;
  timestamp: number;
}

export class DefaultServiceRegistry implements ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool || !tool.handler) {
      return { content: [{ type: "text", text: `Tool ${name} not found or has no handler` }], isError: true };
    }
    try {
      const result = await tool.handler(input, { sessionId: "", cwd: "" });
      return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: "text", text: String(error) }], isError: true };
    }
  }
}

export function createDefaultContainer(): DIContainer {
  const container = new DIContainer();

  container.registerSingleton<ToolRegistry>("tools", () => new DefaultServiceRegistry());
  container.registerSingleton<MemorySystem>("memory", () => ({
    add: () => {},
    get: () => undefined,
    query: () => [],
    getRecent: () => [],
    clear: () => {},
    getStats: () => ({ totalEntries: 0, byType: {} }),
  }));
  container.registerSingleton<PermissionPipeline>("permissions", () => ({
    evaluate: async () => ({ type: "allow" }),
    addRule: () => {},
    removeRule: () => {},
    getRules: () => [],
    clearRules: () => {},
  }));
  container.registerSingleton<McpServer>("mcp", () => ({
    start: async () => {},
    stop: () => {},
    registerToolHandler: () => {},
    getRegisteredTools: () => [],
    isConnected: () => false,
  }));
  container.registerSingleton<ConfigService>("config", () => ({
    get: () => undefined,
    set: () => {},
    getAll: () => ({}),
    reload: async () => {},
    onChange: () => () => {},
  }));
  container.registerSingleton<SessionService>("session", () => ({
    id: "",
    start: async () => {},
    end: async () => {},
    pause: () => {},
    resume: () => {},
    getState: () => "active" as const,
    onStateChange: () => () => {},
  }));
  container.registerSingleton<TelemetryService>("telemetry", () => ({
    track: () => {},
    flush: async () => {},
    setUser: () => {},
  }));
  container.registerSingleton<HealthCheckService>("health", () => ({
    check: async () => ({ healthy: true, checks: {} }),
    registerCheck: () => {},
    getStatus: () => ({ healthy: true, checks: {} }),
  }));
  container.registerSingleton<LifecycleService>("lifecycle", () => ({
    emit: async () => {},
    on: () => () => {},
  }));
  container.registerSingleton<SandboxService>("sandbox", () => ({
    execute: async () => ({ success: true }),
    isAvailable: () => false,
  }));

  return container;
}

export const defaultContainer = createDefaultContainer();
export const defaultQueryContextFactory = new QueryContextFactory(defaultContainer);
