import { z } from "zod";

export const PlatformTypeSchema = z.enum([
  "telegram",
  "slack",
  "dingtalk",
  "feishu",
  "wecom",
  "whatsapp",
  "line",
  "wechat",
]);

export type PlatformType = z.infer<typeof PlatformTypeSchema>;

export const MessageTypeSchema = z.enum([
  "text",
  "image",
  "voice",
  "video",
  "file",
  "location",
  "contact",
  "system",
  "command",
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageDirectionSchema = z.enum(["inbound", "outbound"]);

export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

export const PlatformMessageSchema = z.object({
  id: z.string(),
  platform: PlatformTypeSchema,
  type: MessageTypeSchema,
  direction: MessageDirectionSchema,
  chatId: z.string(),
  userId: z.string(),
  userName: z.string().optional(),
  content: z.string(),
  mediaUrl: z.string().optional(),
  mediaType: z.string().optional(),
  timestamp: z.date(),
  threadId: z.string().optional(),
  replyTo: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlatformMessage = z.infer<typeof PlatformMessageSchema>;

export const PlatformUserSchema = z.object({
  id: z.string(),
  platform: PlatformTypeSchema,
  username: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  isBot: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlatformUser = z.infer<typeof PlatformUserSchema>;

export const PlatformChatSchema = z.object({
  id: z.string(),
  platform: PlatformTypeSchema,
  type: z.enum(["private", "group", "channel"]),
  name: z.string().optional(),
  participants: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlatformChat = z.infer<typeof PlatformChatSchema>;

export const PlatformConfigSchema = z.object({
  platform: PlatformTypeSchema,
  enabled: z.boolean(),
  token: z.string().optional(),
  secret: z.string().optional(),
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  allowedUsers: z.array(z.string()).optional(),
  allowedChats: z.array(z.string()).optional(),
  webhookUrl: z.string().optional(),
  webhookPort: z.number().optional(),
  polling: z.boolean().optional(),
  pollingInterval: z.number().optional(),
  maxMessageLength: z.number().optional(),
  enableTypingIndicator: z.boolean().optional(),
  enableReadReceipt: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

export const GatewayConfigSchema = z.object({
  adapters: z.array(PlatformConfigSchema),
  defaultPlatform: PlatformTypeSchema.optional(),
  sessionTimeout: z.number().optional(),
  maxConcurrentMessages: z.number().optional(),
  enableLogging: z.boolean().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

export const PlatformMetricsSchema = z.object({
  messagesSent: z.number(),
  messagesReceived: z.number(),
  errors: z.number(),
  lastActivity: z.date().optional(),
  isConnected: z.boolean(),
});

export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema>;

export const GatewayMetricsSchema = z.object({
  totalMessagesSent: z.number(),
  totalMessagesReceived: z.number(),
  activePlatforms: z.number(),
  errors: z.number(),
  uptime: z.number(),
  platformMetrics: z.record(PlatformTypeSchema, PlatformMetricsSchema),
});

export type GatewayMetrics = z.infer<typeof GatewayMetricsSchema>;

export const GatewayEventSchema = z.object({
  type: z.enum(["message", "error", "connect", "disconnect", "typing", "read"]),
  platform: PlatformTypeSchema,
  data: z.unknown(),
  timestamp: z.date(),
});

export type GatewayEvent = z.infer<typeof GatewayEventSchema>;

export interface PlatformAdapter {
  platform: PlatformType;
  config: PlatformConfig;
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: PlatformMessage): Promise<void>;
  onMessage(handler: (message: PlatformMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  getUser(userId: string): Promise<PlatformUser>;
  getChat(chatId: string): Promise<PlatformChat>;
  enableLogging?: boolean;
  sendTypingIndicator?(chatId: string): Promise<void>;
  markAsRead?(chatId: string, messageId: string): Promise<void>;
}
