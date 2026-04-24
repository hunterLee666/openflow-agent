export interface BridgeConfig {
  dir: string;
  machineName: string;
  branch: string;
  maxSessions: number;
  spawnMode: 'single-session' | 'worktree' | 'same-dir';
  sandbox: boolean;
  bridgeId: string;
  environmentId: string;
  sessionTimeoutMs?: number;
}

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(msg: BridgeMessage): Promise<void>;
  onMessage(handler: (msg: BridgeMessage) => void): void;
}

export interface BackoffConfig {
  connInitialMs: number;
  connCapMs: number;
  connGiveUpMs: number;
  generalInitialMs: number;
  generalCapMs: number;
  generalGiveUpMs: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  connInitialMs: 2_000,
  connCapMs: 120_000,
  connGiveUpMs: 600_000,
  generalInitialMs: 500,
  generalCapMs: 30_000,
  generalGiveUpMs: 600_000,
};

export interface BridgeSession {
  id: string;
  environmentId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: number;
  messageCount: number;
}

export interface BridgeMessage {
  id: string;
  type: 'command' | 'response' | 'heartbeat' | 'error';
  payload: unknown;
  timestamp: number;
  sessionId: string;
}

export interface BridgeApiClient {
  connect(environmentId: string, secret: string): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(message: BridgeMessage): Promise<void>;
  receiveMessage(): Promise<BridgeMessage | null>;
  isConnected(): boolean;
}

export interface SessionSpawner {
  spawn(sessionId: string, config: BridgeConfig): Promise<BridgeSession>;
  kill(sessionId: string): Promise<void>;
  list(): BridgeSession[];
}

export interface BridgeLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export type BridgeEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'disconnected'; sessionId: string; reason: string }
  | { type: 'message'; sessionId: string; message: BridgeMessage }
  | { type: 'error'; sessionId: string; error: Error }
  | { type: 'reconnecting'; sessionId: string; attempt: number; delayMs: number }
  | { type: 'session_created'; session: BridgeSession }
  | { type: 'session_ended'; sessionId: string };
