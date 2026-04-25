import type { Action, Reducer } from "./createStore.js";
import type { SessionSlice } from "./appState.js";
import { defaultSession } from "./appState.js";

export const sessionReducer: Reducer<SessionSlice> = (
  state = defaultSession,
  action: Action
): SessionSlice => {
  switch (action.type) {
    case "session/SET_ID":
      return { ...state, sessionId: action.payload as string };

    case "session/SET_CWD":
      return { ...state, cwd: action.payload as string };

    case "session/SET_STARTED_AT":
      return { ...state, startedAt: action.payload as number };

    case "session/SET_LAST_USER_MESSAGE":
      return { ...state, lastUserMessageAt: action.payload as number };

    case "session/SET_RESUMED_FROM_CHECKPOINT":
      return { ...state, resumedFromCheckpoint: action.payload as string };

    case "session/RESET":
      return { ...defaultSession, sessionId: (action.payload as string) ?? defaultSession.sessionId };

    default:
      return state;
  }
};
