import type { Action, Reducer } from '../types'

export type ThemeMode = 'light' | 'dark' | 'system'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ModalState {
  type: string
  props?: Record<string, unknown>
  isOpen: boolean
}

export interface UiSlice {
  theme: ThemeMode
  logLevel: LogLevel
  modalStack: ModalState[]
  isCompactMode: boolean
  showTokenUsage: boolean
  showCostSummary: boolean
  verbose: boolean
  lastActivityAt: number
}

export const initialUiState: UiSlice = {
  theme: 'dark',
  logLevel: 'info',
  modalStack: [],
  isCompactMode: false,
  showTokenUsage: true,
  showCostSummary: true,
  verbose: false,
  lastActivityAt: Date.now(),
}

export const uiActions = {
  SET_THEME: 'ui/SET_THEME',
  SET_LOG_LEVEL: 'ui/SET_LOG_LEVEL',
  PUSH_MODAL: 'ui/PUSH_MODAL',
  POP_MODAL: 'ui/POP_MODAL',
  CLOSE_ALL_MODALS: 'ui/CLOSE_ALL_MODALS',
  TOGGLE_COMPACT_MODE: 'ui/TOGGLE_COMPACT_MODE',
  SET_SHOW_TOKEN_USAGE: 'ui/SET_SHOW_TOKEN_USAGE',
  SET_SHOW_COST_SUMMARY: 'ui/SET_SHOW_COST_SUMMARY',
  SET_VERBOSE: 'ui/SET_VERBOSE',
  UPDATE_ACTIVITY: 'ui/UPDATE_ACTIVITY',
} as const

export type UiActionType = (typeof uiActions)[keyof typeof uiActions]

export interface UiAction extends Action {
  type: UiActionType
  payload?: unknown
}

export const uiReducer: Reducer<UiSlice> = (
  state = initialUiState,
  action: Action
): UiSlice => {
  switch (action.type) {
    case uiActions.SET_THEME: {
      const theme = action.payload as ThemeMode
      return { ...state, theme }
    }
    case uiActions.SET_LOG_LEVEL: {
      const logLevel = action.payload as LogLevel
      return { ...state, logLevel }
    }
    case uiActions.PUSH_MODAL: {
      const modal = action.payload as ModalState
      return {
        ...state,
        modalStack: [...state.modalStack, { ...modal, isOpen: true }],
      }
    }
    case uiActions.POP_MODAL: {
      return {
        ...state,
        modalStack: state.modalStack.slice(0, -1),
      }
    }
    case uiActions.CLOSE_ALL_MODALS: {
      return {
        ...state,
        modalStack: [],
      }
    }
    case uiActions.TOGGLE_COMPACT_MODE: {
      return {
        ...state,
        isCompactMode: !state.isCompactMode,
      }
    }
    case uiActions.SET_SHOW_TOKEN_USAGE: {
      const show = action.payload as boolean
      return { ...state, showTokenUsage: show }
    }
    case uiActions.SET_SHOW_COST_SUMMARY: {
      const show = action.payload as boolean
      return { ...state, showCostSummary: show }
    }
    case uiActions.SET_VERBOSE: {
      const verbose = action.payload as boolean
      return { ...state, verbose }
    }
    case uiActions.UPDATE_ACTIVITY: {
      return { ...state, lastActivityAt: Date.now() }
    }
    default:
      return state
  }
}

export const uiActionCreators = {
  setTheme: (theme: ThemeMode): UiAction => ({
    type: uiActions.SET_THEME,
    payload: theme,
  }),
  setLogLevel: (logLevel: LogLevel): UiAction => ({
    type: uiActions.SET_LOG_LEVEL,
    payload: logLevel,
  }),
  pushModal: (modal: ModalState): UiAction => ({
    type: uiActions.PUSH_MODAL,
    payload: modal,
  }),
  popModal: (): UiAction => ({
    type: uiActions.POP_MODAL,
  }),
  closeAllModals: (): UiAction => ({
    type: uiActions.CLOSE_ALL_MODALS,
  }),
  toggleCompactMode: (): UiAction => ({
    type: uiActions.TOGGLE_COMPACT_MODE,
  }),
  setShowTokenUsage: (show: boolean): UiAction => ({
    type: uiActions.SET_SHOW_TOKEN_USAGE,
    payload: show,
  }),
  setShowCostSummary: (show: boolean): UiAction => ({
    type: uiActions.SET_SHOW_COST_SUMMARY,
    payload: show,
  }),
  setVerbose: (verbose: boolean): UiAction => ({
    type: uiActions.SET_VERBOSE,
    payload: verbose,
  }),
  updateActivity: (): UiAction => ({
    type: uiActions.UPDATE_ACTIVITY,
  }),
}
