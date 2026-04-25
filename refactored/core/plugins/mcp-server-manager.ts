import type { McpComponent } from "./plugin-types.js";
import { EventEmitter } from "node:events";
import { spawn, ChildProcess } from "node:child_process";

export interface McpServerConnection {
  name: string;
  process: ChildProcess | null;
  status: "connecting" | "connected" | "disconnected" | "error";
  tools: McpToolDefinition[];
  resources: McpResourceDefinition[];
  lastError?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export class McpServerManager extends EventEmitter {
  private connections: Map<string, McpServerConnection> = new Map();

  async startServer(component: McpComponent): Promise<McpServerConnection> {
    const existing = this.connections.get(component.name);
    if (existing && existing.status === "connected") {
      return existing;
    }

    const connection: McpServerConnection = {
      name: component.name,
      process: null,
      status: "connecting",
      tools: [],
      resources: [],
    };

    this.connections.set(component.name, connection);

    try {
      const env = {
        ...process.env,
        ...(component.config.env || {}),
      };

      const child = spawn(component.config.command, component.config.args, {
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });

      connection.process = child;

      child.on("error", (error) => {
        connection.status = "error";
        connection.lastError = error.message;
        this.emit("mcp:error", { name: component.name, error });
      });

      child.on("close", (code) => {
        connection.status = "disconnected";
        this.emit("mcp:close", { name: component.name, code });
      });

      if (component.config.transport === "stdio") {
        await this.initializeStdioConnection(connection, child, component.config.timeout || 30000);
      } else if (component.config.transport === "sse" || component.config.transport === "http") {
        await this.initializeHttpConnection(connection, component);
      }

      connection.status = "connected";
      this.emit("mcp:connected", { name: component.name });

      return connection;
    } catch (error) {
      connection.status = "error";
      connection.lastError = (error as Error).message;
      this.emit("mcp:error", { name: component.name, error });
      throw error;
    }
  }

  private async initializeStdioConnection(
    connection: McpServerConnection,
    child: ChildProcess,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`MCP server connection timeout: ${connection.name}`));
      }, timeout);

      let buffer = "";

      child.stdout?.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this.handleMcpMessage(connection, message);
            } catch {
              // Ignore non-JSON messages
            }
          }
        }
      });

      child.stderr?.on("data", (data) => {
        console.error(`MCP ${connection.name} stderr:`, data.toString());
      });

      const initMessage = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "openflow", version: "1.0.0" },
        },
      });

      child.stdin?.write(initMessage + "\n");

      const initializedMessage = JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      child.stdin?.write(initializedMessage + "\n");

      setTimeout(() => {
        clearTimeout(timeoutId);
        resolve();
      }, 2000);
    });
  }

  private async initializeHttpConnection(
    connection: McpServerConnection,
    component: McpComponent
  ): Promise<void> {
    const baseUrl = component.config.args[0] || "";
    if (!baseUrl) {
      throw new Error("HTTP MCP server requires a URL argument");
    }

    try {
      const response = await fetch(`${baseUrl}/tools`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        connection.tools = data.tools || [];
        connection.resources = data.resources || [];
      }
    } catch (error) {
      console.warn(`Failed to initialize HTTP MCP server: ${connection.name}`, error);
    }
  }

  private handleMcpMessage(connection: McpServerConnection, message: Record<string, unknown>): void {
    if (message.result && typeof message.result === "object") {
      const result = message.result as Record<string, unknown>;

      if (result.tools && Array.isArray(result.tools)) {
        connection.tools = result.tools as McpToolDefinition[];
      }

      if (result.resources && Array.isArray(result.resources)) {
        connection.resources = result.resources as McpResourceDefinition[];
      }
    }
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const connection = this.connections.get(serverName);
    if (!connection || connection.status !== "connected") {
      throw new Error(`MCP server not connected: ${serverName}`);
    }

    if (!connection.process) {
      throw new Error(`MCP server process not available: ${serverName}`);
    }

    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const message = JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      });

      const timeoutId = setTimeout(() => {
        reject(new Error(`MCP tool call timeout: ${serverName}/${toolName}`));
      }, 30000);

      const onData = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split("\n");

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === requestId) {
                connection.process?.stdout?.removeListener("data", onData);
                clearTimeout(timeoutId);

                if (response.error) {
                  reject(new Error((response.error as Record<string, unknown>).message as string || "MCP tool call failed"));
                } else {
                  resolve(response.result);
                }
              }
            } catch {
              // Ignore non-JSON messages
            }
          }
        }
      };

      connection.process?.stdout?.on("data", onData);
      connection.process?.stdin?.write(message + "\n");
    });
  }

  async stopServer(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) return;

    if (connection.process) {
      connection.process.kill("SIGTERM");
      connection.process = null;
    }

    connection.status = "disconnected";
    this.connections.delete(serverName);
    this.emit("mcp:disconnected", { name: serverName });
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map((name) => this.stopServer(name));
    await Promise.all(promises);
  }

  getConnection(serverName: string): McpServerConnection | undefined {
    return this.connections.get(serverName);
  }

  getAllConnections(): Map<string, McpServerConnection> {
    return new Map(this.connections);
  }

  getTools(serverName: string): McpToolDefinition[] {
    const connection = this.connections.get(serverName);
    return connection?.tools || [];
  }

  getResources(serverName: string): McpResourceDefinition[] {
    const connection = this.connections.get(serverName);
    return connection?.resources || [];
  }
}
