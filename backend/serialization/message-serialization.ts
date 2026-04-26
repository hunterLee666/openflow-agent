import { z } from "zod";

export const ContentBlockSchema: z.ZodType<any> = z.lazy(() => z.object({
  type: z.string(),
  text: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  content: z.array(ContentBlockSchema).optional(),
  tool_use_id: z.string().optional(),
}));

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const MessageSchema: z.ZodType<any> = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  cacheControl: z.object({
    type: z.enum(["ephemeral", "hidden"]),
    category: z.string().optional(),
  }).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const SerializedMessageSchema: z.ZodType<any> = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  createdAt: z.number(),
  cacheControl: z.object({
    type: z.enum(["ephemeral", "hidden"]),
    category: z.string().optional(),
  }).optional(),
});

export type SerializedMessage = z.infer<typeof SerializedMessageSchema>;

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
  return (message.content as ContentBlock[])
    .filter((c: ContentBlock): c is ContentBlock & { type: "text" } => c.type === "text")
    .map((c: ContentBlock) => c.text || "")
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
