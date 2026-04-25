export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: ContentBlock[];
  tool_use_id?: string;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  cacheControl?: { type: "ephemeral" | "hidden"; category?: string };
}

export interface SerializedMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  createdAt: number;
  cacheControl?: { type: "ephemeral" | "hidden"; category?: string };
}

let messageCounter = 0;

export function createMessageId(): string {
  messageCounter++;
  return `msg_${Date.now()}_${messageCounter}`;
}

export function serializeMessage(message: Message, sessionId: string = "default"): SerializedMessage {
  return {
    id: createMessageId(),
    sessionId,
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

export function serializeMessages(messages: Message[], sessionId: string = "default"): SerializedMessage[] {
  return messages.map((msg) => serializeMessage(msg, sessionId));
}

export function deserializeMessages(serialized: SerializedMessage[]): Message[] {
  return serialized.map(deserializeMessage);
}

export function migrateLegacyMessage(message: SerializedMessage): SerializedMessage {
  return message;
}

export function createUserMessage(content: string): Message {
  return {
    role: "user",
    content,
  };
}

export function createAssistantMessage(content: string): Message {
  return {
    role: "assistant",
    content,
  };
}

export function createToolResultMessage(
  toolUseId: string,
  result: unknown,
): Message {
  return {
    role: "tool",
    content: JSON.stringify(result),
  };
}

export function createSystemMessage(content: string): Message {
  return {
    role: "system",
    content,
  };
}

export function messageToText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((c): c is ContentBlock & { type: "text" } => c.type === "text")
    .map((c) => c.text || "")
    .join("\n");
}

export function messageToJSON(message: Message, indent?: number): string {
  return JSON.stringify(message, null, indent);
}

export function parseMessageFromJSON(json: string): Message {
  const parsed = JSON.parse(json);
  return {
    role: parsed.role,
    content: parsed.content,
    cacheControl: parsed.cacheControl,
  };
}
