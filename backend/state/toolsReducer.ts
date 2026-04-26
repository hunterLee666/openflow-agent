import type { Action, Reducer } from "./createStore.js";
import type { ToolsSlice, ToolInvocation } from "./appState.js";
import { defaultTools } from "./appState.js";

export const toolsReducer: Reducer<ToolsSlice> = (
  state = defaultTools,
  action: Action
): ToolsSlice => {
  switch (action.type) {
    case "tools/SET_REGISTRY_VERSION":
      return { ...state, registryVersion: action.payload as string };

    case "tools/INVOCATION_START": {
      const invocation = action.payload as ToolInvocation;
      return { ...state, active: [...state.active, invocation] };
    }

    case "tools/INVOCATION_END": {
      const { id, status, endedAt } = action.payload as {
        id: string;
        status: ToolInvocation["status"];
        endedAt?: number;
      };
      return {
        ...state,
        active: state.active.map((t) =>
          t.id === id ? { ...t, status, endedAt: endedAt ?? Date.now() } : t
        ),
      };
    }

    case "tools/CLEAR_COMPLETED":
      return {
        ...state,
        active: state.active.filter(
          (t) => t.status === "pending" || t.status === "running"
        ),
      };

    case "tools/SET_ERROR":
      return {
        ...state,
        lastError: action.payload as { code: string; message: string },
      };

    case "tools/CLEAR_ERROR":
      return { ...state, lastError: undefined };

    default:
      return state;
  }
};
