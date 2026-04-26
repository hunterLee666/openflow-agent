export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "image";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  tool_use_id?: string;
}

export interface SessionStore {
  createThread(): Promise<string>;
  loadMessages(threadId?: string): Promise<Message[]>;
  saveMessages(threadId: string, messages: Message[]): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  listThreads(): Promise<string[]>;
}

export interface SessionConfig {
  sessionsDir?: string;
  maxThreads?: number;
  maxMessagesPerThread?: number;
}

export interface SessionInfo {
  threadId: string;
  lastAccess: number;
  messageCount: number;
}
