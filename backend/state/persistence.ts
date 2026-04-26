import type { AppState } from "./appState.js";

export const PERSIST_DEBOUNCE_MS = 400;

export function shouldPersistConfig(prev: AppState, next: AppState): boolean {
  return prev.config !== next.config;
}

export function shouldTouchSessionMeta(prev: AppState, next: AppState): boolean {
  return (
    prev.session.sessionId !== next.session.sessionId ||
    prev.session.cwd !== next.session.cwd
  );
}

export function shouldPersistUi(prev: AppState, next: AppState): boolean {
  return prev.ui.theme !== next.ui.theme || prev.ui.layout !== next.ui.layout;
}

export function ephemeralSlices(): (keyof AppState)[] {
  return ["tools"];
}

export interface PersistPolicy {
  config: boolean;
  sessionMeta: boolean;
  ui: boolean;
  memdir: boolean;
}

export const DEFAULT_PERSIST_POLICY: PersistPolicy = {
  config: true,
  sessionMeta: true,
  ui: true,
  memdir: false,
};
