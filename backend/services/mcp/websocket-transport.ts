import { EventEmitter } from 'events';
import type { McpMessage, McpRequest, McpResponse, McpNotification } from './protocol.js';

export interface WebSocketTransportConfig {
  url?: string;
  port?: number;
  host?: string;
  onMessage?: (message: McpMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
}

export class WebSocketTransport extends EventEmitter {
  private ws: WebSocketLike | null = null;
  private config: WebSocketTransportConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private messageQueue: string[] = [];
  private connected = false;

  constructor(config: WebSocketTransportConfig) {
    super();
    this.config = config;
  }

  async connect(url?: string): Promise<void> {
    const wsUrl = url || this.config.url;

    if (!wsUrl) {
      throw new Error('WebSocket URL must be provided');
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = this.createWebSocket(wsUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.flushMessageQueue();
          this.config.onConnect?.();
          resolve();
        });

        this.ws.on('error', (error: unknown) => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.config.onError?.(err);
          reject(err);
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.config.onDisconnect?.();
          this.attemptReconnect();
        });

        this.ws.on('message', (data: unknown) => {
          try {
            const message = typeof data === 'string' ? data : String(data);
            const parsed = this.parseJsonRpcMessage(message);
            if (parsed) {
              this.emit('message', parsed);
              this.config.onMessage?.(parsed);
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private createWebSocket(url: string): WebSocketLike {
    if (typeof WebSocket !== 'undefined') {
      return new WebSocket(url) as unknown as WebSocketLike;
    }
    throw new Error('WebSocket is not available in this environment');
  }

  private parseJsonRpcMessage(message: string): McpMessage | null {
    try {
      const parsed = JSON.parse(message);
      if (parsed && parsed.jsonrpc === '2.0') {
        return parsed as McpMessage;
      }
      return null;
    } catch {
      return null;
    }
  }

  async send(message: McpMessage): Promise<void> {
    const serialized = JSON.stringify(message);

    if (this.connected && this.ws?.readyState === 1) {
      this.ws.send(serialized);
    } else {
      this.messageQueue.push(serialized);
    }
  }

  async sendRequest(request: McpRequest): Promise<McpResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request ${request.id} timed out`));
      }, 30000);

      this.send(request).then(() => {
        this.once(`response:${String(request.id)}`, (response: unknown) => {
          clearTimeout(timeout);
          resolve(response as McpResponse);
        });
      }).catch(reject);
    });
  }

  async sendNotification(notification: McpNotification): Promise<void> {
    await this.send(notification);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.connected) {
      const message = this.messageQueue.shift();
      if (message && this.ws?.readyState === 1) {
        this.ws.send(message);
      }
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      if (this.config.url) {
        this.connect(this.config.url).catch(() => {
          this.attemptReconnect();
        });
      }
    }, delay);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  handleResponse(response: McpResponse): void {
    if (response.id !== null) {
      this.emit(`response:${String(response.id)}`, response);
    }
  }
}

export function createWebSocketTransport(
  config: WebSocketTransportConfig
): WebSocketTransport {
  return new WebSocketTransport(config);
}
