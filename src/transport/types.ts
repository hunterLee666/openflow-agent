export type TransportType = "stdio" | "websocket" | "tcp" | "http";

export interface TransportConfig {
  type: TransportType;
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
  timeout?: number;
}

export interface TransportMessage {
  id: string;
  type: "request" | "response" | "event" | "error";
  channel: string;
  payload: unknown;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface TransportHandler {
  onMessage?: (message: TransportMessage) => void | Promise<void>;
  onConnect?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: TransportMessage): Promise<void>;
  subscribe(channel: string): void;
  unsubscribe(channel: string): void;
  isConnected(): boolean;
  getMetrics(): TransportMetrics;
}

export interface StdioConfig extends TransportConfig {
  type: "stdio";
  encoding?: "utf-8" | "base64";
}

export interface WebSocketConfig extends TransportConfig {
  type: "websocket";
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
}

export interface TcpConfig extends TransportConfig {
  type: "tcp";
  host: string;
  port: number;
  keepAlive?: boolean;
}

export interface HttpConfig extends TransportConfig {
  type: "http";
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
}

export interface TransportMetrics {
  messagesSent: number;
  messagesReceived: number;
  bytesSent: number;
  bytesReceived: number;
  errors: number;
  reconnectCount: number;
  latency: number;
}
