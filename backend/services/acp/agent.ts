import { randomUUID, type UUID } from "node:crypto";
import type {
  Agent,
  InitializeRequest,
  InitializeResponse,
  AuthenticateRequest,
  AuthenticateResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  LoadSessionRequest,
  LoadSessionResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  ForkSessionRequest,
  ForkSessionResponse,
  CloseSessionRequest,
  CloseSessionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
  SetSessionModelRequest,
  SetSessionModelResponse,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  AcpSession,
  SessionState,
  SessionMode,
  Message,
  ContentBlock,
  ClientCapabilities,
  Usage,
} from "./protocol.js";

export interface AcpAgentConfig {
  serverId?: UUID;
  version?: string;
  capabilities?: Partial<AgentCapabilities>;
}

export interface AgentCapabilities {
  streaming: boolean;
  notifications: boolean;
  authentication: boolean;
  maxConcurrentSessions?: number;
}

export class DefaultAcpAgent implements Agent {
  private sessions = new Map<string, AcpSession>();
  private authenticatedTokens = new Set<string>();
  private serverId: UUID;
  private version: string;
  private capabilities: AgentCapabilities;

  constructor(config?: AcpAgentConfig) {
    this.serverId = config?.serverId || randomUUID();
    this.version = config?.version || "1.0.0";
    this.capabilities = {
      streaming: true,
      notifications: true,
      authentication: true,
      ...config?.capabilities,
    };
  }

  async initialize(req: InitializeRequest): Promise<InitializeResponse> {
    if (!this.validateVersion(req.version)) {
      throw new Error(`Unsupported protocol version: ${req.version}`);
    }

    return {
      version: this.version,
      serverId: this.serverId,
      capabilities: {
        streaming: this.capabilities.streaming,
        notifications: this.capabilities.notifications,
        authentication: this.capabilities.authentication,
        maxConcurrentSessions: this.capabilities.maxConcurrentSessions,
      },
    };
  }

  async authenticate(req: AuthenticateRequest): Promise<AuthenticateResponse> {
    const token = `acp_token_${randomUUID()}`;
    this.authenticatedTokens.add(token);

    return {
      success: true,
      token,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  async newSession(req: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = randomUUID();
    const now = Date.now();

    const session: AcpSession = {
      queryEngine: null,
      cancelled: false,
      cwd: req.cwd || process.cwd(),
      sessionFingerprint: this.computeFingerprint(req),
      modes: {
        current: "chat",
        available: ["chat", "plan", "auto", "bypass"],
      },
      models: {
        current: req.model || "claude-sonnet-4-20250514",
        available: [req.model || "claude-sonnet-4-20250514"],
      },
      configOptions: [],
      promptRunning: false,
      pendingMessages: new Map(),
      nextPendingOrder: 0,
      toolUseCache: {
        toolUseId: "",
        toolName: "",
        input: {},
        cachedAt: 0,
      },
      clientCapabilities: undefined,
      appState: {},
      commands: [],
    };

    this.sessions.set(sessionId, session);

    return {
      sessionId,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    };
  }

  async prompt(req: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    if (session.cancelled) {
      throw new Error("Session is cancelled");
    }

    const messageId = randomUUID();
    const now = Date.now();

    const message: Message = {
      id: messageId,
      role: "user",
      content: [{ type: "text", text: req.message }],
      createdAt: now,
    };

    session.promptRunning = true;

    try {
      const response = await this.processPrompt(session, message);

      session.promptRunning = false;

      return response;
    } catch (error) {
      session.promptRunning = false;
      throw error;
    }
  }

  async cancel(req: CancelNotification): Promise<void> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    session.cancelled = true;
    session.promptRunning = false;

    if (req.messageId) {
      const pending = session.pendingMessages.get(req.messageId);
      if (pending) {
        pending.resolve(true);
      }
    }
  }

  async loadSession(req: LoadSessionRequest): Promise<LoadSessionResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    return {
      sessionId: req.sessionId,
      createdAt: Date.now(),
      messages: [],
      state: this.getSessionState(session),
    };
  }

  async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    const limit = req.limit || 50;
    const sessions = Array.from(this.sessions.entries())
      .slice(0, limit)
      .map(([id, session]) => ({
        sessionId: id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        lastMessage: undefined,
      }));

    return {
      sessions,
    };
  }

  async resumeSession(req: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    return {
      sessionId: req.sessionId,
      messageId: randomUUID(),
      content: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }

  async forkSession(req: ForkSessionRequest): Promise<ForkSessionResponse> {
    const parentSession = this.sessions.get(req.sessionId);
    if (!parentSession) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    const newSessionId = randomUUID();
    const now = Date.now();

    const forkedSession: AcpSession = {
      ...parentSession,
      cwd: req.cwd || parentSession.cwd,
      pendingMessages: new Map(),
      nextPendingOrder: 0,
    };

    this.sessions.set(newSessionId, forkedSession);

    return {
      sessionId: newSessionId,
      parentSessionId: req.sessionId,
      createdAt: now,
    };
  }

  async closeSession(req: CloseSessionRequest): Promise<CloseSessionResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    session.promptRunning = false;
    session.cancelled = true;

    return {
      sessionId: req.sessionId,
      closed: true,
      summary: "Session closed successfully",
    };
  }

  async setSessionMode(req: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    if (!session.modes.available.includes(req.mode)) {
      throw new Error(`Invalid mode: ${req.mode}`);
    }

    session.modes.current = req.mode;

    return {
      sessionId: req.sessionId,
      mode: req.mode,
    };
  }

  async setSessionModel(req: SetSessionModelRequest): Promise<SetSessionModelResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    session.models.current = req.model;
    if (req.fallbackModel) {
      session.models.fallback = req.fallbackModel;
    }

    return {
      sessionId: req.sessionId,
      model: req.model,
      fallbackModel: req.fallbackModel,
    };
  }

  async setSessionConfigOption(
    req: SetSessionConfigOptionRequest
  ): Promise<SetSessionConfigOptionResponse> {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }

    const optionIndex = session.configOptions.findIndex((o) => o.name === req.option);
    if (optionIndex >= 0) {
      session.configOptions[optionIndex].value = req.value;
    } else {
      session.configOptions.push({
        name: req.option,
        value: req.value,
        source: "user",
      });
    }

    return {
      sessionId: req.sessionId,
      option: req.option,
      value: req.value,
    };
  }

  private validateVersion(version: string): boolean {
    const [major] = version.split(".").map(Number);
    const [serverMajor] = this.version.split(".").map(Number);
    return major === serverMajor;
  }

  private computeFingerprint(req: NewSessionRequest): string {
    return randomUUID();
  }

  private getSessionState(session: AcpSession): SessionState {
    return {
      cwd: session.cwd,
      model: session.models.current,
      tools: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  }

  private async processPrompt(
    session: AcpSession,
    message: Message
  ): Promise<PromptResponse> {
    return {
      sessionId: randomUUID(),
      messageId: randomUUID(),
      content: [{ type: "text", text: "Response processed" }],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      stopReason: "end_turn",
    };
  }
}

export function createAcpAgent(config?: AcpAgentConfig): DefaultAcpAgent {
  return new DefaultAcpAgent(config);
}
