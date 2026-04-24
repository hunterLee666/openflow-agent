import type {
  BridgeConfig,
  BackoffConfig,
  BridgeApiClient,
  SessionSpawner,
  BridgeLogger,
  BridgeSession,
  BridgeMessage,
  BridgeEvent,
} from "./types.js";
import { DEFAULT_BACKOFF } from "./types.js";
import { createSessionId } from "../../types/ids.js";

export interface BridgeClientOptions {
  config: BridgeConfig;
  environmentId: string;
  environmentSecret: string;
  api: BridgeApiClient;
  spawner: SessionSpawner;
  logger: BridgeLogger;
  backoffConfig?: BackoffConfig;
  initialSessionId?: string;
  onEvent?: (event: BridgeEvent) => void;
}

export class BridgeClient {
  private config: BridgeConfig;
  private environmentId: string;
  private environmentSecret: string;
  private api: BridgeApiClient;
  private spawner: SessionSpawner;
  private logger: BridgeLogger;
  private backoff: BackoffConfig;
  private currentDelay: number;
  private sessionId?: string;
  private session?: BridgeSession;
  private running = false;
  private reconnectAttempt = 0;
  private onEvent?: (event: BridgeEvent) => void;
  private abortController?: AbortController;

  constructor(options: BridgeClientOptions) {
    this.config = options.config;
    this.environmentId = options.environmentId;
    this.environmentSecret = options.environmentSecret;
    this.api = options.api;
    this.spawner = options.spawner;
    this.logger = options.logger;
    this.backoff = options.backoffConfig ?? DEFAULT_BACKOFF;
    this.currentDelay = this.backoff.connInitialMs;
    this.sessionId = options.initialSessionId;
    this.onEvent = options.onEvent;
  }

  async start(signal?: AbortSignal): Promise<void> {
    if (this.running) {
      this.logger.warn("Bridge client already running");
      return;
    }

    this.running = true;
    this.abortController = new AbortController();

    if (signal) {
      signal.addEventListener("abort", () => {
        this.stop();
      });
    }

    try {
      await this.runLoop();
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.api.disconnect().catch((err) => {
      this.logger.error("Error disconnecting:", { error: String(err) });
    });
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        if (this.abortController?.signal.aborted) {
          break;
        }

        await this.connectWithBackoff();

        if (!this.api.isConnected()) {
          this.logger.error("Failed to connect, giving up");
          break;
        }

        this.currentDelay = this.backoff.connInitialMs;
        this.reconnectAttempt = 0;

        if (!this.sessionId) {
          this.sessionId = createSessionId();
        }

        this.session = await this.spawner.spawn(this.sessionId, this.config);
        this.emitEvent({ type: "session_created", session: this.session });

        await this.processMessages();

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error("Bridge loop error:", { error: err.message });
        this.emitEvent({
          type: "error",
          sessionId: this.sessionId ?? "unknown",
          error: err,
        });

        if (!this.running) break;

        const shouldContinue = await this.handleBackoff();
        if (!shouldContinue) {
          this.logger.error("Max retry exceeded, giving up");
          break;
        }
      }
    }
  }

  private async connectWithBackoff(): Promise<void> {
    while (this.running) {
      try {
        await this.api.connect(this.environmentId, this.environmentSecret);
        this.logger.info("Connected to bridge API");
        return;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn("Connection failed:", { error: err.message, delay: this.currentDelay });

        if (this.currentDelay >= this.backoff.connGiveUpMs) {
          throw new Error(`Connection failed after max retries: ${err.message}`);
        }

        await this.sleep(this.currentDelay);
        this.currentDelay = Math.min(this.currentDelay * 2, this.backoff.connCapMs);
        this.reconnectAttempt++;

        this.emitEvent({
          type: "reconnecting",
          sessionId: this.sessionId ?? "unknown",
          attempt: this.reconnectAttempt,
          delayMs: this.currentDelay,
        });
      }
    }
  }

  private async processMessages(): Promise<void> {
    while (this.running && this.api.isConnected()) {
      try {
        const message = await this.api.receiveMessage();

        if (!message) {
          await this.sleep(100);
          continue;
        }

        if (this.session) {
          this.session.lastActivity = Date.now();
          this.session.messageCount++;
        }

        this.emitEvent({
          type: "message",
          sessionId: this.sessionId ?? "unknown",
          message,
        });

        if (message.type === "heartbeat") {
          await this.sendHeartbeatResponse();
        }

      } catch (error) {
        if (!this.running) break;

        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error("Message processing error:", { error: err.message });

        if (!this.api.isConnected()) {
          this.emitEvent({
            type: "disconnected",
            sessionId: this.sessionId ?? "unknown",
            reason: err.message,
          });
          break;
        }
      }
    }
  }

  private async sendHeartbeatResponse(): Promise<void> {
    const response: BridgeMessage = {
      id: this.generateMessageId(),
      type: "heartbeat",
      payload: { timestamp: Date.now() },
      timestamp: Date.now(),
      sessionId: this.sessionId ?? "unknown",
    };

    try {
      await this.api.sendMessage(response);
    } catch (error) {
      this.logger.warn("Failed to send heartbeat:", { error: String(error) });
    }
  }

  private async handleBackoff(): Promise<boolean> {
    if (this.currentDelay >= this.backoff.generalGiveUpMs) {
      return false;
    }

    await this.sleep(this.currentDelay);
    this.currentDelay = Math.min(this.currentDelay * 2, this.backoff.generalCapMs);
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private emitEvent(event: BridgeEvent): void {
    try {
      this.onEvent?.(event);
    } catch (error) {
      this.logger.error("Event handler error:", { error: String(error) });
    }
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  getSession(): BridgeSession | undefined {
    return this.session;
  }

  isRunning(): boolean {
    return this.running;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }
}
