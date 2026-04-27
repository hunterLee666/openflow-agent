import type {
  StdioConfig,
  TcpConfig,
  Transport,
  TransportConfig,
  TransportHandler,
  TransportMessage,
  TransportMetrics,
  WebSocketConfig,
} from "./types.js";

export abstract class BaseTransport implements Transport {
  protected config: TransportConfig;
  protected handler: TransportHandler;
  protected connected = false;
  protected channels: Set<string> = new Set();
  protected metrics: TransportMetrics;

  constructor(config: TransportConfig, handler: TransportHandler) {
    this.config = config;
    this.handler = handler;
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      errors: 0,
      reconnectCount: 0,
      latency: 0,
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: TransportMessage): Promise<void>;

  subscribe(channel: string): void {
    this.channels.add(channel);
  }

  unsubscribe(channel: string): void {
    this.channels.delete(channel);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getMetrics(): TransportMetrics {
    return { ...this.metrics };
  }

  protected notifyMessage(message: TransportMessage): void {
    this.metrics.messagesReceived++;
    this.metrics.bytesReceived += JSON.stringify(message.payload).length;
    this.handler.onMessage?.(message);
  }

  protected notifyConnect(): void {
    this.connected = true;
    this.handler.onConnect?.();
  }

  protected notifyDisconnect(): void {
    this.connected = false;
    this.handler.onDisconnect?.();
  }

  protected notifyError(error: Error): void {
    this.metrics.errors++;
    this.handler.onError?.(error);
  }
}

export class StdioTransport extends BaseTransport {
  private messageQueue: string[] = [];
  private processing = false;
  private dataHandler: ((data: Buffer) => void) | null = null;

  constructor(config: StdioConfig, handler: TransportHandler) {
    super(config, handler);
  }

  async connect(): Promise<void> {
    try {
      if (typeof process !== "undefined" && process.stdin && process.stdout) {
        process.stdin.setEncoding("utf8");

        this.dataHandler = (data: Buffer) => {
          this.handleIncomingData(data.toString());
        };

        process.stdin.on("data", this.dataHandler);
      }
      this.notifyConnect();
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.dataHandler && process.stdin) {
      process.stdin.off("data", this.dataHandler);
    }
    this.dataHandler = null;
    this.messageQueue = [];
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.connected) {
      throw new Error("Transport not connected");
    }

    try {
      const data = JSON.stringify(message);
      this.messageQueue.push(data);
      this.metrics.messagesSent++;
      this.metrics.bytesSent += data.length;
      await this.flushQueue();
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        process.stdout.write(message + "\n");
      }
    }

