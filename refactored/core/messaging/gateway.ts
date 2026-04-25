import { PlatformAdapter, PlatformConfig, PlatformMessage, GatewayConfig, GatewayMetrics, PlatformMetrics, PlatformType, GatewayEvent } from "./types.js";
import { TelegramAdapter, createTelegramAdapter } from "./telegram-adapter.js";
import { SlackAdapter, createSlackAdapter } from "./slack-adapter.js";
import { DingTalkAdapter, createDingTalkAdapter } from "./dingtalk-adapter.js";
import { FeishuAdapter, createFeishuAdapter } from "./feishu-adapter.js";
import { WeComAdapter, createWeComAdapter } from "./wecom-adapter.js";
import { WhatsAppAdapter, createWhatsAppAdapter } from "./whatsapp-adapter.js";
import { LineAdapter, createLineAdapter } from "./line-adapter.js";
import { WeChatAdapter, createWeChatAdapter } from "./wechat-adapter.js";

export class MessagingGateway {
  private config: GatewayConfig;
  private adapters: Map<PlatformType, PlatformAdapter>;
  private messageHandlers: Array<(message: PlatformMessage, platform: PlatformType) => void> = [];
  private eventHandlers: Array<(event: GatewayEvent) => void> = [];
  private metrics: GatewayMetrics;
  private startTime: number;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.adapters = new Map();
    this.startTime = Date.now();
    this.metrics = {
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      activePlatforms: 0,
      errors: 0,
      uptime: 0,
      platformMetrics: {} as Record<PlatformType, PlatformMetrics>,
    };
  }

  async initialize(): Promise<void> {
    for (const platformConfig of this.config.adapters) {
      if (!platformConfig.enabled) continue;

      const adapter = this.createAdapter(platformConfig);
      await adapter.initialize();

      adapter.onMessage((message) => {
        this.metrics.totalMessagesReceived++;
        this.updatePlatformMetrics(message.platform, { messagesReceived: 1 });
        this.emitEvent({
          type: "message",
          platform: message.platform,
          data: message,
          timestamp: new Date(),
        });
        for (const handler of this.messageHandlers) {
          handler(message, message.platform);
        }
      });

      adapter.onError((error) => {
        this.metrics.errors++;
        this.updatePlatformMetrics(platformConfig.platform, { errors: 1 });
        this.emitEvent({
          type: "error",
          platform: platformConfig.platform,
          data: { error: error.message },
          timestamp: new Date(),
        });
        console.error(`[Gateway] Error on ${platformConfig.platform}:`, error);
      });

      this.adapters.set(platformConfig.platform, adapter);
      this.metrics.activePlatforms++;
      this.log("info", `Initialized adapter for ${platformConfig.platform}`);
    }
  }

  async start(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      await adapter.start();
      this.log("info", `Started ${platform} adapter`);
    }
    this.log("info", "Messaging gateway started");
  }

  async stop(): Promise<void> {
    for (const [platform, adapter] of this.adapters) {
      await adapter.stop();
      this.log("info", `Stopped ${platform} adapter`);
    }
    this.log("info", "Messaging gateway stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    const adapter = this.adapters.get(message.platform);
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${message.platform}`);
    }

    await adapter.sendMessage(message);
    this.metrics.totalMessagesSent++;
    this.updatePlatformMetrics(message.platform, { messagesSent: 1 });
  }

  async sendTypingIndicator(platform: PlatformType, chatId: string): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) return;
    await adapter.sendTypingIndicator(chatId);
  }

  async markAsRead(platform: PlatformType, messageId: string, chatId: string): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) return;
    await adapter.markAsRead(messageId, chatId);
  }

  onMessage(callback: (message: PlatformMessage, platform: PlatformType) => void): void {
    this.messageHandlers.push(callback);
  }

  onEvent(callback: (event: GatewayEvent) => void): void {
    this.eventHandlers.push(callback);
  }

  getAdapter(platform: PlatformType): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  getMetrics(): GatewayMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
    };
  }

  getActivePlatforms(): PlatformType[] {
    return Array.from(this.adapters.keys());
  }

  private createAdapter(config: PlatformConfig): PlatformAdapter {
    switch (config.platform) {
      case "telegram":
        return createTelegramAdapter(config);
      case "slack":
        return createSlackAdapter(config);
      case "dingtalk":
        return createDingTalkAdapter(config);
      case "feishu":
        return createFeishuAdapter(config);
      case "wecom":
        return createWeComAdapter(config);
      case "whatsapp":
        return createWhatsAppAdapter(config);
      case "line":
        return createLineAdapter(config);
      case "wechat":
        return createWeChatAdapter(config);
      default:
        throw new Error(`Unsupported platform: ${config.platform}`);
    }
  }

  private updatePlatformMetrics(platform: PlatformType, updates: Partial<PlatformMetrics>): void {
    if (!this.metrics.platformMetrics[platform]) {
      this.metrics.platformMetrics[platform] = {
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        isConnected: false,
      };
    }
    const metrics = this.metrics.platformMetrics[platform];
    if (updates.messagesSent !== undefined) metrics.messagesSent += updates.messagesSent;
    if (updates.messagesReceived !== undefined) metrics.messagesReceived += updates.messagesReceived;
    if (updates.errors !== undefined) metrics.errors += updates.errors;
    if (updates.isConnected !== undefined) metrics.isConnected = updates.isConnected;
    metrics.lastActivity = new Date();
  }

  private emitEvent(event: GatewayEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private log(level: "debug" | "info" | "warn" | "error", message: string, data?: unknown): void {
    if (!this.config.enableLogging && level === "debug") {
      return;
    }
    const prefix = "[GATEWAY]";
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${prefix} [${level.toUpperCase()}] ${message}`, data || "");
  }
}

export function createMessagingGateway(config: GatewayConfig): MessagingGateway {
  return new MessagingGateway(config);
}
