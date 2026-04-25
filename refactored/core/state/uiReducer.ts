import type { Action, Reducer } from "./createStore.js";
import type { UiSlice } from "./appState.js";
import { defaultUi } from "./appState.js";

export const uiReducer: Reducer<UiSlice> = (
  state = defaultUi,
  action: Action
): UiSlice => {
  switch (action.type) {
    case "ui/SET_THEME":
      return { ...state, theme: action.payload as UiSlice["theme"] };

    case "ui/SET_LAYOUT":
      return { ...state, layout: action.payload as UiSlice["layout"] };

    case "ui/PUSH_MODAL": {
      const name = action.payload as string;
      return { ...state, modalStack: [...state.modalStack, name] };
    }

    case "ui/POP_MODAL":
      return {
        ...state,
        modalStack: state.modalStack.slice(0, -1),
      };

    case "ui/CLEAR_MODALS":
      return { ...state, modalStack: [] };

    case "ui/SET_FOCUS_PANE":
      return { ...state, focusPaneId: action.payload as string | undefined };

    default:
      return state;
  }
};
