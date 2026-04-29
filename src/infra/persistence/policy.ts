import type { AppState } from '../state/appState'
import type { ConfigSlice } from '../state/slices/configSlice'
import type { SessionSlice } from '../state/slices/sessionSlice'
import type { UiSlice } from '../state/slices/uiSlice'

export type PersistenceCategory = 'persistent' | 'session' | 'ephemeral'

export interface PersistencePolicy {
  shouldPersist: boolean
  debounceMs: number
  category: PersistenceCategory
}

export const PERSIST_DEBOUNCE_MS = 400
export const SESSION_META_DEBOUNCE_MS = 200
export const UI_PERSIST_DEBOUNCE_MS = 500

export function getPersistencePolicyForSlice(slice: keyof AppState): PersistencePolicy {
  switch (slice) {
    case 'config':
      return { shouldPersist: true, debounceMs: PERSIST_DEBOUNCE_MS, category: 'persistent' }
    case 'session':
      return { shouldPersist: true, debounceMs: SESSION_META_DEBOUNCE_MS, category: 'session' }
    case 'ui':
      return { shouldPersist: true, debounceMs: UI_PERSIST_DEBOUNCE_MS, category: 'persistent' }
    case 'tools':
      return { shouldPersist: false, debounceMs: 0, category: 'ephemeral' }
    default:
      return { shouldPersist: false, debounceMs: 0, category: 'ephemeral' }
  }
}

export function shouldPersistConfig(prev: AppState, next: AppState): boolean {
  return prev.config !== next.config
}

export function shouldPersistSessionMeta(prev: AppState, next: AppState): boolean {
  return (
    prev.session.sessionId !== next.session.sessionId ||
    prev.session.cwd !== next.session.cwd ||
    prev.session.model !== next.session.model ||
    prev.session.status !== next.session.status
  )
}

export function shouldPersistUi(prev: AppState, next: AppState): boolean {
  return prev.ui !== next.ui
}

export interface PersistableConfig {
  schemaVersion: number
  permissionMode: ConfigSlice['permissionMode']
  approvalPolicy: ConfigSlice['approvalPolicy']
  defaultModel: string
  defaultProvider: string
  maxTurns: number
  maxTokens: number
  budgetLimitUsd?: number
  experimental: ConfigSlice['experimental']
  customInstructions?: string
}

export function extractPersistableConfig(config: ConfigSlice): PersistableConfig {
  return {
    schemaVersion: config.schemaVersion,
    permissionMode: config.permissionMode,
    approvalPolicy: config.approvalPolicy,
    defaultModel: config.defaultModel,
    defaultProvider: config.defaultProvider,
    maxTurns: config.maxTurns,
    maxTokens: config.maxTokens,
    budgetLimitUsd: config.budgetLimitUsd,
    experimental: config.experimental,
    customInstructions: config.customInstructions,
  }
}

export interface PersistableSessionMeta {
  sessionId: string
  cwd: string
  model: string
  provider: string
  startedAt: number
  status: SessionSlice['status']
  turn: number
  resumedFromCheckpoint?: string
  parentSessionId?: string
}

export function extractPersistableSessionMeta(session: SessionSlice): PersistableSessionMeta {
  return {
    sessionId: session.sessionId,
    cwd: session.cwd,
    model: session.model,
    provider: session.provider,
    startedAt: session.startedAt,
    status: session.status,
    turn: session.turn,
    resumedFromCheckpoint: session.resumedFromCheckpoint,
    parentSessionId: session.parentSessionId,
  }
}

export interface PersistableUi {
  theme: UiSlice['theme']
  logLevel: UiSlice['logLevel']
  isCompactMode: boolean
  showTokenUsage: boolean
  showCostSummary: boolean
  verbose: boolean
}

export function extractPersistableUi(ui: UiSlice): PersistableUi {
  return {
    theme: ui.theme,
    logLevel: ui.logLevel,
    isCompactMode: ui.isCompactMode,
    showTokenUsage: ui.showTokenUsage,
    showCostSummary: ui.showCostSummary,
    verbose: ui.verbose,
  }
}

export interface PersistedState {
  config?: PersistableConfig
  session?: PersistableSessionMeta
  ui?: PersistableUi
  version: number
  persistedAt: number
}

export const PERSISTED_STATE_VERSION = 1

export function createPersistedState(state: AppState): PersistedState {
  return {
    config: extractPersistableConfig(state.config),
    session: extractPersistableSessionMeta(state.session),
    ui: extractPersistableUi(state.ui),
    version: PERSISTED_STATE_VERSION,
    persistedAt: Date.now(),
  }
}

export function ephemeralSlices(): (keyof AppState)[] {
  return ['tools']
}

export function sessionOnlySlices(): (keyof AppState)[] {
  return []
}

export function persistentSlices(): (keyof AppState)[] {
  return ['config', 'ui']
}
