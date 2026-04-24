import type { ToolDefinition } from "../types/index.js";

export interface McpServerConfig {
  name: string;
  version: string;
  tools: ToolDefinition[];
}

export class McpServer {
  private config: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    process.stdin.on("data", (data) => {
      try {
        const request = JSON.parse(data.toString());
        const response = this.handleRequest(request);
        console.log(JSON.stringify(response));
      } catch {
        console.log(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
      }
    });
  }

  private handleRequest(request: Record<string, unknown>): Record<string, unknown> {
    const method = request.method as string;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: {
              name: this.config.name,
              version: this.config.version,
            },
          },
          id: request.id,
        };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          result: {
            tools: this.config.tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
          id: request.id,
        };
      default:
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not found: ${method}` },
          id: request.id,
        };
    }
  }
}
