import { EventEmitter } from 'node:events';
import type { Transport, TransportMessage } from '../transport/types.js';
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
  DEFAULT_BRIDGE_CAPABILITIES,
  RpcErrorCode,
  createRpcResponse,
  createRpcNotification,
  isRpcRequest,
  isRpcResponse,
  isRpcNotification,
} from './protocol.js';
import { verifyJwt, type JwtVerifyOptions } from './jwt-auth.js';
import { SessionRunner, type SessionRunnerConfig } from './session-runner.js';
import { BoundedUUIDSet } from './bounded-set.js';
import { z } from 'zod';

export const BridgeDependenciesSchema = z.object({
  jwtSecret: z.string(),
  jwtOptions: z.any().optional(),
  sessionRunnerConfig: z.any().optional(),
  handlers: z.any().optional(),
  transportConfig: z.any(),
});

export const BridgeMainConfigSchema = z.object({
  dependencies: BridgeDependenciesSchema,
  maxMessageBytes: z.number().optional(),
  enableDebugLogging: z.boolean().optional(),
});

export const BridgeMetricsSchema = z.object({
  messagesReceived: z.number(),
  messagesSent: z.number(),
  authFailures: z.number(),
  errors: z.number(),
  averageLatencyMs: z.number(),
  activeSessions: z.number(),
});

export type BridgeDependencies = z.infer<typeof BridgeDependenciesSchema>;
export type BridgeMainConfig = z.infer<typeof BridgeMainConfigSchema>;
export type BridgeMetrics = z.infer<typeof BridgeMetricsSchema>;

export class BridgeMain extends EventEmitter {
  private transport: Transport | null = null;
  private sessionRunner: SessionRunner;
  private handlers: Map<string, (params: unknown, sessionId: string) => Promise<unknown>>;
  private jwtSecret: string;
  private jwtOptions: JwtVerifyOptions;
  private capabilities: BridgeCapabilities;
  private processedNotificationIds: BoundedUUIDSet;
  private maxMessageBytes: number;
  private enableDebugLogging: boolean;
  private isRunning = false;
  private totalLatency = 0;
  private messageCount = 0;
  private authFailures = 0;
  private errorCount = 0;
  private dependencies: BridgeDependencies;

  constructor(config: BridgeMainConfig) {
    super();
    this.dependencies = config.dependencies;
    this.jwtSecret = config.dependencies.jwtSecret;
    this.jwtOptions = {
      audience: 'openflow-bridge',
      algorithms: ['HS256'],
      clockTolerance: 60,
      ...config.dependencies.jwtOptions,
    };
    this.sessionRunner = new SessionRunner(config.dependencies.sessionRunnerConfig);
    this.handlers = config.dependencies.handlers ?? new Map();
    this.capabilities = { ...DEFAULT_BRIDGE_CAPABILITIES };
    this.processedNotificationIds = new BoundedUUIDSet(10000);
    this.maxMessageBytes = config.maxMessageBytes ?? 8 * 1024 * 1024;
    this.enableDebugLogging = config.enableDebugLogging ?? false;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bridge is already running');
    }

    this.transport = createTransport(
      this.dependencies.transportConfig,
      {
        onMessage: (msg) => this.handleIncomingMessage(msg),
        onConnect: () => { this.emit('connected'); },
        onDisconnect: () => { this.emit('disconnected'); },
        onError: (err) => this.emit('error', err),
      }
    );

    await this.transport.connect();
    this.isRunning = true;
    this.sessionRunner.startSweepTimer();

    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.sessionRunner.stopSweepTimer();
    await this.sessionRunner.shutdown();

    if (this.transport) {
      await this.transport.disconnect();
      this.transport = null;
    }

