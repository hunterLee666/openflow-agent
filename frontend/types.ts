export interface TtySize {
  columns: number;
  rows: number;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'success' | 'error';
}

export interface HistoryItemBase {
  id: string;
  text?: string;
  timestamp: number;
}

export type HistoryItemUser = HistoryItemBase & {
  type: 'user';
  text: string;
};

export type HistoryItemGemini = HistoryItemBase & {
  type: 'gemini';
  text: string;
};

export type HistoryItemGeminiContent = HistoryItemBase & {
  type: 'gemini_content';
  text: string;
};

export type HistoryItemNotification = HistoryItemBase & {
  type: 'notification';
  text: string;
};

export type HistoryItemError = HistoryItemBase & {
  type: 'error';
  text: string;
  hint?: string;
};

export type HistoryItemWarning = HistoryItemBase & {
  type: 'warning';
  text: string;
};

export type HistoryItemSuccess = HistoryItemBase & {
  type: 'success';
  text: string;
};

export type HistoryItemInfo = HistoryItemBase & {
  type: 'info';
  text: string;
  linkUrl?: string;
  linkText?: string;
};

export type HistoryItemToolGroup = HistoryItemBase & {
  type: 'tool_group';
  tools: ToolCallDisplay[];
};

export interface ToolCallDisplay {
  callId: string;
  name: string;
  description: string;
  result?: string;
  status: 'pending' | 'confirming' | 'executing' | 'success' | 'error' | 'canceled';
}

export type HistoryItem =
  | HistoryItemUser
  | HistoryItemGemini
  | HistoryItemGeminiContent
  | HistoryItemNotification
  | HistoryItemError
  | HistoryItemWarning
  | HistoryItemSuccess
  | HistoryItemInfo
  | HistoryItemToolGroup;

export interface HistoryManager {
  addItem: (item: HistoryItem) => void;
  getItems: () => HistoryItem[];
  clear: () => void;
  updateItem: (id: string, updates: Partial<HistoryItem>) => void;
  removeItem: (id: string) => void;
}

export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
}

export enum AuthState {
  Unauthenticated = 'unauthenticated',
  Updating = 'updating',
  Authenticated = 'authenticated',
}
