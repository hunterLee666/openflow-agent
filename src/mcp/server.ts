import type { ToolDefinition } from "../types/index.js";
import { McpSession, type ToolHandler, type ResourceHandler, type PromptHandler } from "./session.js";
import {
  McpCapabilities,
  ToolCallParams,
  ToolCallResult,
  createErrorResponse,
  MCP_ERROR_CODES,
} from "./protocol.js";
import { WebSocketTransport, createWebSocketTransport } from "./websocket-transport.js";

export interface McpServerConfig {
  name: string;
  version: string;
  tools?: ToolDefinition[];
  instructions?: string;
  capabilities?: McpCapabilities;
  transport?: 'stdio' | 'websocket';
  websocketUrl?: string;
  port?: number;
}

export class McpServer {
  private config: McpServerConfig;
  private session: McpSession;
  private toolHandlers: Map<string, ToolHandler> = new Map();
  private resourceHandlers: Map<string, ResourceHandler> = new Map();
  private promptHandlers: Map<string, PromptHandler> = new Map();
  private wsTransport?: WebSocketTransport;
  private transportType: 'stdio' | 'websocket' = 'stdio';

  constructor(config: McpServerConfig) {
    this.config = config;
    this.transportType = config.transport || 'stdio';
    this.session = new McpSession({
      serverInfo: { name: config.name, version: config.version },
      capabilities: config.capabilities || this.getDefaultCapabilities(),
    });

    if (config.tools) {
      this.registerTools(config.tools);
    }

    if (config.instructions) {
      this.session.setInstructions(config.instructions);
    }
  }

  private getDefaultCapabilities(): McpCapabilities {
    return {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    };
  }

  registerToolHandler(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
    this.session.registerToolHandler(name, handler);
  }

  registerResourceHandler(uriPattern: string, handler: ResourceHandler): void {
    this.resourceHandlers.set(uriPattern, handler);
    this.session.registerResourceHandler(uriPattern, handler);
  }

  registerPromptHandler(name: string, handler: PromptHandler): void {
    this.promptHandlers.set(name, handler);
    this.session.registerPromptHandler(name, handler);
  }

  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerToolHandler(tool.name, async (params: ToolCallParams): Promise<ToolCallResult> => {
        if (tool.handler) {
          const result = await tool.handler(params.arguments, {} as any);
          return {
            content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
          };
        }
        return {
          content: [{ type: "text", text: `Tool ${tool.name} has no handler` }],
          isError: true,
        };
      });
    }
  }

  async startStdio(): Promise<void> {
    process.stdin.on("data", async (data) => {
      try {
        const rawMessage = data.toString().trim();
        if (!rawMessage) return;

        const response = await this.session.handleMessage(rawMessage);
        if (response) {
          console.log(response);
        }
      } catch (e) {
        console.log(JSON.stringify(createErrorResponse(
          null,
          MCP_ERROR_CODES.INTERNAL_ERROR,
          e instanceof Error ? e.message : "Internal error"
        )));
      }
    });
  }

  async startWebSocket(url?: string): Promise<void> {
    const wsUrl = url || this.config.websocketUrl;
    if (!wsUrl && !this.config.port) {
      throw new Error('WebSocket URL or port must be provided');
    }

    this.wsTransport = createWebSocketTransport({
      url: wsUrl,
      port: this.config.port,
      onMessage: async (message) => {
        try {
          const response = await this.session.handleMessage(JSON.stringify(message));
          if (response) {
            this.wsTransport?.send(JSON.parse(response));
          }
        } catch (e) {
          const errorResponse = createErrorResponse(
            null,
            MCP_ERROR_CODES.INTERNAL_ERROR,
            e instanceof Error ? e.message : "Internal error"
          );
          this.wsTransport?.send(JSON.parse(JSON.stringify(errorResponse)));
        }
      },
      onConnect: () => {
        console.log('MCP WebSocket server connected');
      },
      onDisconnect: () => {
        console.log('MCP WebSocket server disconnected');
      },
      onError: (error) => {
        console.error('MCP WebSocket error:', error.message);
      },
    });

    await this.wsTransport.connect(wsUrl);
  }

  async start(): Promise<void> {
    if (this.transportType === 'websocket') {
      return this.startWebSocket();
    }
    return this.startStdio();
  }

  async stop(): Promise<void> {
    if (this.wsTransport) {
      this.wsTransport.disconnect();
      this.wsTransport = undefined;
    }
  }

  getSession(): McpSession {
    return this.session;
  }

  getTransport(): WebSocketTransport | undefined {
    return this.wsTransport;
  }

  isConnected(): boolean {
    return this.wsTransport?.isConnected() ?? false;
  }
}
