import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";
import { createServer, Server } from "node:http";
import { createHash } from "node:crypto";

export class WeChatAdapter extends BasePlatformAdapter {
  readonly platform = "wechat" as const;
  private server: Server | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: PlatformConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("WeChat appId and appSecret are required");
    }

    await this.refreshAccessToken();
    this.log("info", "WeChat adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const port = this.config.webhookPort || 8084;
    this.server = createServer(async (req, res) => {
      if (req.method === "GET" && req.url?.startsWith("/webhook")) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const signature = url.searchParams.get("signature");
        const timestamp = url.searchParams.get("timestamp");
        const nonce = url.searchParams.get("nonce");
        const echoStr = url.searchParams.get("echostr");

        if (this.verifySignature(signature, timestamp, nonce)) {
          res.writeHead(200);
          res.end(echoStr || "");
        } else {
          res.writeHead(403);
          res.end("Invalid signature");
        }
      } else if (req.method === "POST" && req.url?.startsWith("/webhook")) {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            const data = await this.parseXml(body);
            await this.handleWebhook(data, res);
          } catch (error) {
            res.writeHead(200);
            res.end("success");
          }
        });
      } else {
        res.writeHead(200);
        res.end("OK");
      }
    });

    this.server.listen(port, () => {
      this.log("info", `WeChat webhook server listening on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.log("info", "WeChat adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const content = this.truncateMessage(message.content);
    const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${this.accessToken}`;

    const payload = {
      touser: message.userId,
      msgtype: "text",
      text: { content },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(`Failed to send WeChat message: ${data.errmsg}`);
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

    const url = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${this.accessToken}&openid=${userId}&lang=zh_CN`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errcode) {
      throw new Error(`Failed to get WeChat user: ${data.errmsg}`);
    }

    return {
      id: data.openid,
      platform: "wechat",
      username: data.nickname,
      displayName: data.nickname,
      avatarUrl: data.headimgurl,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    return {
      id: chatId,
      platform: "wechat",
      type: "private",
      name: chatId,
      participants: [],
    };
  }

  private async handleWebhook(data: any, res: any): Promise<void> {
    if (data.MsgType === "text") {
      const platformMessage: PlatformMessage = {
        id: data.MsgId || String(Date.now()),
        platform: "wechat",
        type: "text",
        direction: "inbound",
        chatId: data.FromUserName,
        userId: data.FromUserName,
        userName: data.FromUserName,
        content: data.Content || "",
        timestamp: new Date(data.CreateTime * 1000),
        metadata: {
          msgType: data.MsgType,
          toUser: data.ToUserName,
        },
      };

      this.emitMessage(platformMessage);
    } else if (data.MsgType === "image") {
      const platformMessage: PlatformMessage = {
        id: data.MsgId || String(Date.now()),
        platform: "wechat",
        type: "image",
        direction: "inbound",
        chatId: data.FromUserName,
        userId: data.FromUserName,
        content: "[图片]",
        mediaUrl: data.MediaId,
        timestamp: new Date(data.CreateTime * 1000),
        metadata: {
          msgType: data.MsgType,
          mediaId: data.MediaId,
          picUrl: data.PicUrl,
        },
      };

      this.emitMessage(platformMessage);
    } else if (data.MsgType === "voice") {
      const platformMessage: PlatformMessage = {
        id: data.MsgId || String(Date.now()),
        platform: "wechat",
        type: "voice",
        direction: "inbound",
        chatId: data.FromUserName,
        userId: data.FromUserName,
        content: "[语音]",
        mediaUrl: data.MediaId,
        timestamp: new Date(data.CreateTime * 1000),
        metadata: {
          msgType: data.MsgType,
          mediaId: data.MediaId,
          format: data.Format,
        },
      };

      this.emitMessage(platformMessage);
    }

    res.writeHead(200);
    res.end("success");
  }

  private verifySignature(
    signature: string | null,
    timestamp: string | null,
    nonce: string | null
  ): boolean {
    if (!this.config.token || !signature || !timestamp || !nonce) {
      return true;
    }

    const arr = [this.config.token, timestamp, nonce].sort();
    const str = arr.join("");
    const hash = createHash("sha1").update(str).digest("hex");

    return hash === signature;
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.config.appId}&secret=${this.config.appSecret}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errcode) {
      throw new Error(`Failed to get WeChat access token: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    this.log("info", "WeChat access token refreshed");
  }

  private async parseXml(xml: string): Promise<any> {
    const result: any = {};
    const tags = xml.match(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/g);
    if (tags) {
      for (const tag of tags) {
        const match = tag.match(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/);
        if (match) {
          result[match[1]] = match[2];
        }
      }
    }
    return result;
  }
}

export function createWeChatAdapter(config: PlatformConfig): WeChatAdapter {
  return new WeChatAdapter(config);
}
