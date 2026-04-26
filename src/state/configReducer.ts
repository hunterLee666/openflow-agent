import type { Action, Reducer } from "./createStore.js";
import type { ConfigSlice } from "./appState.js";
import { defaultConfig } from "./appState.js";

export const configReducer: Reducer<ConfigSlice> = (
  state = defaultConfig,
  action: Action
): ConfigSlice => {
  switch (action.type) {
    case "config/SET_MODEL":
      return { ...state, model: action.payload as string };

    case "config/SET_APPROVAL_POLICY":
      return { ...state, approvalPolicy: action.payload as ConfigSlice["approvalPolicy"] };

    case "config/SET_EXPERIMENTAL": {
      const { key, value } = action.payload as { key: string; value: boolean };
      return {
        ...state,
        experimental: { ...state.experimental, [key]: value },
      };
    }

    case "config/PATCH": {
      const patch = action.payload as Partial<ConfigSlice>;
      return {
        ...state,
        ...patch,
        experimental: { ...state.experimental, ...(patch.experimental ?? {}) },
      };
    }

    case "config/SET_SCHEMA_VERSION":
      return { ...state, schemaVersion: action.payload as number };

    default:
      return state;
  }
};