    this.processing = false;
  }

  private handleIncomingData(data: string): void {
    const lines = data.trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = this.parseMessage(line);
          this.notifyMessage(message);
        } catch {
          this.notifyError(new Error("Failed to parse incoming message"));
        }
      }
    }
  }

  private parseMessage(data: string): TransportMessage {
    const parsed = JSON.parse(data);
    return {
      id: parsed.id || `msg_${Date.now()}`,
      type: parsed.type || "event",
      channel: parsed.channel || "default",
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export class WebSocketTransport extends BaseTransport {
  private ws: unknown;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private url: string;

  constructor(config: WebSocketConfig, handler: TransportHandler) {
    super(config, handler);
    this.url = config.url;
  }

  async connect(): Promise<void> {
    try {
      const WebSocketModule = await import("ws");
      const WebSocket = WebSocketModule.default || WebSocketModule;
      this.ws = new WebSocket(this.url);

      await new Promise<void>((resolve, reject) => {
        const ws = this.ws as {
          on: (event: string, cb: (...args: unknown[]) => void) => void;
          readyState: number;
          send: (data: string) => void;
          close: () => void;
        };

        ws.on("open", () => {
          this.reconnectAttempts = 0;
          this.notifyConnect();
          resolve();
        });

        ws.on("message", (...args: unknown[]) => {
          try {
            const data = args[0] as Buffer;
            const message = this.parseMessage(data.toString());
            this.notifyMessage(message);
          } catch {
            this.notifyError(new Error("Failed to parse WebSocket message"));
          }
        });

        ws.on("error", (...args: unknown[]) => {
          this.notifyError(new Error("WebSocket error"));
        });

        ws.on("close", () => {
          this.notifyDisconnect();
          this.attemptReconnect();
        });

        ws.on("error", (...args: unknown[]) => {
          reject(new Error("WebSocket connection failed"));
        });
      });
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      const ws = this.ws as { close: () => void };
      ws.close();
      this.ws = undefined;
    }
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.ws) {
      throw new Error("WebSocket not connected");
    }

    const ws = this.ws as { readyState: number; send: (data: string) => void };
    if (ws.readyState !== 1) {
      throw new Error("WebSocket not connected");
    }

    try {
      const data = JSON.stringify(message);
      ws.send(data);
      this.metrics.messagesSent++;
      this.metrics.bytesSent += data.length;
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    this.metrics.reconnectCount++;

    await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));

    try {
      await this.connect();
    } catch {
      this.attemptReconnect();
    }
  }

  private parseMessage(data: string): TransportMessage {
    const parsed = JSON.parse(data);
    return {
      id: parsed.id || `msg_${Date.now()}`,
      type: parsed.type || "event",
      channel: parsed.channel || "default",
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export class WebSocketServerTransport extends BaseTransport {
  private server: any;
  private connections: Map<string, any> = new Map();

  constructor(config: WebSocketConfig, handler: TransportHandler) {
    super(config, handler);
  }

  async connect(): Promise<void> {
    try {
      const WebSocketModule = await import("ws");
      const WebSocketServer = (WebSocketModule as any).WebSocketServer;

      const port = (this.config as any).port || 8765;

      this.server = new WebSocketServer({ port });

      this.server.on("connection", (ws: any) => {
        const connectionId = crypto.randomUUID();
        this.connections.set(connectionId, ws);

        this.notifyConnect();

        ws.on("message", (data: Buffer) => {
          try {
            const message = this.parseMessage(data.toString());
            this.notifyMessage(message);
          } catch {
            this.notifyError(new Error("Failed to parse WebSocket message"));
          }
        });

        ws.on("close", () => {
          this.connections.delete(connectionId);
          if (this.connections.size === 0) {
            this.notifyDisconnect();
          }
        });

        ws.on("error", (error: Error) => {
          this.notifyError(error);
        });
      });

      this.server.on("error", (error: Error) => {
        this.notifyError(error);
      });

      await new Promise<void>((resolve) => {
        this.server.on("listening", () => {
          resolve();
        });
      });
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.connections.clear();
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.connected || this.connections.size === 0) {
      throw new Error("No WebSocket connections");
    }

    try {
      const data = JSON.stringify(message);
      for (const ws of this.connections.values()) {
        if (ws.readyState === 1) {
          ws.send(data);
        }
      }
      this.metrics.messagesSent++;
      this.metrics.bytesSent += data.length;
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private parseMessage(data: string): TransportMessage {
    const parsed = JSON.parse(data);
    return {
      id: parsed.id || `msg_${Date.now()}`,
      type: parsed.type || "event",
      channel: parsed.channel || "default",
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export class TcpTransport extends BaseTransport {
  private socket: import("net").Socket | null = null;
  private host: string;
  private port: number;

  constructor(config: TcpConfig, handler: TransportHandler) {
    super(config, handler);
    this.host = config.host || "localhost";
    this.port = config.port || 8080;
  }

  async connect(): Promise<void> {
    try {
      const net = await import("net");
      this.socket = net.createConnection({
        host: this.host,
        port: this.port,
        keepAlive: true,
      });

      await new Promise<void>((resolve, reject) => {
        if (!this.socket) {
          reject(new Error("Socket not initialized"));
          return;
        }

        this.socket!.on("connect", () => {
          this.notifyConnect();
          resolve();
        });

        this.socket!.on("data", (data: Buffer) => {
          const message = this.parseMessage(data.toString());
          this.notifyMessage(message);
        });

        this.socket!.on("error", (error: Error) => {
          this.notifyError(error);
        });

        this.socket!.on("close", () => {
          this.notifyDisconnect();
        });

        this.socket!.on("error", (error: Error) => {
          reject(error);
        });
      });
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.socket) {
      throw new Error("TCP socket not connected");
    }

    try {
      const data = JSON.stringify(message) + "\n";
      this.socket.write(data);
      this.metrics.messagesSent++;
      this.metrics.bytesSent += data.length;
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private parseMessage(data: string): TransportMessage {
    const lines = data.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const parsed = JSON.parse(lastLine);
    return {
      id: parsed.id || `msg_${Date.now()}`,
      type: parsed.type || "event",
      channel: parsed.channel || "default",
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export function createTransport(config: TransportConfig, handler: TransportHandler): Transport {
  switch (config.type) {
    case "stdio":
      return new StdioTransport(config as StdioConfig, handler);
    case "websocket":
      if ((config as any).port) {
        return new WebSocketServerTransport(config as WebSocketConfig, handler);
      }
      return new WebSocketTransport(config as WebSocketConfig, handler);
    case "tcp":
      return new TcpTransport(config as TcpConfig, handler);
    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}
