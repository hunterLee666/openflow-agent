export {
  createStore,
  combineReducers,
  composeReducers,
  applyMiddleware,
} from "./createStore.js";
export type { Action, Reducer, Listener, Store } from "./createStore.js";

export {
  createAppStore,
  appReducer,
} from "./appReducer.js";

export {
  defaultSession,
  defaultTools,
  defaultUi,
  defaultConfig,
  selectActiveTool,
  selectIsModalOpen,
  selectNeedsAttention,
  sanitizeForLog,
} from "./appState.js";
export type {
  AppState,
  SessionSlice,
  ToolInvocation,
  ToolsSlice,
  UiSlice,
  ConfigSlice,
} from "./appState.js";

export {
  sessionReducer,
} from "./sessionReducer.js";

export {
  toolsReducer,
} from "./toolsReducer.js";

export {
  uiReducer,
} from "./uiReducer.js";

export {
  configReducer,
} from "./configReducer.js";

export {
  attachSideEffects,
  attachSideEffectsWithAction,
  attachKeyedEffects,
  withEffectContext,
} from "./effects.js";
export type { EffectContext, Effect, EffectMap } from "./effects.js";

export {
  Memdir,
  createMemdir,
} from "./memdir.js";

export {
  createSession,
  appendTranscriptLine,
  saveCheckpoint,
  loadLatestCheckpoint,
  readTranscriptTail,
  loadSessionMeta,
  listSessions,
  findLatestResumableSession,
  isSessionHealthy,
  continueSession,
  deleteSession,
  withSessionLock,
} from "./history.js";
export type { SessionMeta, TranscriptLine, Checkpoint, LoadResult } from "./history.js";

export {
  migrations,
  CURRENT_SCHEMA_VERSION,
  runMigrations,
  atomicWriteJson,
  migrateWithBackup,
  loadAndMigrateConfig,
  getDefaultConfigPath,
} from "./migrations.js";
export type { Migration } from "./migrations.js";

export {
  PERSIST_DEBOUNCE_MS,
  shouldPersistConfig,
  shouldTouchSessionMeta,
  shouldPersistUi,
  ephemeralSlices,
  DEFAULT_PERSIST_POLICY,
} from "./persistence.js";
export type { PersistPolicy } from "./persistence.js";

export {
  createSessionMetaSyncEffect,
  resetSessionMetaSync,
  SYNC_SESSION_META_DEBOUNCE_MS,
} from "./session-meta-sync.js";

export {
  generateCheckpointId,
  parseCheckpointId,
  isValidCheckpointId,
  extractCheckpointTimestamp,
  CheckpointType,
} from "./checkpoint-id.js";
export type { CheckpointIdParts } from "./checkpoint-id.js";

export {
  getDefaultPersistenceConfig,
  ensurePersistenceDirs,
  atomicWriteSettings,
  loadSettings,
  registerExitFlush,
  rotateLogs,
  ensurePrivateDir,
} from "./persistence-manager.js";
export type { PersistenceConfig } from "./persistence-manager.js";
