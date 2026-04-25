import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";
import { createServer, Server } from "node:http";
import { createHmac } from "node:crypto";

export class DingTalkAdapter extends BasePlatformAdapter {
  readonly platform = "dingtalk" as const;
  private server: Server | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: PlatformConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("DingTalk appId and appSecret are required");
    }

    await this.refreshAccessToken();
    this.log("info", "DingTalk adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const port = this.config.webhookPort || 8080;
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
      this.log("info", `DingTalk webhook server listening on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.log("info", "DingTalk adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const content = this.truncateMessage(message.content);
    const url = `https://oapi.dingtalk.com/robot/send?access_token=${this.accessToken}`;

    const payload = {
      msgtype: "text",
      text: { content },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send DingTalk message: ${response.statusText}`);
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.config.enableTypingIndicator) return;
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    if (!this.config.enableReadReceipt) return;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const url = `https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${this.accessToken}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userid: userId }),
    });

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(`Failed to get DingTalk user: ${data.errmsg}`);
    }

    const user = data.result;
    return {
      id: user.userid,
      platform: "dingtalk",
      username: user.userid,
      displayName: user.name,
      avatarUrl: user.avatar,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    return {
      id: chatId,
      platform: "dingtalk",
      type: "group",
      name: chatId,
      participants: [],
    };
  }

  private async handleWebhook(data: any, res: any): Promise<void> {
    const messageType = this.detectMessageType(data);
    const platformMessage: PlatformMessage = {
      id: data.msgId || String(Date.now()),
      platform: "dingtalk",
      type: messageType,
      direction: "inbound",
      chatId: data.conversationId || data.chatId || "default",
      userId: data.senderId || data.senderStaffId || "",
      userName: data.senderNick || data.senderName,
      content: this.extractMessageContent(data),
      timestamp: new Date(data.createAt || Date.now()),
      metadata: {
        conversationType: data.conversationType,
        msgtype: data.msgtype,
      },
    };

    this.emitMessage(platformMessage);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({}));
  }

  private detectMessageType(data: any): MessageType {
    if (data.msgtype === "text") return "text";
    if (data.msgtype === "picture") return "image";
    if (data.msgtype === "voice") return "voice";
    if (data.msgtype === "video") return "video";
    if (data.msgtype === "file") return "file";
    return "text";
  }

  private extractMessageContent(data: any): string {
    if (data.msgtype === "text" && data.text) {
      return data.text.content;
    }
    if (data.msgtype === "picture") return "[图片]";
    if (data.msgtype === "voice") return "[语音]";
    if (data.msgtype === "video") return "[视频]";
    if (data.msgtype === "file") return `[文件: ${data.fileName || "未知"}]`;
    return "";
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    const url = "https://oapi.dingtalk.com/gettoken";
    const response = await fetch(`${url}?appkey=${this.config.appId}&appsecret=${this.config.appSecret}`);
    const data = await response.json();

    if (data.errcode !== 0) {
      throw new Error(`Failed to get DingTalk access token: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    this.log("info", "DingTalk access token refreshed");
  }
}

export function createDingTalkAdapter(config: PlatformConfig): DingTalkAdapter {
  return new DingTalkAdapter(config);
}
