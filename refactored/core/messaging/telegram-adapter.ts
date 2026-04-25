import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";

let TelegramBot: any;

async function loadTelegramBot(): Promise<any> {
  if (!TelegramBot) {
    const mod = await import("node-telegram-bot-api");
    TelegramBot = mod.default;
  }
  return TelegramBot;
}

export class TelegramAdapter extends BasePlatformAdapter {
  readonly platform = "telegram" as const;
  private bot: any;

  constructor(config: PlatformConfig) {
    super({ ...config, polling: config.polling !== false });
  }

  async initialize(): Promise<void> {
    if (!this.config.token) {
      throw new Error("Telegram token is required");
    }

    const Bot = await loadTelegramBot();
    this.bot = new Bot(this.config.token, {
      polling: this.config.polling ? { interval: this.config.pollingInterval || 300 } : false,
    });

    this.setupHandlers();
    this.log("info", "Telegram adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log("info", "Telegram adapter started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.bot) {
      this.bot.stopPolling();
    }
    this.log("info", "Telegram adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.bot) return;

    const content = this.truncateMessage(message.content);

    if (message.type === "image" && message.mediaUrl) {
      await this.bot.sendPhoto(message.chatId, message.mediaUrl, { caption: content });
    } else {
      await this.bot.sendMessage(message.chatId, content, { parse_mode: "Markdown" });
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.bot || !this.config.enableTypingIndicator) return;
    await this.bot.sendChatAction(chatId, "typing");
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    if (!this.bot || !this.config.enableReadReceipt) return;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    if (!this.bot) {
      throw new Error("Telegram bot not initialized");
    }
    const chat = await this.bot.getChat(userId);
    return {
      id: String(chat.id),
      platform: "telegram",
      username: chat.username,
      displayName: chat.first_name + (chat.last_name ? ` ${chat.last_name}` : ""),
      isBot: chat.type === undefined,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    if (!this.bot) {
      throw new Error("Telegram bot not initialized");
    }
    const chat = await this.bot.getChat(chatId);
    return {
      id: String(chat.id),
      platform: "telegram",
      type: chat.type === "private" ? "private" : "group",
      name: chat.title || chat.first_name,
      participants: [],
    };
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.on("message", (msg: any) => {
      const messageType = this.detectMessageType(msg);
      const platformMessage: PlatformMessage = {
        id: String(msg.message_id),
        platform: "telegram",
        type: messageType,
        direction: "inbound",
        chatId: String(msg.chat.id),
        userId: String(msg.from?.id || ""),
        userName: msg.from?.username || msg.from?.first_name,
        content: this.extractMessageContent(msg),
        mediaUrl: this.extractMediaUrl(msg),
        timestamp: new Date(msg.date * 1000),
        threadId: msg.is_topic_message ? String(msg.message_thread_id) : undefined,
        metadata: {
          chatType: msg.chat.type,
          isForwarded: msg.forward_date !== undefined,
        },
      };

      this.emitMessage(platformMessage);
    });

    this.bot.on("error", (error: Error) => {
      this.emitError(error);
    });
  }

  private detectMessageType(msg: any): MessageType {
    if (msg.text) return "text";
    if (msg.photo) return "image";
    if (msg.voice) return "voice";
    if (msg.video) return "video";
    if (msg.document) return "file";
    if (msg.location) return "location";
    if (msg.contact) return "contact";
    return "text";
  }

  private extractMessageContent(msg: any): string {
    if (msg.text) return msg.text;
    if (msg.caption) return msg.caption;
    if (msg.photo) return "[图片]";
    if (msg.voice) return "[语音]";
    if (msg.video) return "[视频]";
    if (msg.document) return `[文件: ${msg.document.file_name || "未知"}]`;
    if (msg.location) return `[位置: ${msg.location.latitude}, ${msg.location.longitude}]`;
    if (msg.contact) return `[联系人: ${msg.contact.first_name}]`;
    return "";
  }

  private extractMediaUrl(msg: any): string | undefined {
    if (msg.photo) {
      const photoId = msg.photo[msg.photo.length - 1]?.file_id;
      if (photoId) {
        return `telegram:${photoId}`;
      }
    }
    if (msg.voice?.file_id) return `telegram:${msg.voice.file_id}`;
    if (msg.video?.file_id) return `telegram:${msg.video.file_id}`;
    if (msg.document?.file_id) return `telegram:${msg.document.file_id}`;
    return undefined;
  }
}

export function createTelegramAdapter(config: PlatformConfig): TelegramAdapter {
  return new TelegramAdapter(config);
}
