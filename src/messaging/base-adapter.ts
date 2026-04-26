import { PlatformAdapter, PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, PlatformType } from "./types.js";

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformType;
  config: PlatformConfig;
  isRunning: boolean;

  protected messageHandlers: Array<(message: PlatformMessage) => void> = [];
  protected errorHandlers: Array<(error: Error) => void> = [];

  constructor(config: PlatformConfig) {
    this.config = config;
    this.isRunning = false;
  }

  abstract initialize(): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract sendMessage(message: PlatformMessage): Promise<void>;
  abstract sendTypingIndicator(chatId: string): Promise<void>;
  abstract markAsRead(messageId: string, chatId: string): Promise<void>;
  abstract getUser(userId: string): Promise<PlatformUser>;
  abstract getChat(chatId: string): Promise<PlatformChat>;

  onMessage(callback: (message: PlatformMessage) => void): void {
    this.messageHandlers.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandlers.push(callback);
  }

  protected emitMessage(message: PlatformMessage): void {
    if (!this.isAllowedUser(message.userId)) {
      return;
    }
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  protected emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  protected isAllowedUser(userId: string): boolean {
    if (!this.config.allowedUsers || this.config.allowedUsers.length === 0) {
      return true;
    }
    return this.config.allowedUsers.includes(userId);
  }

  protected truncateMessage(content: string): string {
    const maxLength = this.config.maxMessageLength || 4000;
    if (content.length <= maxLength) {
      return content;
    }
    return content.slice(0, maxLength - 100) + "\n\n... [消息过长已截断]";
  }

  protected log(level: "debug" | "info" | "warn" | "error", message: string, data?: unknown): void {
    if (!this.config.enableLogging && level === "debug") {
      return;
    }
    const prefix = `[${this.platform.toUpperCase()}]`;
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${prefix} [${level.toUpperCase()}] ${message}`, data || "");
  }
}
