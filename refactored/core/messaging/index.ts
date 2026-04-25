export { MessagingGateway, createMessagingGateway } from "./gateway.js";
export { BasePlatformAdapter } from "./base-adapter.js";
export { TelegramAdapter, createTelegramAdapter } from "./telegram-adapter.js";
export { SlackAdapter, createSlackAdapter } from "./slack-adapter.js";
export { DingTalkAdapter, createDingTalkAdapter } from "./dingtalk-adapter.js";
export { FeishuAdapter, createFeishuAdapter } from "./feishu-adapter.js";
export { WeComAdapter, createWeComAdapter } from "./wecom-adapter.js";
export { WhatsAppAdapter, createWhatsAppAdapter } from "./whatsapp-adapter.js";
export type {
  PlatformType,
  MessageType,
  MessageDirection,
  PlatformMessage,
  PlatformUser,
  PlatformChat,
  PlatformConfig,
  PlatformAdapter,
  GatewayConfig,
  GatewayMetrics,
  PlatformMetrics,
  GatewayEvent,
} from "./types.js";
