export interface SessionSlice {
  sessionId: string;
  cwd: string;
  startedAt: number;
  lastUserMessageAt?: number;
  resumedFromCheckpoint?: string;
}

export interface ToolInvocation {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "error";
  startedAt: number;
  endedAt?: number;
  argsDigest?: string;
}

export interface ToolsSlice {
  registryVersion: string;
  active: ToolInvocation[];
  lastError?: { code: string; message: string };
}

export interface UiSlice {
  theme: "dark" | "light" | "system";
  layout: "compact" | "comfortable";
  modalStack: string[];
  focusPaneId?: string;
}

export interface ConfigSlice {
  schemaVersion: number;
  model: string;
  approvalPolicy: "off" | "ask" | "strict";
  experimental: Record<string, boolean>;
}

export interface AppState {
  session: SessionSlice;
  tools: ToolsSlice;
  ui: UiSlice;
  config: ConfigSlice;
}

export const defaultSession: SessionSlice = {
  sessionId: "",
  cwd: process.cwd(),
  startedAt: Date.now(),
};

export const defaultTools: ToolsSlice = {
  registryVersion: "1.0.0",
  active: [],
};

export const defaultUi: UiSlice = {
  theme: "system",
  layout: "comfortable",
  modalStack: [],
};

export const defaultConfig: ConfigSlice = {
  schemaVersion: 1,
  model: "default",
  approvalPolicy: "ask",
  experimental: {},
};

export const selectActiveTool = (s: AppState): ToolInvocation | undefined =>
  s.tools.active.find((t) => t.status === "running");

export const selectIsModalOpen = (name: string) => (s: AppState): boolean =>
  s.ui.modalStack.includes(name);

export const selectNeedsAttention = (s: AppState): boolean =>
  !!s.tools.lastError || s.ui.modalStack.length > 0;

export const sanitizeForLog = (state: AppState): Partial<AppState> => ({
  session: {
    sessionId: state.session.sessionId.slice(0, 8) + "...",
    cwd: state.session.cwd,
    startedAt: state.session.startedAt,
  },
  tools: {
    registryVersion: state.tools.registryVersion,
    active: state.tools.active.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
    })),
  },
  ui: { ...state.ui },
  config: {
    ...state.config,
    experimental: { ...state.config.experimental },
  },
});
