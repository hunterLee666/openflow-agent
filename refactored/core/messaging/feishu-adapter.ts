import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";
import { createServer, Server } from "node:http";
import { createHmac } from "node:crypto";

export class FeishuAdapter extends BasePlatformAdapter {
  readonly platform = "feishu" as const;
  private server: Server | null = null;
  private tenantAccessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: PlatformConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("Feishu appId and appSecret are required");
    }

    await this.refreshTenantToken();
    this.log("info", "Feishu adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const port = this.config.webhookPort || 8081;
    this.server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/webhook") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const data = JSON.parse(body);
            await this.handleWebhook(data, res);
          } catch (error) {
            res.writeHead(400);
            res.end("Invalid JSON");
          }
        });
      } else {
        res.writeHead(200);
        res.end("OK");
      }
    });

    this.server.listen(port, () => {
      this.log("info", `Feishu webhook server listening on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.log("info", "Feishu adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.tenantAccessToken) {
      await this.refreshTenantToken();
    }

    const content = this.truncateMessage(message.content);
    const url = "https://open.feishu.cn/open-apis/im/v1/messages";

    const params = new URLSearchParams({ receive_id_type: "chat_id" });
    const requestUrl = `${url}?${params.toString()}`;

    const payload = {
      receive_id: message.chatId,
      msg_type: "text",
      content: JSON.stringify({ text: content }),
    };

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.tenantAccessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Feishu message: ${response.statusText}`);
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.config.enableTypingIndicator) return;
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    if (!this.config.enableReadReceipt) return;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    if (!this.tenantAccessToken) {
      await this.refreshTenantToken();
    }

    const url = `https://open.feishu.cn/open-apis/contact/v3/users/${userId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.tenantAccessToken}` },
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to get Feishu user: ${data.msg}`);
    }

    const user = data.data;
    return {
      id: user.open_id || userId,
      platform: "feishu",
      username: user.name,
      displayName: user.name,
      avatarUrl: user.avatar?.avatar_72,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    if (!this.tenantAccessToken) {
      await this.refreshTenantToken();
    }

    const url = `https://open.feishu.cn/open-apis/im/v1/chats/${chatId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.tenantAccessToken}` },
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to get Feishu chat: ${data.msg}`);
    }

    const chat = data.data;
    return {
      id: chatId,
      platform: "feishu",
      type: chat.chat_mode === "group" ? "group" : "private",
      name: chat.name,
      participants: [],
    };
  }

  private async handleWebhook(data: any, res: any): Promise<void> {
    if (data.type === "url_verification") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ challenge: data.challenge }));
      return;
    }

    if (data.header?.event_type === "im.message.receive_v1") {
      const event = data.event;
      const message = event.message;
      const sender = event.sender;

      const messageType = this.detectMessageType(message);
      const platformMessage: PlatformMessage = {
        id: message.message_id,
        platform: "feishu",
        type: messageType,
        direction: "inbound",
        chatId: message.chat_id,
        userId: sender.sender_id?.open_id || "",
        userName: sender.sender_id?.union_id,
        content: this.extractMessageContent(message),
        timestamp: new Date(parseInt(message.create_time)),
        threadId: message.upper_message_id,
        metadata: {
          chatType: message.chat_type,
          messageType: message.message_type,
        },
      };

      this.emitMessage(platformMessage);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({}));
  }

  private detectMessageType(message: any): MessageType {
    const msgType = message.message_type;
    if (msgType === "text") return "text";
    if (msgType === "image") return "image";
    if (msgType === "audio") return "voice";
    if (msgType === "media") return "video";
    if (msgType === "file") return "file";
    if (msgType === "location") return "location";
    if (msgType === "contact") return "contact";
    return "text";
  }

  private extractMessageContent(message: any): string {
    const msgType = message.message_type;
    if (msgType === "text" && message.content) {
      try {
        const parsed = JSON.parse(message.content);
        return parsed.text || "";
      } catch {
        return message.content;
      }
    }
    if (msgType === "image") return "[图片]";
    if (msgType === "audio") return "[语音]";
    if (msgType === "media") return "[视频]";
    if (msgType === "file") return "[文件]";
    if (msgType === "location") return "[位置]";
    if (msgType === "contact") return "[联系人]";
    return "";
  }

  private async refreshTenantToken(): Promise<void> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    const url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to get Feishu tenant token: ${data.msg}`);
    }

    this.tenantAccessToken = data.tenant_access_token;
    this.tokenExpiry = Date.now() + (data.expire - 300) * 1000;
    this.log("info", "Feishu tenant access token refreshed");
  }
}

export function createFeishuAdapter(config: PlatformConfig): FeishuAdapter {
  return new FeishuAdapter(config);
}
