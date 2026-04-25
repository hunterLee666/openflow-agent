import { createStore, combineReducers, type Reducer, type Store } from "./createStore.js";
import {
  type AppState,
  defaultSession,
  defaultTools,
  defaultUi,
  defaultConfig,
} from "./appState.js";
import { sessionReducer } from "./sessionReducer.js";
import { toolsReducer } from "./toolsReducer.js";
import { uiReducer } from "./uiReducer.js";
import { configReducer } from "./configReducer.js";

const appReducer: Reducer<AppState> = combineReducers({
  session: sessionReducer,
  tools: toolsReducer,
  ui: uiReducer,
  config: configReducer,
});

export function createAppStore(preloaded?: Partial<AppState>): Store<AppState> {
  const initial: AppState = {
    session: { ...defaultSession, ...(preloaded?.session ?? {}) },
    tools: { ...defaultTools, ...(preloaded?.tools ?? {}) },
    ui: { ...defaultUi, ...(preloaded?.ui ?? {}) },
    config: { ...defaultConfig, ...(preloaded?.config ?? {}) },
  };

  return createStore(appReducer, initial);
}

export { appReducer };
