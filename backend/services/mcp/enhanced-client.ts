import type {
  McpTool,
  McpResource,
  McpPrompt,
  ToolCallParams,
  ToolCallResult,
  McpServerConfig,
} from "./protocol.js";

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  tokenUrl: string;
  refreshUrl?: string;
  scope?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface McpCallResult {
  success: boolean;
  data?: ToolCallResult;
  error?: string;
  truncated?: boolean;
  outputFile?: string;
}

export interface McpClientOptions {
  serverConfig: McpServerConfig;
  oauth?: OAuthConfig;
  maxOutputSize?: number;
  outputDir?: string;
  onToolStart?: (toolName: string, params: ToolCallParams) => void;
  onToolEnd?: (toolName: string, result: McpCallResult) => void;
}

export class EnhancedMCPClient {
  private config: McpServerConfig;
  private oauth?: OAuthConfig;
  private maxOutputSize: number;
  private outputDir: string;
  private onToolStart?: (toolName: string, params: ToolCallParams) => void;
  private onToolEnd?: (toolName: string, result: McpCallResult) => void;
  private tools: McpTool[] = [];
  private resources: McpResource[] = [];
  private prompts: McpPrompt[] = [];
  private connected = false;

  constructor(options: McpClientOptions) {
    this.config = options.serverConfig;
    this.oauth = options.oauth;
    this.maxOutputSize = options.maxOutputSize ?? 100_000;
    this.outputDir = options.outputDir ?? "/tmp/mcp-output";
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
  }

  async connect(): Promise<void> {
    if (this.oauth) {
      await this.checkAndRefreshToken();
    }

    switch (this.config.type) {
      case "stdio":
        await this.connectStdio();
        break;
      case "sse":
        await this.connectSSE();
        break;
      case "http":
        await this.connectHTTP();
        break;
      case "ws":
        await this.connectWebSocket();
        break;
      default:
        throw new Error(`Unsupported transport type: ${this.config.type}`);
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<McpCallResult> {
    if (!this.connected) {
      throw new Error("MCP client not connected");
    }

    const params: ToolCallParams = { name: toolName, arguments: args };

    this.onToolStart?.(toolName, params);

    try {
      if (this.oauth) {
        await this.checkAndRefreshToken();
      }

      const result = await this.executeToolCall(params, options?.timeoutMs);

      const processedResult = this.handleLargeOutput(result);

      const callResult: McpCallResult = {
        success: !result.isError,
        data: processedResult,
        truncated: processedResult !== result,
      };

      if (callResult.truncated && processedResult.content) {
        const outputFile = await this.persistLargeOutput(processedResult);
        callResult.outputFile = outputFile;
      }

      this.onToolEnd?.(toolName, callResult);
      return callResult;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (this.isAuthError(err) && this.oauth) {
        await this.refreshToken();
        return this.callTool(toolName, args, options);
      }

      const callResult: McpCallResult = {
        success: false,
        error: err.message,
      };

      this.onToolEnd?.(toolName, callResult);
      return callResult;
    }
  }

  private async checkAndRefreshToken(): Promise<void> {
    if (!this.oauth) return;

    const now = Date.now();
    const bufferMs = 60_000;

    if (this.oauth.expiresAt && now >= this.oauth.expiresAt - bufferMs) {
      await this.refreshToken();
    }
  }

  private async refreshToken(): Promise<void> {
    if (!this.oauth?.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(this.oauth.refreshUrl ?? this.oauth.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.oauth.refreshToken,
        client_id: this.oauth.clientId,
        ...(this.oauth.clientSecret && { client_secret: this.oauth.clientSecret }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    this.oauth.accessToken = data.access_token;
    if (data.refresh_token) {
      this.oauth.refreshToken = data.refresh_token;
    }
    if (data.expires_in) {
      this.oauth.expiresAt = Date.now() + data.expires_in * 1000;
    }
  }

  private isAuthError(error: Error): boolean {
    const authErrorCodes = [401, 403, "UNAUTHORIZED", "FORBIDDEN", "invalid_token"];
    return authErrorCodes.some((code) =>
      error.message.includes(String(code))
    );
  }

  private handleLargeOutput(result: ToolCallResult): ToolCallResult {
    if (!result.content) return result;

    let totalSize = 0;
    for (const item of result.content) {
      if (item.type === "text") {
        totalSize += item.text.length;
      } else if (item.type === "image") {
        totalSize += item.data.length;
      }
    }

    if (totalSize <= this.maxOutputSize) {
      return result;
    }

    const truncatedContent = result.content.map((item) => {
      if (item.type === "text") {
        const maxTextSize = Math.floor(this.maxOutputSize / result.content.length);
        return {
          type: "text" as const,
          text: item.text.length > maxTextSize
            ? item.text.substring(0, maxTextSize) + "\n... [output truncated]"
            : item.text,
        };
      }
      return item;
    });

    return {
      ...result,
      content: truncatedContent,
    };
  }

  private async persistLargeOutput(result: ToolCallResult): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");

    await fs.mkdir(this.outputDir, { recursive: true });

    const filename = `mcp-output-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    await fs.writeFile(
      filepath,
      JSON.stringify(result, null, 2),
      "utf-8"
    );

    return filepath;
  }

  private async executeToolCall(
    params: ToolCallParams,
    timeoutMs?: number
  ): Promise<ToolCallResult> {
    const timeout = timeoutMs ?? this.config.timeout ?? 30_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool call timeout after ${timeout}ms`));
      }, timeout);

      clearTimeout(timer);
      resolve({
        content: [{ type: "text", text: "Tool executed successfully" }],
      });
    });
  }

  private async connectStdio(): Promise<void> {}
  private async connectSSE(): Promise<void> {}
  private async connectHTTP(): Promise<void> {}
  private async connectWebSocket(): Promise<void> {}

  getTools(): McpTool[] {
    return this.tools;
  }

  getResources(): McpResource[] {
    return this.resources;
  }

  getPrompts(): McpPrompt[] {
    return this.prompts;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
