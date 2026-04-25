import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";
import { createServer, Server } from "node:http";
import { createHmac } from "node:crypto";

export class LineAdapter extends BasePlatformAdapter {
  readonly platform = "line" as const;
  private server: Server | null = null;

  constructor(config: PlatformConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.token || !this.config.secret) {
      throw new Error("LINE channelAccessToken and channelSecret are required");
    }
    this.log("info", "LINE adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const port = this.config.webhookPort || 8083;
    this.server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/webhook") {
        const signature = req.headers["x-line-signature"] as string;
        if (!this.validateSignature(signature, req)) {
          res.writeHead(401);
          res.end("Invalid signature");
          return;
        }

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
      this.log("info", `LINE webhook server listening on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.log("info", "LINE adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    const content = this.truncateMessage(message.content);
    const url = "https://api.line.me/v2/bot/message/reply";

    let replyToken = message.metadata?.replyToken as string;
    if (!replyToken) {
      const pushUrl = "https://api.line.me/v2/bot/message/push";
      const payload = {
        to: message.userId,
        messages: [{ type: "text", text: content }],
      };

      const response = await fetch(pushUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to send LINE message: ${response.statusText}`);
      }
      return;
    }

    const payload = {
      replyToken,
      messages: [{ type: "text", text: content }],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send LINE message: ${response.statusText}`);
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.config.enableTypingIndicator) return;
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    if (!this.config.enableReadReceipt) return;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const url = `https://api.line.me/v2/bot/profile/${userId}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    });

    const data = await response.json();
    if (response.status !== 200) {
      throw new Error(`Failed to get LINE user: ${data.message}`);
    }

    return {
      id: data.userId,
      platform: "line",
      username: data.userId,
      displayName: data.displayName,
      avatarUrl: data.pictureUrl,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const prefix = chatId.startsWith("C") ? "group" : chatId.startsWith("R") ? "room" : "private";
    return {
      id: chatId,
      platform: "line",
      type: prefix === "private" ? "private" : "group",
      name: chatId,
      participants: [],
    };
  }

  private async handleWebhook(data: any, res: any): Promise<void> {
    for (const event of data.events || []) {
      if (event.type === "message") {
        const messageType = this.detectMessageType(event.message);
        const platformMessage: PlatformMessage = {
          id: event.message.id,
          platform: "line",
          type: messageType,
          direction: "inbound",
          chatId: event.source.groupId || event.source.roomId || event.source.userId,
          userId: event.source.userId,
          userName: event.source.userId,
          content: this.extractMessageContent(event.message),
          timestamp: new Date(event.timestamp),
          metadata: {
            replyToken: event.replyToken,
            sourceType: event.source.type,
          },
        };

        this.emitMessage(platformMessage);
      } else if (event.type === "follow") {
        this.log("info", `New follow: ${event.source.userId}`);
      } else if (event.type === "unfollow") {
        this.log("info", `Unfollow: ${event.source.userId}`);
      }
    }

    res.writeHead(200);
    res.end("OK");
  }

  private detectMessageType(message: any): MessageType {
    const type = message.type;
    if (type === "text") return "text";
    if (type === "image") return "image";
    if (type === "audio") return "voice";
    if (type === "video") return "video";
    if (type === "file") return "file";
    if (type === "location") return "location";
    if (type === "sticker") return "text";
    return "text";
  }

  private extractMessageContent(message: any): string {
    const type = message.type;
    if (type === "text") return message.text;
    if (type === "image") return "[图片]";
    if (type === "audio") return "[语音]";
    if (type === "video") return "[视频]";
    if (type === "file") return `[文件: ${message.fileName || "未知"}]`;
    if (type === "location") return `[位置: ${message.address || ""}]`;
    if (type === "sticker") return `[贴纸: ${message.keyword || ""}]`;
    return "";
  }

  private validateSignature(signature: string, req: any): boolean {
    if (!this.config.secret || !signature) return true;

    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        const hash = createHmac("sha256", this.config.secret!).update(body).digest("base64");
        resolve(hash === signature);
      });
    }) as unknown as boolean;
  }
}

export function createLineAdapter(config: PlatformConfig): LineAdapter {
  return new LineAdapter(config);
}
