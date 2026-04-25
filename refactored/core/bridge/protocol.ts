export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RpcRequest {
  type: 'request';
  id: string;
  method: string;
  params?: unknown;
  auth?: string;
  sessionId?: string;
}

export interface RpcResponse {
  type: 'response';
  id: string;
  result?: unknown;
  error?: RpcError;
}

export interface RpcNotification {
  type: 'notification';
  method: string;
  params?: unknown;
  sessionId?: string;
}

export type RpcMessage = RpcRequest | RpcResponse | RpcNotification;

export const RpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  AUTH_EXPIRED: 40101,
  AUTH_INVALID_SIGNATURE: 40102,
  AUTH_INVALID_AUDIENCE: 40103,
  AUTH_MISSING: 40104,

  SESSION_NOT_FOUND: 41001,
  SESSION_EXPIRED: 41002,
  SESSION_CLOSED: 41003,

  METHOD_PARAMS_INVALID: 42001,
  METHOD_PERMISSION_DENIED: 42002,

  BUSINESS_UNAVAILABLE: 43001,
} as const;

export function createRpcRequest(
  method: string,
  params: unknown = undefined,
  auth?: string,
  sessionId?: string
): RpcRequest {
  return {
    type: 'request',
    id: crypto.randomUUID(),
    method,
    params,
    auth,
    sessionId,
  };
}

export function createRpcResponse(
  id: string,
  result?: unknown,
  error?: RpcError
): RpcResponse {
  return {
    type: 'response',
    id,
    result,
    error,
  };
}

export function createRpcNotification(
  method: string,
  params: unknown = undefined,
  sessionId?: string
): RpcNotification {
  return {
    type: 'notification',
    method,
    params,
    sessionId,
  };
}

export function createRpcError(
  code: number,
  message: string,
  data?: unknown
): RpcError {
  return { code, message, data };
}

export function isRpcRequest(msg: unknown): msg is RpcRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as any).type === 'request' &&
    typeof (msg as any).method === 'string'
  );
}

export function isRpcResponse(msg: unknown): msg is RpcResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as any).type === 'response' &&
    typeof (msg as any).id === 'string'
  );
}

export function isRpcNotification(msg: unknown): msg is RpcNotification {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as any).type === 'notification' &&
    typeof (msg as any).method === 'string' &&
    !(msg as any).id
  );
}

export interface BridgeCapabilities {
  maxMessageBytes: number;
  supportsProgress: boolean;
  supportedMethods: string[];
  protocolVersion: string;
  editorKinds: string[];
}

export const DEFAULT_BRIDGE_CAPABILITIES: BridgeCapabilities = {
  maxMessageBytes: 8 * 1024 * 1024,
  supportsProgress: true,
  supportedMethods: [
    'ping',
    'handshake',
    'runTool',
    'openFile',
    'subscribe',
    'unsubscribe',
  ],
  protocolVersion: '1.0.0',
  editorKinds: ['vscode', 'cursor', 'jetbrains'],
};

export interface HandshakeRequest {
  clientName: string;
  clientVersion: string;
  editorKind: string;
  requestedCapabilities: Partial<BridgeCapabilities>;
}

export interface HandshakeResponse {
  serverName: string;
  serverVersion: string;
  capabilities: BridgeCapabilities;
  sessionId: string;
}
