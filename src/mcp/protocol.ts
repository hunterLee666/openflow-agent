export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, never>;
}

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

export interface McpRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type McpMessage = McpRequest | McpResponse | McpNotification;

export interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  } | {
    type: "image";
    data: string;
    mimeType: string;
  }>;
  isError?: boolean;
}

export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
} as const;

export function createErrorResponse(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown
): McpResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

export function createSuccessResponse(
  id: number | string | null,
  result: Record<string, unknown>
): McpResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function isMcpRequest(msg: unknown): msg is McpRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    (msg as Record<string, unknown>).jsonrpc === "2.0" &&
    "method" in msg
  );
}

export function isMcpResponse(msg: unknown): msg is McpResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    (msg as Record<string, unknown>).jsonrpc === "2.0" &&
    ("result" in msg || "error" in msg)
  );
}

export function parseJsonRpcMessage(raw: string): McpMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.jsonrpc === "2.0") {
      return parsed as McpMessage;
    }
    return null;
  } catch {
    return null;
  }
}
