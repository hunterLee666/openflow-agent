import type { Message, ContentBlock } from "../types/index.js";

export interface SerializedMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  createdAt: number;
  cacheControl?: { type: "ephemeral" | "hidden"; category?: "system" | "user" | "context" | "memory" };
}

export function serializeMessage(message: Message): SerializedMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    sessionId: 'default',
    role: message.role,
    content: message.content,
    createdAt: Date.now(),
    cacheControl: message.cacheControl,
  };
}

export function deserializeMessage(serialized: SerializedMessage): Message {
  return {
    role: serialized.role,
    content: serialized.content,
    cacheControl: serialized.cacheControl,
  };
}

export function serializeMessages(messages: Message[]): SerializedMessage[] {
  return messages.map(serializeMessage);
}

export function deserializeMessages(serialized: SerializedMessage[]): Message[] {
  return serialized.map(deserializeMessage);
}

export function migrateLegacyMessage(message: SerializedMessage): SerializedMessage {
  return message;
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createUserMessage(content: string, sessionId?: string): Message {
  return {
    role: "user",
    content,
  };
}

export function createAssistantMessage(content: string, sessionId?: string): Message {
  return {
    role: "assistant",
    content,
  };
}

export function createToolResultMessage(
  toolUseId: string,
  result: unknown,
  sessionId?: string
): Message {
  return {
    role: "tool",
    content: JSON.stringify(result),
  };
}
