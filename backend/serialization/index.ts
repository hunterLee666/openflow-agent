export {
  serializeMessage,
  deserializeMessage,
  serializeMessages,
  deserializeMessages,
  migrateLegacyMessage,
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  createSystemMessage,
  createMessageId,
  messageToText,
  messageToJSON,
  parseMessageFromJSON,
} from "./message-serialization.js";
export type { Message, ContentBlock, SerializedMessage } from "./message-serialization.js";
