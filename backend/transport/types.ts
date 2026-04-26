import { z } from "zod";

export const TransportTypeSchema = z.enum(["stdio", "websocket", "tcp", "http"]);

export type TransportType = z.infer<typeof TransportTypeSchema>;

export const TransportMessageSchema = z.object({
  id: z.string(),
  type: z.enum(["request", "response", "event", "error"]),
  channel: z.string(),
  payload: z.unknown(),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TransportMessage = z.infer<typeof TransportMessageSchema>;

export const TransportMetricsSchema = z.object({
  messagesSent: z.number(),
  messagesReceived: z.number(),
  bytesSent: z.number(),
  bytesReceived: z.number(),
  errors: z.number(),
  reconnectCount: z.number(),
  latency: z.number(),
});

export type TransportMetrics = z.infer<typeof TransportMetricsSchema>;

export const TransportConfigSchema = z.object({
  type: TransportTypeSchema,
  host: z.string().optional(),
  port: z.number().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  timeout: z.number().optional(),
});

export type TransportConfig = z.infer<typeof TransportConfigSchema>;

export const StdioConfigSchema = TransportConfigSchema.extend({
  type: z.literal("stdio"),
  encoding: z.enum(["utf-8", "base64"]).optional(),
});

export type StdioConfig = z.infer<typeof StdioConfigSchema>;

export const WebSocketConfigSchema = TransportConfigSchema.extend({
  type: z.literal("websocket"),
  url: z.string(),
  protocols: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>;

export const TcpConfigSchema = TransportConfigSchema.extend({
  type: z.literal("tcp"),
  host: z.string(),
  port: z.number(),
  keepAlive: z.boolean().optional(),
});

export type TcpConfig = z.infer<typeof TcpConfigSchema>;

export const HttpConfigSchema = TransportConfigSchema.extend({
  type: z.literal("http"),
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type HttpConfig = z.infer<typeof HttpConfigSchema>;

export interface TransportHandler {
  onMessage?: (msg: TransportMessage) => void | Promise<void>;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onError?: (err: Error) => void;
}

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(msg: TransportMessage): Promise<void>;
  subscribe(channel: string): void;
  unsubscribe(channel: string): void;
  isConnected(): boolean;
  getMetrics(): TransportMetrics;
}
