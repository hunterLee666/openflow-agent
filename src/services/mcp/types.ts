export interface MCPServerConnection {
  name: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  serverInfo?: {
    name: string;
    version: string;
  };
  capabilities?: ServerCapabilities;
  tools?: MCPTool[];
  resources?: MCPResource[];
}

export interface ServerCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPNotification {
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPRequest {
  method: string;
  id: string | number;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export type MCPMessage =
  | { type: "request"; request: MCPRequest }
  | { type: "response"; response: MCPResponse }
  | { type: "notification"; notification: MCPNotification };
