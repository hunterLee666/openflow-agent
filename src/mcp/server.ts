import type { ToolDefinition } from "../types/index.js";
import { McpSession, type ToolHandler, type ResourceHandler, type PromptHandler } from "./session.js";
import {
  McpCapabilities,
  ToolCallParams,
  ToolCallResult,
  createErrorResponse,
  MCP_ERROR_CODES,
} from "./protocol.js";

export interface McpServerConfig {
  name: string;
  version: string;
  tools?: ToolDefinition[];
  instructions?: string;
  capabilities?: McpCapabilities;
}

export class McpServer {
  private config: McpServerConfig;
  private session: McpSession;
  private toolHandlers: Map<string, ToolHandler> = new Map();
  private resourceHandlers: Map<string, ResourceHandler> = new Map();
  private promptHandlers: Map<string, PromptHandler> = new Map();

  constructor(config: McpServerConfig) {
    this.config = config;
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

  async start(): Promise<void> {
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

  getSession(): McpSession {
    return this.session;
  }
}
