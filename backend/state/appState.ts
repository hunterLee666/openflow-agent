import { z } from "zod";

export const SessionSliceSchema = z.object({
  sessionId: z.string(),
  cwd: z.string(),
  startedAt: z.number(),
  lastUserMessageAt: z.number().optional(),
  resumedFromCheckpoint: z.string().optional(),
});

export type SessionSlice = z.infer<typeof SessionSliceSchema>;

export const ToolInvocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["pending", "running", "success", "error"]),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  argsDigest: z.string().optional(),
});

export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;

export const ToolsSliceSchema = z.object({
  registryVersion: z.string(),
  active: z.array(ToolInvocationSchema),
  lastError: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export type ToolsSlice = z.infer<typeof ToolsSliceSchema>;

export const UiSliceSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
  layout: z.enum(["compact", "comfortable"]),
  modalStack: z.array(z.string()),
  focusPaneId: z.string().optional(),
});

export type UiSlice = z.infer<typeof UiSliceSchema>;

export const ConfigSliceSchema = z.object({
  schemaVersion: z.number(),
  model: z.string(),
  approvalPolicy: z.enum(["off", "ask", "strict"]),
  experimental: z.record(z.string(), z.boolean()),
});

export type ConfigSlice = z.infer<typeof ConfigSliceSchema>;

export const AppStateSchema = z.object({
  session: SessionSliceSchema,
  tools: ToolsSliceSchema,
  ui: UiSliceSchema,
  config: ConfigSliceSchema,
});

export type AppState = z.infer<typeof AppStateSchema>;

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
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      argsDigest: t.argsDigest,
    })),
  },
  ui: { ...state.ui },
  config: {
    ...state.config,
    experimental: { ...state.config.experimental },
  },
});
