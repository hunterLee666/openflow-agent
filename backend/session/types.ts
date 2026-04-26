import { z } from "zod";

export type ContentBlock = {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "image";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  tool_use_id?: string;
};

export const ContentBlockSchema: z.ZodType<ContentBlock> = z.object({
  type: z.enum(["text", "tool_use", "tool_result", "thinking", "image"]),
  text: z.string().optional(),
  thinking: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  content: z.union([z.string(), z.lazy(() => z.array(ContentBlockSchema))]).optional(),
  tool_use_id: z.string().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export const SessionConfigSchema = z.object({
  sessionsDir: z.string().optional(),
  maxThreads: z.number().optional(),
  maxMessagesPerThread: z.number().optional(),
});

export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const SessionInfoSchema = z.object({
  threadId: z.string(),
  lastAccess: z.number(),
  messageCount: z.number(),
});

export type SessionStore = {
  createThread: () => Promise<string>;
  loadMessages: (threadId?: string) => Promise<Message[]>;
  saveMessages: (threadId: string, messages: Message[]) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  listThreads: () => Promise<string[]>;
};
