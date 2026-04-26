import { z } from "zod";

export const RpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type RpcError = z.infer<typeof RpcErrorSchema>;

export const RpcRequestSchema = z.object({
  type: z.literal("request"),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
  auth: z.string().optional(),
  sessionId: z.string().optional(),
});

export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RpcResponseSchema = z.object({
  type: z.literal("response"),
  id: z.string(),
  result: z.unknown().optional(),
  error: RpcErrorSchema.optional(),
});

export type RpcResponse = z.infer<typeof RpcResponseSchema>;

export const RpcNotificationSchema = z.object({
  type: z.literal("notification"),
  method: z.string(),
  params: z.unknown().optional(),
  sessionId: z.string().optional(),
});

export type RpcNotification = z.infer<typeof RpcNotificationSchema>;

export const RpcMessageSchema = z.discriminatedUnion("type", [
  RpcRequestSchema,
  RpcResponseSchema,
  RpcNotificationSchema,
]);

export type RpcMessage = z.infer<typeof RpcMessageSchema>;

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
    type: "request",
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
    type: "response",
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
    type: "notification",
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
    typeof msg === "object" &&
    msg !== null &&
    (msg as any).type === "request" &&
    typeof (msg as any).method === "string"
  );
}

export function isRpcResponse(msg: unknown): msg is RpcResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as any).type === "response" &&
    typeof (msg as any).id === "string"
  );
}

export function isRpcNotification(msg: unknown): msg is RpcNotification {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as any).type === "notification" &&
    typeof (msg as any).method === "string" &&
    !(msg as any).id
  );
}

export const BridgeCapabilitiesSchema = z.object({
  maxMessageBytes: z.number(),
  supportsProgress: z.boolean(),
  supportedMethods: z.array(z.string()),
  protocolVersion: z.string(),
  editorKinds: z.array(z.string()),
});

export type BridgeCapabilities = z.infer<typeof BridgeCapabilitiesSchema>;

export const DEFAULT_BRIDGE_CAPABILITIES: BridgeCapabilities = {
  maxMessageBytes: 8 * 1024 * 1024,
  supportsProgress: true,
  supportedMethods: [
    "ping",
    "handshake",
    "runTool",
    "openFile",
    "subscribe",
    "unsubscribe",
  ],
  protocolVersion: "1.0.0",
  editorKinds: ["vscode", "cursor", "jetbrains"],
};

export const HandshakeRequestSchema = z.object({
  clientName: z.string(),
  clientVersion: z.string(),
  editorKind: z.string(),
  requestedCapabilities: BridgeCapabilitiesSchema.partial(),
});

export type HandshakeRequest = z.infer<typeof HandshakeRequestSchema>;

export const HandshakeResponseSchema = z.object({
  serverName: z.string(),
  serverVersion: z.string(),
  capabilities: BridgeCapabilitiesSchema,
  sessionId: z.string(),
});

export type HandshakeResponse = z.infer<typeof HandshakeResponseSchema>;
