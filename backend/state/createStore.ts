import { z } from "zod";

export const ActionSchema = z.object({
  type: z.string(),
  payload: z.unknown().optional(),
});

export type Action = z.infer<typeof ActionSchema>;

export type Reducer<S> = (state: S | undefined, action: Action) => S;

export type Listener = () => void;

export const StoreInterfaceSchema = z.object({
  getState: z.function().returns(z.unknown()),
  dispatch: z.function().args(ActionSchema).returns(ActionSchema),
  subscribe: z.function().args(z.function().returns(z.void())).returns(z.function().returns(z.void())),
  replaceReducer: z.function().args(z.function()),
});

export interface Store<S> {
  getState: () => S;
  dispatch: (action: Action) => Action;
  subscribe: (listener: Listener) => () => void;
  replaceReducer: (next: Reducer<S>) => void;
}

export function createStore<S>(
  reducer: Reducer<S>,
  preloadedState?: S
): Store<S> {
  let state = preloadedState as S;
  let currentReducer = reducer;
  const listeners = new Set<Listener>();
  let isDispatching = false;

  function getState(): S {
    if (isDispatching) {
      throw new Error("Cannot dispatch while dispatching");
    }
    return state;
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispatch(action: Action): Action {
    if (isDispatching) {
      throw new Error("Cannot dispatch while dispatching");
    }
    try {
      isDispatching = true;
      state = currentReducer(state, action);
    } finally {
      isDispatching = false;
    }
    listeners.forEach((l) => l());
    return action;
  }

  function replaceReducer(next: Reducer<S>): void {
    currentReducer = next;
    dispatch({ type: "@@/REPLACE" });
  }

  dispatch({ type: "@@/INIT" });
  return { getState, dispatch, subscribe, replaceReducer };
}

export function combineReducers<S extends Record<string, unknown>>(
  map: { [K in keyof S]: Reducer<S[K]> }
): Reducer<S> {
  return (state, action) => {
    const next = {} as S;
    let changed = false;
    (Object.keys(map) as (keyof S)[]).forEach((key) => {
      const prevSlice = state?.[key];
      const nextSlice = map[key](prevSlice, action);
      next[key] = nextSlice;
      if (nextSlice !== prevSlice) changed = true;
    });
    return changed ? next : (state as S);
  };
}

export function composeReducers<S>(
  ...reducers: Reducer<S>[]
): Reducer<S> {
  return (state: S | undefined, action: Action): S => {
    return reducers.reduce((s, r) => r(s, action), state) as S;
  };
}

export function applyMiddleware<S>(
  store: Store<S>,
  ...middlewares: Array<(store: Store<S>, action: Action) => Action | void>
): Store<S> {
  const rawDispatch = store.dispatch.bind(store);

  const enhancedDispatch = (action: Action): Action => {
    let result: Action | void = undefined;
    for (const mw of middlewares) {
      result = mw(store, action);
      if (result) break;
    }
    return result ?? rawDispatch(action);
  };

  return {
    ...store,
    dispatch: enhancedDispatch,
  };
}
