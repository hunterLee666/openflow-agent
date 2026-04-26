import type { AppState } from "./appState.js";
import type { Store, Action } from "./createStore.js";

export type EffectContext = {
  action: Action;
  prev: AppState;
  next: AppState;
};

export type Effect = (ctx: EffectContext) => void | Promise<void>;

export type EffectMap = Partial<Record<string, Effect[]>>;

export function attachSideEffects(
  store: Store<AppState>,
  effects: Effect[]
): () => void {
  let prev = store.getState();

  return store.subscribe(() => {
    const next = store.getState();
    const ctx: EffectContext = {
      action: { type: "@@/UNKNOWN" },
      prev,
      next,
    };
    for (const fx of effects) {
      void Promise.resolve(fx(ctx)).catch((e) => {
        console.error("[effect]", e);
      });
    }
    prev = next;
  });
}

export function attachSideEffectsWithAction(
  store: Store<AppState>,
  effects: Effect[],
  getLastAction: () => Action
): () => void {
  let prev = store.getState();

  return store.subscribe(() => {
    const next = store.getState();
    const action = getLastAction();
    const ctx: EffectContext = { action, prev, next };
    for (const fx of effects) {
      void Promise.resolve(fx(ctx)).catch((e) => {
        console.error("[effect]", e);
      });
    }
    prev = next;
  });
}

export function attachKeyedEffects(
  store: Store<AppState>,
  map: EffectMap,
  getLastAction: () => Action
): () => void {
  let prev = store.getState();

  return store.subscribe(() => {
    const next = store.getState();
    const action = getLastAction();
    const list = map[action.type] ?? map["*"] ?? [];
    const ctx: EffectContext = { action, prev, next };
    for (const fx of list) {
      void Promise.resolve(fx(ctx)).catch(console.error);
    }
    prev = next;
  });
}

export function withEffectContext(store: Store<AppState>): Store<AppState> & {
  getLastAction: () => Action;
} {
  const raw = store.dispatch.bind(store);
  let last: Action = { type: "@@/INIT" };

  const enhancedDispatch = (action: Action): Action => {
    last = action;
    return raw(action);
  };

  return {
    ...store,
    dispatch: enhancedDispatch,
    getLastAction: () => last,
  };
}
