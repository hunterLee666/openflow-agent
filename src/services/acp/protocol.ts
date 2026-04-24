export type UUID = string;

export interface InitializeRequest {
  version: string;
  clientId: UUID;
  capabilities: ClientCapabilities;
}

export interface InitializeResponse {
  version: string;
  serverId: UUID;
  capabilities: ServerCapabilities;
  sessionId?: UUID;
}

export interface ClientCapabilities {
  streaming?: boolean;
  notifications?: boolean;
  authentication?: boolean;
  compression?: CompressionAlgorithm[];
}

export interface ServerCapabilities {
  streaming: boolean;
  notifications: boolean;
  authentication: boolean;
  compression?: CompressionAlgorithm[];
  maxConcurrentSessions?: number;
}

export type CompressionAlgorithm = "gzip" | "deflate" | "none";

export interface AuthenticateRequest {
  method: "token" | "key" | "oauth";
  credentials: string;
}

export interface AuthenticateResponse {
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}

export interface NewSessionRequest {
  cwd?: string;
  environment?: Record<string, string>;
  model?: string;
  tools?: string[];
  systemPrompt?: string;
}

export interface NewSessionResponse {
  sessionId: UUID;
  createdAt: number;
  expiresAt?: number;
}

export interface PromptRequest {
  sessionId: UUID;
  message: string;
  attachments?: Attachment[];
  stream?: boolean;
}

export interface PromptResponse {
  sessionId: UUID;
  messageId: UUID;
  content: ContentBlock[];
  usage?: Usage;
  stopReason?: StopReason;
}

export interface Attachment {
  type: "text" | "image" | "file";
  content: string;
  mimeType?: string;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "error";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
  content?: string;
  error?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "error";

export interface CancelNotification {
  sessionId: UUID;
  messageId?: UUID;
  reason?: string;
}

export interface LoadSessionRequest {
  sessionId: UUID;
}

export interface LoadSessionResponse {
  sessionId: UUID;
  createdAt: number;
  messages: Message[];
  state: SessionState;
}

export interface Message {
  id: UUID;
  role: "user" | "assistant" | "system" | "tool";
  content: ContentBlock[];
  createdAt: number;
}

export interface SessionState {
  cwd: string;
  model: string;
  tools: string[];
  usage: Usage;
}

export interface ListSessionsRequest {
  limit?: number;
  cursor?: string;
}

export interface ListSessionsResponse {
  sessions: SessionSummary[];
  nextCursor?: string;
}

export interface SessionSummary {
  sessionId: UUID;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

export interface ResumeSessionRequest {
  sessionId: UUID;
  lastMessageId?: UUID;
}

export interface ResumeSessionResponse {
  sessionId: UUID;
  messageId: UUID;
  content: ContentBlock[];
  usage?: Usage;
}

export interface ForkSessionRequest {
  sessionId: UUID;
  cwd?: string;
}

export interface ForkSessionResponse {
  sessionId: UUID;
  parentSessionId: UUID;
  createdAt: number;
}

export interface CloseSessionRequest {
  sessionId: UUID;
  reason?: string;
}

export interface CloseSessionResponse {
  sessionId: UUID;
  closed: boolean;
  summary?: string;
}

export interface SetSessionModeRequest {
  sessionId: UUID;
  mode: SessionMode;
}

export type SessionMode = "chat" | "plan" | "auto" | "bypass";

export interface SetSessionModeResponse {
  sessionId: UUID;
  mode: SessionMode;
}

export interface SetSessionModelRequest {
  sessionId: UUID;
  model: string;
  fallbackModel?: string;
}

export interface SetSessionModelResponse {
  sessionId: UUID;
  model: string;
  fallbackModel?: string;
}

export interface SetSessionConfigOptionRequest {
  sessionId: UUID;
  option: string;
  value: unknown;
}

export interface SetSessionConfigOptionResponse {
  sessionId: UUID;
  option: string;
  value: unknown;
}

export interface SessionUpdate {
  type: "session_start" | "session_end" | "message" | "error" | "tool_use" | "tool_result";
  sessionId: UUID;
  messageId?: UUID;
  content?: ContentBlock | ContentBlock[];
  error?: string;
  timestamp: number;
}

export interface Agent {
  initialize(req: InitializeRequest): Promise<InitializeResponse>;
  authenticate(req: AuthenticateRequest): Promise<AuthenticateResponse>;
  newSession(req: NewSessionRequest): Promise<NewSessionResponse>;
  prompt(req: PromptRequest): Promise<PromptResponse>;
  cancel(req: CancelNotification): Promise<void>;
  loadSession(req: LoadSessionRequest): Promise<LoadSessionResponse>;
  listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse>;
  resumeSession(req: ResumeSessionRequest): Promise<ResumeSessionResponse>;
  forkSession(req: ForkSessionRequest): Promise<ForkSessionResponse>;
  closeSession(req: CloseSessionRequest): Promise<CloseSessionResponse>;
  setSessionMode(req: SetSessionModeRequest): Promise<SetSessionModeResponse>;
  setSessionModel(req: SetSessionModelRequest): Promise<SetSessionModelResponse>;
  setSessionConfigOption(req: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse>;
}

export interface Session {
  id: UUID;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  model: string;
  mode: SessionMode;
  messages: Message[];
  usage: Usage;
  isActive: boolean;
}

export interface AcpSession {
  queryEngine: unknown;
  cancelled: boolean;
  cwd: string;
  sessionFingerprint: string;
  modes: SessionModeState;
  models: SessionModelState;
  configOptions: SessionConfigOption[];
  promptRunning: boolean;
  pendingMessages: Map<string, { resolve: (cancelled: boolean) => void; order: number }>;
  nextPendingOrder: number;
  toolUseCache: ToolUseCache;
  clientCapabilities?: ClientCapabilities;
  appState: unknown;
  commands: unknown[];
}

export interface SessionModeState {
  current: SessionMode;
  available: SessionMode[];
}

export interface SessionModelState {
  current: string;
  fallback?: string;
  available: string[];
}

export interface SessionConfigOption {
  name: string;
  value: unknown;
  source: "default" | "user" | "project" | "cli";
}

export interface ToolUseCache {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: unknown;
  cachedAt: number;
}
