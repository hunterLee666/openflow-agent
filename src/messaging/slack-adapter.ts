import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";

let App: any;

async function loadSlackBolt(): Promise<any> {
  if (!App) {
    const mod = await import("@slack/bolt");
    App = mod.App;
  }
  return App;
}

export class SlackAdapter extends BasePlatformAdapter {
  readonly platform = "slack" as const;
  private app: any;

  constructor(config: PlatformConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.token || !this.config.appSecret) {
      throw new Error("Slack token and appSecret are required");
    }

    const BoltApp = await loadSlackBolt();
    this.app = new BoltApp({
      token: this.config.token,
      signingSecret: this.config.appSecret,
      socketMode: true,
      appToken: this.config.appSecret,
    });

    this.setupHandlers();
    this.log("info", "Slack adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    await this.app.start();
    this.log("info", "Slack adapter started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.log("info", "Slack adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.app) return;

    const content = this.truncateMessage(message.content);

    await this.app.client.chat.postMessage({
      channel: message.chatId,
      text: content,
      thread_ts: message.threadId,
    });
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.app || !this.config.enableTypingIndicator) return;
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    if (!this.app || !this.config.enableReadReceipt) return;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    if (!this.app) {
      throw new Error("Slack app not initialized");
    }
    const result = await this.app.client.users.info({ user: userId });
    const user = result.user as any;
    return {
      id: userId,
      platform: "slack",
      username: user.name,
      displayName: user.real_name || user.name,
      avatarUrl: user.profile?.image_512,
      isBot: user.is_bot,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    if (!this.app) {
      throw new Error("Slack app not initialized");
    }
    const result = await this.app.client.conversations.info({ channel: chatId });
    const channel = result.channel as any;
    return {
      id: chatId,
      platform: "slack",
      type: channel.is_im ? "private" : channel.is_mpim ? "group" : "channel",
      name: channel.name,
      participants: [],
    };
  }

  private setupHandlers(): void {
    if (!this.app) return;

    this.app.message(async ({ message, client, context }: any) => {
      const messageType = this.detectMessageType(message);
      const platformMessage: PlatformMessage = {
        id: message.ts || String(Date.now()),
        platform: "slack",
        type: messageType,
        direction: "inbound",
        chatId: message.channel,
        userId: message.user || "",
        userName: message.username,
        content: this.extractMessageContent(message),
        timestamp: new Date(parseFloat(message.ts) * 1000),
        threadId: message.thread_ts,
        replyTo: message.thread_ts,
        metadata: {
          channelType: context.channelType,
          isBotMessage: message.bot_id !== undefined,
        },
      };

      this.emitMessage(platformMessage);
    });

    this.app.error((error: Error) => {
      this.emitError(error);
    });
  }

  private detectMessageType(message: any): MessageType {
    if (message.text) return "text";
    if (message.files) return "file";
    return "text";
  }

  private extractMessageContent(message: any): string {
    if (message.text) return message.text;
    if (message.files) return `[文件: ${message.files.length} 个]`;
    return "";
  }
}

export function createSlackAdapter(config: PlatformConfig): SlackAdapter {
  return new SlackAdapter(config);
}
