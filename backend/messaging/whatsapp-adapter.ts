import { BasePlatformAdapter } from "./base-adapter.js";
import type { PlatformConfig, PlatformMessage, PlatformUser, PlatformChat, MessageType } from "./types.js";

let baileysModule: any = null;

async function loadBaileys(): Promise<void> {
  if (!baileysModule) {
    baileysModule = await import("baileys");
  }
}

export class WhatsAppAdapter extends BasePlatformAdapter {
  readonly platform = "whatsapp" as const;
  private sock: any;
  private authStatePath: string;

  constructor(config: PlatformConfig) {
    super(config);
    this.authStatePath = (config.metadata as any)?.authPath || "./.openflow/whatsapp-auth";
  }

  async initialize(): Promise<void> {
    await loadBaileys();

    const makeWASocket = baileysModule.default?.makeWASocket || baileysModule.makeWASocket;
    const useMultiFileAuthState = baileysModule.useMultiFileAuthState;

    if (!this.config.token) {
      throw new Error("WhatsApp requires a phone number or session token");
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authStatePath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.setupHandlers();

    this.log("info", "WhatsApp adapter initialized");
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log("info", "WhatsApp adapter started (waiting for QR scan if needed)");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.sock) {
      this.sock.end(undefined);
    }
    this.log("info", "WhatsApp adapter stopped");
  }

  async sendMessage(message: PlatformMessage): Promise<void> {
    if (!this.sock) return;

    const content = this.truncateMessage(message.content);

    if (message.type === "image" && message.mediaUrl) {
      await this.sock.sendMessage(message.chatId, {
        image: { url: message.mediaUrl },
        caption: content,
      });
    } else {
      await this.sock.sendMessage(message.chatId, { text: content });
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    if (!this.sock || !this.config.enableTypingIndicator) return;
    await this.sock.sendPresenceUpdate("composing", chatId);
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    if (!this.sock || !this.config.enableReadReceipt) return;
    await this.sock.readMessages([{ id: messageId, fromMe: false, remoteJid: chatId }]);
  }

  async getUser(userId: string): Promise<PlatformUser> {
    if (!this.sock) {
      throw new Error("WhatsApp socket not initialized");
    }

    const [result] = await this.sock.onWhatsApp(userId);
    return {
      id: result?.jid || userId,
      platform: "whatsapp",
      username: result?.jid,
      displayName: result?.jid?.split("@")[0],
    };
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    return {
      id: chatId,
      platform: "whatsapp",
      type: chatId.includes("g.us") ? "group" : "private",
      name: chatId,
      participants: [],
    };
  }

  private setupHandlers(): void {
    if (!this.sock) return;

    this.sock.ev.on("messages.upsert", async (m: any) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const messageType = this.detectMessageType(msg);
      const platformMessage: PlatformMessage = {
        id: msg.key.id,
        platform: "whatsapp",
        type: messageType,
        direction: "inbound",
        chatId: msg.key.remoteJid,
        userId: msg.key.participant || msg.key.remoteJid,
        userName: msg.pushName,
        content: this.extractMessageContent(msg),
        timestamp: new Date(msg.messageTimestamp * 1000),
        metadata: {
          fromMe: msg.key.fromMe,
          status: msg.status,
        },
      };

      this.emitMessage(platformMessage);
    });

    this.sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const DisconnectReason = baileysModule.DisconnectReason;
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason?.loggedOut;
        if (shouldReconnect) {
          this.log("warn", "WhatsApp connection closed, reconnecting...");
        } else {
          this.emitError(new Error("WhatsApp logged out, need to re-scan QR"));
        }
      } else if (connection === "open") {
        this.log("info", "WhatsApp connected");
      }
    });

    this.sock.ev.on("connection.close", (error: Error) => {
      this.emitError(error);
    });
  }

  private detectMessageType(msg: any): MessageType {
    const msgType = Object.keys(msg.message || {})[0];
    if (msgType === "conversation" || msgType === "extendedTextMessage") return "text";
    if (msgType === "imageMessage") return "image";
    if (msgType === "audioMessage") return "voice";
    if (msgType === "videoMessage") return "video";
    if (msgType === "documentMessage") return "file";
    if (msgType === "locationMessage") return "location";
    if (msgType === "contactMessage") return "contact";
    return "text";
  }

  private extractMessageContent(msg: any): string {
    const msgType = Object.keys(msg.message || {})[0];
    if (msgType === "conversation") return msg.message.conversation;
    if (msgType === "extendedTextMessage") return msg.message.extendedTextMessage.text;
    if (msgType === "imageMessage") return msg.message.imageMessage?.caption || "[图片]";
    if (msgType === "audioMessage") return "[语音]";
    if (msgType === "videoMessage") return msg.message.videoMessage?.caption || "[视频]";
    if (msgType === "documentMessage") return `[文件: ${msg.message.documentMessage?.fileName || "未知"}]`;
    if (msgType === "locationMessage") return "[位置]";
    if (msgType === "contactMessage") return "[联系人]";
    return "";
  }
}

export function createWhatsAppAdapter(config: PlatformConfig): WhatsAppAdapter {
  return new WhatsAppAdapter(config);
}
