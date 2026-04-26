import { EventEmitter } from 'node:events';
import type { Transport, TransportConfig, TransportMessage, TransportHandler } from '../transport/types.js';
import { createTransport } from '../transport/transport.js';
import {
  type RpcMessage,
  type RpcRequest,
  type RpcResponse,
  type RpcNotification,
  type RpcError,
  type BridgeCapabilities,
  type HandshakeRequest,
  type HandshakeResponse,
  RpcErrorCode,
  createRpcRequest,
  createRpcNotification,
  isRpcResponse,
} from './protocol.js';
import { z } from 'zod';

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export const BridgeClientOptionsSchema = z.object({
  transportConfig: z.any(),
  jwtToken: z.string().optional(),
  defaultTimeout: z.number().optional(),
  sessionId: z.string().optional(),
  autoHandshake: z.boolean().optional(),
});

export type BridgeClientOptions = z.infer<typeof BridgeClientOptionsSchema>;

export const DEFAULT_CLIENT_OPTIONS: Partial<BridgeClientOptions> = {
  defaultTimeout: 30000,
  autoHandshake: true,
};

export class BridgeClient extends EventEmitter {
  private transport: Transport | null = null;
  private pendingRequests = new Map<string, PendingRequest<unknown>>();
  private jwtToken: string | undefined;
  private sessionId: string | undefined;
  private defaultTimeout: number;
  private capabilities: BridgeCapabilities | null = null;
  private isConnected = false;

  constructor(options: BridgeClientOptions) {
    super();
    this.jwtToken = options.jwtToken;
    this.sessionId = options.sessionId;
    this.defaultTimeout = options.defaultTimeout ?? 30000;

    const handler: TransportHandler = {
      onMessage: (msg) => this.handleIncomingMessage(msg),
      onConnect: () => {
        this.isConnected = true;
        this.emit('connected');

        if (options.autoHandshake !== false) {
          this.handshake().catch((err) => this.emit('error', err));
        }
      },
      onDisconnect: () => {
        this.isConnected = false;
        this.rejectAllPending(new Error('Connection lost'));
        this.emit('disconnected');
      },
      onError: (err) => this.emit('error', err),
    };

    this.transport = createTransport(options.transportConfig, handler);
  }

  async connect(): Promise<void> {
    if (!this.transport) {
      throw new Error('Transport not initialized');
    }

    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    if (!this.transport) {
      return;
    }

    this.rejectAllPending(new Error('Client disconnected'));
    await this.transport.disconnect();
    this.isConnected = false;
  }

  async call<T>(method: string, params: unknown = undefined, timeout?: number): Promise<T> {
    if (!this.transport || !this.isConnected) {
      throw new Error('Not connected');
    }

    const id = crypto.randomUUID();
    const request: RpcRequest = createRpcRequest(method, params, this.jwtToken, this.sessionId);

    const payload = JSON.stringify(request);

    await this.transport.send({
      id,
      type: 'request',
      channel: 'bridge',
      payload,
      timestamp: new Date(),
    });

    return new Promise<T>((resolve, reject) => {
      const requestTimeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout ?? this.defaultTimeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: requestTimeout,
      });
    });
  }

  notify(method: string, params: unknown = undefined): void {
    if (!this.transport || !this.isConnected) {
      throw new Error('Not connected');
    }

    const notification: RpcNotification = createRpcNotification(method, params, this.sessionId);

    this.transport.send({
      id: `notif_${Date.now()}`,
      type: 'event',
      channel: 'bridge',
      payload: JSON.stringify(notification),
      timestamp: new Date(),
    }).catch((err) => this.emit('error', err));
  }

  async handshake(clientInfo?: Partial<HandshakeRequest>): Promise<HandshakeResponse> {
    const params: HandshakeRequest = {
      clientName: clientInfo?.clientName ?? 'OpenFlow Bridge Client',
      clientVersion: clientInfo?.clientVersion ?? '1.0.0',
      editorKind: clientInfo?.editorKind ?? 'unknown',
      requestedCapabilities: clientInfo?.requestedCapabilities ?? {},
    };

    const result = await this.call<HandshakeResponse>('handshake', params);
    this.sessionId = result.sessionId;
    this.capabilities = result.capabilities;

    this.emit('handshake', result);
    return result;
  }

  async ping(): Promise<{ pong: boolean; timestamp: number }> {
    return this.call('ping');
  }

  getCapabilities(): BridgeCapabilities | null {
    return this.capabilities;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  isConnectionAlive(): boolean {
    return this.isConnected;
  }

  private handleIncomingMessage(msg: TransportMessage): void {
    try {
      const payload = msg.payload;
      if (typeof payload !== 'string') return;

      const parsed = JSON.parse(payload) as RpcMessage;

      if (isRpcResponse(parsed)) {
        const pending = this.pendingRequests.get(parsed.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(parsed.id);

          if (parsed.error) {
            pending.reject(new BridgeRpcError(parsed.error));
          } else {
            pending.resolve(parsed.result);
          }
        }
      } else if (parsed.type === 'notification') {
        this.emit('notification', parsed);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private rejectAllPending(reason: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}

export class BridgeRpcError extends Error {
  public code: number;
  public data?: unknown;

  constructor(error: RpcError) {
    super(error.message);
    this.name = 'BridgeRpcError';
    this.code = error.code;
    this.data = error.data;
  }
}

export function createBridgeClient(options: BridgeClientOptions): BridgeClient {
  return new BridgeClient({
    ...DEFAULT_CLIENT_OPTIONS,
    ...options,
  });
}
