import type {
  StdioConfig,
  TcpConfig,
  Transport,
  TransportConfig,
  TransportHandler,
  TransportMessage,
  TransportMetrics,
  WebSocketConfig,
} from './types.js';

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
  private stdinCallback?: (data: string) => void;
  private stdoutCallback?: (data: string) => void;
  private messageQueue: string[] = [];
  private processing = false;

  constructor(config: StdioConfig, handler: TransportHandler) {
    super(config, handler);
  }

  async connect(): Promise<void> {
    try {
      if (typeof process !== 'undefined' && process.stdin && process.stdout) {
        this.stdinCallback = (data: string) => {
          this.handleIncomingData(data);
        };
        this.stdoutCallback = (data: string) => {
          this.notifyMessage(this.parseMessage(data));
        };
      }
      this.notifyConnect();
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stdinCallback = undefined;
    this.stdoutCallback = undefined;
    this.messageQueue = [];
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Transport not connected');
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
        console.log(message);
      }
    }

    this.processing = false;
  }

  private handleIncomingData(data: string): void {
    try {
      const message = this.parseMessage(data);
      this.notifyMessage(message);
    } catch {
      this.notifyError(new Error('Failed to parse incoming message'));
    }
  }

  private parseMessage(data: string): TransportMessage {
    const parsed = JSON.parse(data);
    return {
      id: parsed.id || `msg_${Date.now()}`,
      type: parsed.type || 'event',
      channel: parsed.channel || 'default',
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export class WebSocketTransport extends BaseTransport {
  private ws?: WebSocket;
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
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyConnect();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = this.parseMessage(event.data);
          this.notifyMessage(message);
        } catch {
          this.notifyError(new Error('Failed to parse WebSocket message'));
        }
      };

      this.ws.onerror = (event) => {
        this.notifyError(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        this.notifyDisconnect();
        this.attemptReconnect();
      };

      await new Promise<void>((resolve, reject) => {
        if (this.ws) {
          this.ws.onopen = () => {
            this.notifyConnect();
            resolve();
          };
          this.ws.onerror = (event) => {
            reject(new Error('WebSocket connection failed'));
          };
        } else {
          reject(new Error('WebSocket not initialized'));
        }
      });
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.reconnectAttempts = this.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    try {
      const data = JSON.stringify(message);
      this.ws.send(data);
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

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));

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
      type: parsed.type || 'event',
      channel: parsed.channel || 'default',
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export class TcpTransport extends BaseTransport {
  private socket?: import('net').Socket;
  private host: string;
  private port: number;

  constructor(config: TcpConfig, handler: TransportHandler) {
    super(config, handler);
    this.host = config.host || 'localhost';
    this.port = config.port || 8080;
  }

  async connect(): Promise<void> {
    try {
      const net = await import('net');
      this.socket = net.createConnection({
        host: this.host,
        port: this.port,
        keepAlive: true,
      });

      this.socket.on('connect', () => {
        this.notifyConnect();
      });

      this.socket.on('data', (data) => {
        const message = this.parseMessage(data.toString());
        this.notifyMessage(message);
      });

      this.socket.on('error', (error) => {
        this.notifyError(error);
      });

      this.socket.on('close', () => {
        this.notifyDisconnect();
      });

      await new Promise<void>((resolve, reject) => {
        if (this.socket) {
          this.socket.on('connect', () => resolve());
          this.socket.on('error', (error) => reject(error));
        } else {
          reject(new Error('Socket not initialized'));
        }
      });
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end();
      this.socket = undefined;
    }
    this.notifyDisconnect();
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.socket) {
      throw new Error('TCP socket not connected');
    }

    try {
      const data = JSON.stringify(message) + '\n';
      this.socket.write(data);
      this.metrics.messagesSent++;
      this.metrics.bytesSent += data.length;
    } catch (error) {
      this.notifyError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private parseMessage(data: string): TransportMessage {
    const lines = data.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const parsed = JSON.parse(lastLine);
    return {
      id: parsed.id || `msg_${Date.now()}`,
      type: parsed.type || 'event',
      channel: parsed.channel || 'default',
      payload: parsed.payload,
      timestamp: new Date(parsed.timestamp || Date.now()),
      metadata: parsed.metadata,
    };
  }
}

export function createTransport(config: TransportConfig, handler: TransportHandler): Transport {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport(config as StdioConfig, handler);
    case 'websocket':
      return new WebSocketTransport(config as WebSocketConfig, handler);
    case 'tcp':
      return new TcpTransport(config as TcpConfig, handler);
    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}
