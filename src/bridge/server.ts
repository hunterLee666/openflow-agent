import { createServer, type Server, type Socket } from "node:net";
import { createHash } from "node:crypto";
import type { BridgeServer, BridgeMessage } from "./types.js";
import { BackoffController, DEFAULT_BACKOFF } from "../utils/backoff.js";
import { CapacityManager, createCapacityWake } from "../utils/capacityWake.js";
import { TokenRefreshScheduler } from "../utils/tokenRefresh.js";
import { getOrCreateWorktree, removeWorktree, type WorktreeInfo } from "../utils/worktree.js";

export interface BridgeServerConfig {
  port?: number;
  maxSessions?: number;
  maxReconnectAttempts?: number;
  backoffConfig?: Partial<typeof DEFAULT_BACKOFF>;
  enableWorktree?: boolean;
  worktreePrefix?: string;
}

export interface SessionInfo {
  id: string;
  worktree?: WorktreeInfo;
  createdAt: number;
}

export class JsonRpcBridgeServer implements BridgeServer {
  private server?: Server;
  private sockets = new Set<Socket>();
  private handlers: ((msg: BridgeMessage) => void)[] = [];
  private buffer = "";
  private backoff: BackoffController;
  private capacity: CapacityManager;
  private tokenScheduler: TokenRefreshScheduler;
  private sessionCount = 0;
  private config: Required<BridgeServerConfig>;
  private abortController?: AbortController;
  private sessions = new Map<string, SessionInfo>();
  private worktrees = new Map<string, WorktreeInfo>();

  constructor(config: BridgeServerConfig = {}) {
    this.config = {
      port: config.port ?? 8080,
      maxSessions: config.maxSessions ?? 10,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      backoffConfig: { ...DEFAULT_BACKOFF, ...config.backoffConfig },
      enableWorktree: config.enableWorktree ?? false,
      worktreePrefix: config.worktreePrefix ?? 'bridge',
    };
    this.backoff = new BackoffController(this.config.backoffConfig);
    this.capacity = new CapacityManager(this.config.maxSessions);
    this.tokenScheduler = new TokenRefreshScheduler();
    this.abortController = new AbortController();
  }

  async start(port?: number): Promise<void> {
    const listenPort = port ?? this.config.port;

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.sockets.add(socket);
        socket.on("data", (data) => {
          this.handleData(data.toString());
        });
        socket.on("close", () => {
          this.sockets.delete(socket);
        });
        socket.on("error", (error) => {
          const delay = this.backoff.recordGeneralError();
          if (delay > 0) {
            console.log(`Socket error, backing off for ${delay}ms`);
          } else if (this.backoff.shouldGiveUp(false)) {
            console.error('Max reconnect attempts reached, giving up');
          }
        });
      });

      this.server.on("error", (error) => {
        const delay = this.backoff.recordConnectionError();
        if (delay > 0) {
          console.log(`Server error, backing off for ${delay}ms before retry`);
        } else if (this.backoff.shouldGiveUp(true)) {
          reject(new Error(`Failed to start server after max retries: ${error.message}`));
        }
      });

      this.server.listen(listenPort, () => {
        this.backoff.recordSuccess();
        this.capacity = new CapacityManager(this.config.maxSessions);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    if (this.config.enableWorktree) {
      await this.cleanupAllWorktrees();
    }
    for (const socket of this.sockets) {
      socket.end();
    }
    this.sockets.clear();
    this.tokenScheduler.cancelAll();
    this.server?.close();
  }

  onMessage(handler: (msg: BridgeMessage) => void): void {
    this.handlers.push(handler);
  }

  send(msg: BridgeMessage): void {
    const data = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`;
    for (const socket of this.sockets) {
      socket.write(frame);
    }
  }

  private handleData(data: string): void {
    this.buffer += data;
    while (true) {
      const headerMatch = this.buffer.match(/Content-Length:\s*(\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const length = parseInt(headerMatch[1], 10);
      const headerEnd = this.buffer.indexOf("\r\n\r\n") + 4;
      const bodyStart = headerEnd;
      const bodyEnd = bodyStart + length;

      if (this.buffer.length < bodyEnd) break;

      const body = this.buffer.slice(bodyStart, bodyEnd);
      this.buffer = this.buffer.slice(bodyEnd);

      try {
        const msg = JSON.parse(body) as BridgeMessage;
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch {
        // Ignore malformed messages
      }
    }
  }

  acquireSession(): boolean {
    return this.capacity.acquire();
  }

  releaseSession(): void {
    this.capacity.release();
  }

  getSessionCount(): number {
    return this.sessionCount;
  }

  scheduleTokenRefresh(sessionId: string, token: string, expiryMs?: number): void {
    this.tokenScheduler.schedule(sessionId, token, expiryMs);
  }

  cancelTokenRefresh(sessionId: string): boolean {
    return this.tokenScheduler.cancel(sessionId);
  }

  getCapacityState() {
    return this.capacity.getState();
  }

  async createSessionWorktree(sessionId: string): Promise<WorktreeInfo | null> {
    if (!this.config.enableWorktree) {
      return null;
    }

    try {
      const slug = `${this.config.worktreePrefix}-${sessionId}`;
      const worktree = await getOrCreateWorktree(slug);
      this.worktrees.set(sessionId, worktree);
      this.sessions.set(sessionId, {
        id: sessionId,
        worktree,
        createdAt: Date.now(),
      });
      return worktree;
    } catch (error) {
      console.error(`Failed to create worktree for session ${sessionId}:`, error);
      return null;
    }
  }

  async removeSessionWorktree(sessionId: string): Promise<void> {
    const worktree = this.worktrees.get(sessionId);
    if (worktree) {
      try {
        await removeWorktree(worktree.worktreePath, worktree.worktreeBranch, worktree.gitRoot);
        this.worktrees.delete(sessionId);
        this.sessions.delete(sessionId);
      } catch (error) {
        console.error(`Failed to remove worktree for session ${sessionId}:`, error);
      }
    }
  }

  getSessionWorktree(sessionId: string): WorktreeInfo | undefined {
    return this.worktrees.get(sessionId);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  private async cleanupAllWorktrees(): Promise<void> {
    for (const [sessionId, worktree] of this.worktrees.entries()) {
      try {
        await removeWorktree(worktree.worktreePath, worktree.worktreeBranch, worktree.gitRoot);
      } catch (error) {
        console.error(`Failed to cleanup worktree for session ${sessionId}:`, error);
      }
    }
    this.worktrees.clear();
    this.sessions.clear();
  }
}

export function generateBridgeToken(secret: string): string {
  return createHash("sha256").update(secret + Date.now()).digest("hex").slice(0, 32);
}