    this.emit('stopped');
  }

  registerHandler(method: string, handler: (params: unknown, sessionId: string) => Promise<unknown>): void {
    this.handlers.set(method, handler);
  }

  unregisterHandler(method: string): void {
    this.handlers.delete(method);
  }

  private async handleIncomingMessage(msg: TransportMessage): Promise<void> {
    const startTime = Date.now();

    try {
      const payload = msg.payload;

      if (typeof payload === 'string' && payload.length > this.maxMessageBytes) {
        await this.sendError(msg.id, RpcErrorCode.INVALID_REQUEST, 'message too large');
        return;
      }

      let rpcMsg: RpcMessage;
      try {
        if (typeof payload === 'string') {
          rpcMsg = JSON.parse(payload) as RpcMessage;
        } else {
          rpcMsg = payload as RpcMessage;
        }
      } catch {
        await this.sendError(msg.id, RpcErrorCode.PARSE_ERROR, 'invalid JSON');
        return;
      }

      if (isRpcRequest(rpcMsg)) {
        await this.handleRequest(rpcMsg);
      } else if (isRpcNotification(rpcMsg)) {
        await this.handleNotification(rpcMsg);
      } else if (isRpcResponse(rpcMsg)) {
        this.emit('response', rpcMsg);
      }

      const latency = Date.now() - startTime;
      this.totalLatency += latency;
      this.messageCount++;
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
    }
  }

  private async handleRequest(request: RpcRequest): Promise<void> {
    if (request.method === 'handshake') {
      await this.handleHandshake(request);
      return;
    }

    if (request.method === 'ping') {
      await this.sendResponse(request.id, { pong: true, timestamp: Date.now() });
      return;
    }

    if (!request.auth) {
      this.authFailures++;
      await this.sendError(request.id, RpcErrorCode.AUTH_MISSING, 'authentication required');
      return;
    }

    const authResult = verifyJwt(request.auth, this.jwtSecret, this.jwtOptions);
    if (!authResult.ok) {
      this.authFailures++;
      if (this.enableDebugLogging) {
        console.error(`[Bridge] Auth failed: ${authResult.reason}`);
      }
      await this.sendError(request.id, authResult.code, authResult.reason);
      return;
    }

    const sessionId = request.sessionId ?? authResult.claims.sub as string ?? 'default';
    this.sessionRunner.create(sessionId);

    const handler = this.handlers.get(request.method);
    if (!handler) {
      await this.sendError(request.id, RpcErrorCode.METHOD_NOT_FOUND, `method not found: ${request.method}`);
      return;
    }

    try {
      const result = await this.sessionRunner.executeInSession(sessionId, async () => {
        return handler(request.params, sessionId);
      });

      await this.sendResponse(request.id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.sendError(request.id, RpcErrorCode.INTERNAL_ERROR, message);
    }
  }

  private async handleHandshake(request: RpcRequest): Promise<void> {
    const params = request.params as HandshakeRequest | undefined;

    const response: HandshakeResponse = {
      serverName: 'OpenFlow Bridge',
      serverVersion: '1.0.0',
      capabilities: this.capabilities,
      sessionId: crypto.randomUUID(),
    };

    await this.sendResponse(request.id, response);
    this.emit('handshake', { clientInfo: params, serverInfo: response });
  }

  private async handleNotification(notification: RpcNotification): Promise<void> {
    if (notification.method === 'close') {
      const sessionId = notification.sessionId ?? 'default';
      this.sessionRunner.dispose(sessionId);
      this.emit('sessionClosed', { sessionId });
      return;
    }

    if (notification.method === 'progress') {
      this.emit('progress', notification.params);
      return;
    }

    this.emit('notification', notification);
  }

  private async sendResponse(id: string, result: unknown): Promise<void> {
    if (!this.transport) return;

    const response: RpcResponse = createRpcResponse(id, result);
    await this.transport.send({
      id: `resp_${id}`,
      type: 'response',
      channel: 'bridge',
      payload: JSON.stringify(response),
      timestamp: new Date(),
    });
  }

  private async sendError(id: string, code: number, message: string, data?: unknown): Promise<void> {
    if (!this.transport) return;

    const error: RpcError = { code, message, data };
    const response: RpcResponse = createRpcResponse(id, undefined, error);
    await this.transport.send({
      id: `err_${id}`,
      type: 'error',
      channel: 'bridge',
      payload: JSON.stringify(response),
      timestamp: new Date(),
    });
  }

  async sendNotification(method: string, params: unknown = undefined, sessionId?: string): Promise<void> {
    if (!this.transport) return;

    const notification: RpcNotification = { type: 'notification', method, params, sessionId };
    await this.transport.send({
      id: `notif_${Date.now()}`,
      type: 'event',
      channel: 'bridge',
      payload: JSON.stringify(notification),
      timestamp: new Date(),
    });
  }

  getMetrics(): BridgeMetrics {
    const sessionMetrics = this.sessionRunner.getMetrics();

    return {
      messagesReceived: this.messageCount,
      messagesSent: this.messageCount,
      authFailures: this.authFailures,
      errors: this.errorCount,
      averageLatencyMs: this.messageCount > 0 ? this.totalLatency / this.messageCount : 0,
      activeSessions: sessionMetrics.activeSessions,
    };
  }

  getSessionRunner(): SessionRunner {
    return this.sessionRunner;
  }

  getCapabilities(): BridgeCapabilities {
    return { ...this.capabilities };
  }
}
