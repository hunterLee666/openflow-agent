export type PlatformType =
  | "telegram"
  | "slack"
  | "dingtalk"
  | "feishu"
  | "wecom"
  | "whatsapp"
  | "line"
  | "wechat";

export type MessageType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "location"
  | "contact"
  | "system"
  | "command";

export type MessageDirection = "inbound" | "outbound";

export interface PlatformMessage {
  id: string;
  platform: PlatformType;
  type: MessageType;
  direction: MessageDirection;
  chatId: string;
  userId: string;
  userName?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: Date;
  threadId?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformUser {
  id: string;
  platform: PlatformType;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isBot?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlatformChat {
  id: string;
  platform: PlatformType;
  type: "private" | "group" | "channel";
  name?: string;
  participants: string[];
  metadata?: Record<string, unknown>;
}

export interface PlatformConfig {
  platform: PlatformType;
  enabled: boolean;
  token?: string;
  secret?: string;
  appId?: string;
  appSecret?: string;
  allowedUsers?: string[];
  allowedChats?: string[];
  webhookUrl?: string;
  webhookPort?: number;
  polling?: boolean;
  pollingInterval?: number;
  maxMessageLength?: number;
  enableTypingIndicator?: boolean;
  enableReadReceipt?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlatformAdapter {
  platform: PlatformType;
  config: PlatformConfig;
  isRunning: boolean;

  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: PlatformMessage): Promise<void>;
  sendTypingIndicator(chatId: string): Promise<void>;
  markAsRead(messageId: string, chatId: string): Promise<void>;
  getUser(userId: string): Promise<PlatformUser>;
  getChat(chatId: string): Promise<PlatformChat>;
  onMessage(callback: (message: PlatformMessage) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface GatewayConfig {
  adapters: PlatformConfig[];
  defaultPlatform?: PlatformType;
  sessionTimeout?: number;
  maxConcurrentMessages?: number;
  enableLogging?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export interface GatewayMetrics {
  totalMessagesSent: number;
  totalMessagesReceived: number;
  activePlatforms: number;
  errors: number;
  uptime: number;
  platformMetrics: Record<PlatformType, PlatformMetrics>;
}

export interface PlatformMetrics {
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  lastActivity?: Date;
  isConnected: boolean;
}

export interface GatewayEvent {
  type: "message" | "error" | "connect" | "disconnect" | "typing" | "read";
  platform: PlatformType;
  data: unknown;
  timestamp: Date;
}
