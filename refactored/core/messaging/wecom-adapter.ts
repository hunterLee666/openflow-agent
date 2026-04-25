import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";
import { createServer, Server } from "node:http";
import { createHash } from "node:crypto";

export class WeComAdapter extends BasePlatformAdapter {
  readonly platform = "wecom" as const;
  private server: Server | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: PlatformConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("WeCom corpId and corpSecret are required");
    }

    await this.refreshAccessToken();
    this.log("info", "WeCom adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const port = this.config.webhookPort || 8082;
    this.server = createServer(async (req, res) => {
      if (req.method === "GET" && req.url?.startsWith("/webhook")) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const msgSignature = url.searchParams.get("msg_signature");
        const timestamp = url.searchParams.get("timestamp");
        const nonce = url.searchParams.get("nonce");
        const echoStr = url.searchParams.get("echostr");

        if (this.verifySignature(msgSignature, timestamp, nonce, echoStr)) {
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
            const data = JSON.parse(body);
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
      this.log("info", `WeCom webhook server listening on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.log("info", "WeCom adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const content = this.truncateMessage(message.content);
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`;

    const payload = {
      touser: message.userId,
      msgtype: "text",
      agentid: parseInt(this.config.appId || "0"),
      text: { content },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(`Failed to send WeCom message: ${data.errmsg}`);
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

    const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${this.accessToken}&userid=${userId}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errcode !== 0) {
      throw new Error(`Failed to get WeCom user: ${data.errmsg}`);
    }

    return {
      id: data.userid,
      platform: "wecom",
      username: data.userid,
      displayName: data.name,
      avatarUrl: data.avatar,
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/chat/get?access_token=${this.accessToken}&chatid=${chatId}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errcode !== 0) {
      throw new Error(`Failed to get WeCom chat: ${data.errmsg}`);
    }

    return {
      id: chatId,
      platform: "wecom",
      type: "group",
      name: data.name,
      participants: data.userlist || [],
    };
  }

  private async handleWebhook(data: any, res: any): Promise<void> {
    if (data.MsgType === "text") {
      const platformMessage: PlatformMessage = {
        id: data.MsgId || String(Date.now()),
        platform: "wecom",
        type: "text",
        direction: "inbound",
        chatId: data.ChatId || data.FromUserName || "default",
        userId: data.FromUserName || data.From || "",
        userName: data.FromUserName,
        content: data.Content || "",
        timestamp: new Date(data.CreateTime * 1000),
        metadata: {
          msgType: data.MsgType,
          agentId: data.AgentID,
        },
      };

      this.emitMessage(platformMessage);
    }

    res.writeHead(200);
    res.end("success");
  }

  private verifySignature(
    msgSignature: string | null,
    timestamp: string | null,
    nonce: string | null,
    echoStr: string | null
  ): boolean {
    if (!this.config.secret || !msgSignature || !timestamp || !nonce || !echoStr) {
      return true;
    }

    const sorted = [this.config.secret, timestamp, nonce, echoStr].sort();
    const str = sorted.join("");
    const hash = createHash("sha1").update(str).digest("hex");

    return hash === msgSignature;
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.appId}&corpsecret=${this.config.appSecret}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errcode !== 0) {
      throw new Error(`Failed to get WeCom access token: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    this.log("info", "WeCom access token refreshed");
  }
}

export function createWeComAdapter(config: PlatformConfig): WeComAdapter {
  return new WeComAdapter(config);
}
