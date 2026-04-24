import {
  McpMessage,
  McpRequest,
  McpResponse,
  McpNotification,
  McpCapabilities,
  McpInitializeParams,
  McpInitializeResult,
  McpTool,
  McpResource,
  McpPrompt,
  ToolCallParams,
  ToolCallResult,
  MCP_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  parseJsonRpcMessage,
} from "./protocol.js";

export interface McpSessionConfig {
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities?: McpCapabilities;
  protocolVersion?: string;
}

export interface ToolHandler {
  (params: ToolCallParams): Promise<ToolCallResult>;
}

export interface ResourceHandler {
  (uri: string): Promise<{ contents: Array<{ type: "text"; text: string } | { type: "blob"; blob: string; mimeType: string }> }>;
}

export interface PromptHandler {
  (name: string, args?: Record<string, string>): Promise<{ messages: Array<{ role: "user" | "assistant"; content: string }> }>;
}

export class McpSession {
  private config: McpSessionConfig;
  private initialized = false;
  private protocolVersion: string = "2024-11-05";
  private clientCapabilities: McpCapabilities = {};
  private toolHandlers: Map<string, ToolHandler> = new Map();
  private resourceHandlers: Map<string, ResourceHandler> = new Map();
  private promptHandlers: Map<string, PromptHandler> = new Map();
  private requestId = 0;
  private instructions: string = "";
  private pendingRequests: Map<number | string, {
    resolve: (result: McpResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  constructor(config: McpSessionConfig) {
    this.config = config;
    if (config.protocolVersion) {
      this.protocolVersion = config.protocolVersion;
    }
  }

  async handleMessage(rawMessage: string): Promise<string | null> {
    const msg = parseJsonRpcMessage(rawMessage);
    if (!msg) {
      return JSON.stringify(createErrorResponse(
        null,
        MCP_ERROR_CODES.PARSE_ERROR,
        "Invalid JSON"
      ));
    }

    if ("method" in msg && !("id" in msg)) {
      return this.handleNotification(msg as McpNotification);
    }

    if ("method" in msg && "id" in msg) {
      return this.handleRequest(msg as McpRequest);
    }

    if ("result" in msg || "error" in msg) {
      return this.handleResponse(msg as McpResponse);
    }

    return JSON.stringify(createErrorResponse(
      null,
      MCP_ERROR_CODES.INVALID_REQUEST,
      "Unknown message type"
    ));
  }

  private async handleRequest(req: McpRequest): Promise<string> {
    const { method, id } = req;

    try {
      let result: Record<string, unknown>;

      switch (method) {
        case "initialize":
          result = await this.handleInitialize(req.params as unknown as McpInitializeParams) as unknown as Record<string, unknown>;
          break;
        case "tools/list":
          result = this.handleToolsList();
          break;
        case "tools/call":
          result = await this.handleToolsCall(req.params as unknown as ToolCallParams) as unknown as Record<string, unknown>;
          break;
        case "resources/list":
          result = this.handleResourcesList();
          break;
        case "prompts/list":
          result = this.handlePromptsList();
          break;
        default:
          return JSON.stringify(createErrorResponse(
            id,
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Method not found: ${method}`
          ));
      }

      this.initialized = true;
      return JSON.stringify(createSuccessResponse(id, result));
    } catch (error) {
      return JSON.stringify(createErrorResponse(
        id,
        MCP_ERROR_CODES.INTERNAL_ERROR,
        error instanceof Error ? error.message : "Internal error"
      ));
    }
  }

  private handleNotification(_notif: McpNotification): string | null {
    return null;
  }

  private handleResponse(resp: McpResponse): string | null {
    const id = resp.id;
    if (id === null || id === undefined) return null;

    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      if (resp.error) {
        pending.reject(new Error(resp.error.message));
      } else if (resp.result) {
        pending.resolve(resp);
      }
    }
    return null;
  }

  private async handleInitialize(params: McpInitializeParams): Promise<McpInitializeResult> {
    this.protocolVersion = params.protocolVersion || this.protocolVersion;
    this.clientCapabilities = (params.capabilities || {}) as McpCapabilities;

    const result: McpInitializeResult = {
      protocolVersion: this.protocolVersion,
      capabilities: this.config.capabilities || {},
      serverInfo: this.config.serverInfo,
    };

    if (params.instructions) {
      this.instructions = params.instructions;
    }

    return result;
  }

  private handleToolsList(): Record<string, unknown> {
    return { tools: [] };
  }

  private async handleToolsCall(params: ToolCallParams): Promise<ToolCallResult> {
    const handler = this.toolHandlers.get(params.name);
    if (!handler) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    return handler(params);
  }

  private handleResourcesList(): Record<string, unknown> {
    const resources: McpResource[] = [];
    for (const [uri, _handler] of this.resourceHandlers) {
      resources.push({ uri, name: uri.split("/").pop() || uri });
    }
    return { resources };
  }

  private handlePromptsList(): Record<string, unknown> {
    const prompts: McpPrompt[] = [];
    for (const [name, _handler] of this.promptHandlers) {
      prompts.push({ name, description: `Prompt: ${name}` });
    }
    return { prompts };
  }

  registerToolHandler(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
  }

  unregisterToolHandler(name: string): void {
    this.toolHandlers.delete(name);
  }

  registerResourceHandler(uri: string, handler: ResourceHandler): void {
    this.resourceHandlers.set(uri, handler);
  }

  unregisterResourceHandler(uri: string): void {
    this.resourceHandlers.delete(uri);
  }

  registerPromptHandler(name: string, handler: PromptHandler): void {
    this.promptHandlers.set(name, handler);
  }

  unregisterPromptHandler(name: string): void {
    this.promptHandlers.delete(name);
  }

  async handleResourceRead(uri: string): Promise<{ contents: Array<{ type: "text"; text: string } | { type: "blob"; blob: string; mimeType: string }> }> {
    const handler = this.resourceHandlers.get(uri);
    if (!handler) {
      throw new Error(`Resource not found: ${uri}`);
    }
    return handler(uri);
  }

  async handlePromptRender(name: string, args?: Record<string, string>): Promise<{ messages: Array<{ role: "user" | "assistant"; content: string }> }> {
    const handler = this.promptHandlers.get(name);
    if (!handler) {
      throw new Error(`Prompt not found: ${name}`);
    }
    return handler(name, args);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getProtocolVersion(): string {
    return this.protocolVersion;
  }

  getInstructions(): string {
    return this.instructions;
  }

  sendRequest(method: string, params?: Record<string, unknown>): Promise<McpResponse> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request: McpRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
    });
  }

  close(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
    }
    this.pendingRequests.clear();
    this.toolHandlers.clear();
    this.initialized = false;
  }
}

export interface ServerTools {
  prefix: string;
  tools: McpTool[];
}

export function mergeToolNamespaces(servers: ServerTools[]): McpTool[] {
  const out: McpTool[] = [];
  for (const s of servers) {
    for (const t of s.tools) {
      out.push({
        ...t,
        name: `${s.prefix}__${t.name}`,
      });
    }
  }
  return out;
}
