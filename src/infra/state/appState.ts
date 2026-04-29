import type { Action, Reducer, Store } from './types'
import { createStore, combineReducers } from './createStore'
import {
  sessionReducer,
  initialSessionState,
  SessionSlice,
  sessionActionCreators,
} from './slices/sessionSlice'
import {
  toolsReducer,
  initialToolsState,
  ToolsSlice,
  toolsActionCreators,
} from './slices/toolsSlice'
import { uiReducer, initialUiState, UiSlice, uiActionCreators } from './slices/uiSlice'
import {
  configReducer,
  initialConfigState,
  ConfigSlice,
  configActionCreators,
  CURRENT_SCHEMA_VERSION,
} from './slices/configSlice'

export interface AppState {
  session: SessionSlice
  tools: ToolsSlice
  ui: UiSlice
  config: ConfigSlice
}

export const initialAppState: AppState = {
  session: initialSessionState,
  tools: initialToolsState,
  ui: initialUiState,
  config: initialConfigState,
}

export const appReducer = combineReducers({
  session: sessionReducer,
  tools: toolsReducer,
  ui: uiReducer,
  config: configReducer,
})

export function createAppStore(preloadedState?: Partial<AppState>): Store<AppState> {
  const initialState: AppState = {
    ...initialAppState,
    ...preloadedState,
  }
  return createStore(appReducer, initialState)
}

export const actionCreators = {
  session: sessionActionCreators,
  tools: toolsActionCreators,
  ui: uiActionCreators,
  config: configActionCreators,
}

export {
  sessionReducer,
  toolsReducer,
  uiReducer,
  configReducer,
  CURRENT_SCHEMA_VERSION,
}

export type { SessionSlice, ToolsSlice, UiSlice, ConfigSlice, Action, Reducer, Store }
