import type { McpCapabilities, McpServerConfig } from "./protocol.js";
import { MCP_ERROR_CODES, createErrorResponse } from "./protocol.js";
import { McpSession, type ToolHandler, type ResourceHandler, type PromptHandler } from "./session.js";
import { WebSocketTransport, createWebSocketTransport } from "./websocket-transport.js";

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
  }

  private getDefaultCapabilities(): McpCapabilities {
    return {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    };
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
    });

    await this.wsTransport.connect(wsUrl);
  }

  async start(): Promise<void> {
    switch (this.transportType) {
      case 'stdio':
        await this.startStdio();
        break;
      case 'websocket':
        await this.startWebSocket();
        break;
      default:
        throw new Error(`Unsupported transport type: ${this.transportType}`);
    }
  }

  async stop(): Promise<void> {
    if (this.wsTransport) {
      this.wsTransport.disconnect();
      this.wsTransport = undefined;
    }
    this.session.close();
  }

  registerTool(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
    this.session.registerToolHandler(name, handler);
  }

  unregisterTool(name: string): void {
    this.toolHandlers.delete(name);
    this.session.unregisterToolHandler(name);
  }

  registerResource(uri: string, handler: ResourceHandler): void {
    this.resourceHandlers.set(uri, handler);
    this.session.registerResourceHandler(uri, handler);
  }

  unregisterResource(uri: string): void {
    this.resourceHandlers.delete(uri);
    this.session.unregisterResourceHandler(uri);
  }

  registerPrompt(name: string, handler: PromptHandler): void {
    this.promptHandlers.set(name, handler);
    this.session.registerPromptHandler(name, handler);
  }

  unregisterPrompt(name: string): void {
    this.promptHandlers.delete(name);
    this.session.unregisterPromptHandler(name);
  }

  getSession(): McpSession {
    return this.session;
  }

  isInitialized(): boolean {
    return this.session.isInitialized();
  }
}
