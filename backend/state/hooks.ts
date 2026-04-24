import { useCallback, useContext, useSyncExternalStore } from "react";
import type { AppStateStore } from "./react-store.js";
import { AppStateStoreContext } from "./context.js";

export function useSyncExternalStoreSelector<
  T extends Record<string, unknown>,
  S,
>(
  store: AppStateStore<T>,
  selector: (state: T) => S,
  equalityFn: (a: S, b: S) => boolean = Object.is
): S {
  const getSnapshot = useCallback(() => selector(store.get()), [store, selector]);
  const getServerSnapshot = useCallback(() => selector(store.get()), [store, selector]);

  return useSyncExternalStore(
    useCallback(
      (callback) => {
        return store.subscribe(callback);
      },
      [store]
    ),
    getSnapshot,
    getServerSnapshot
  );
}

export function useStoreSelector<T extends Record<string, unknown>, S>(
  selector: (state: T) => S,
  equalityFn: (a: S, b: S) => boolean = Object.is
): S {
  const store = useContext(AppStateStoreContext);
  if (!store) {
    throw new Error(
      "useStoreSelector must be used within an AppStateStoreProvider"
    );
  }

  return useSyncExternalStoreSelector(store as AppStateStore<T>, selector, equalityFn);
}

export function useStore<T extends Record<string, unknown>>(): AppStateStore<T> {
  const store = useContext(AppStateStoreContext);
  if (!store) {
    throw new Error("useStore must be used within an AppStateStoreProvider");
  }
  return store as AppStateStore<T>;
}

export function useStoreState<T extends Record<string, unknown>>(
  selector?: (state: T) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is
): T {
  const store = useStore<T>();
  if (!selector) {
    return useSyncExternalStore(
      useCallback((cb) => store.subscribe(cb), [store]),
      () => store.get(),
      () => store.get()
    );
  }
  return useSyncExternalStoreSelector(store, selector, equalityFn);
}

export function useSetStoreState<T extends Record<string, unknown>>(): (value: T | ((prev: T) => T)) => void {
  const store = useStore<T>();
  return useCallback(
    (value: T | ((prev: T) => T)) => {
      store.set(value);
    },
    [store]
  );
}

export function useStoreAction<T extends Record<string, unknown>>(): {
  setState: (value: T | ((prev: T) => T)) => void;
  update: (updater: (prev: T) => T) => void;
  getState: () => T;
} {
  const store = useStore<T>();
  return {
    setState: useCallback(
      (value: T | ((prev: T) => T)) => {
        store.set(value);
      },
      [store]
    ),
    update: useCallback(
      (updater: (prev: T) => T) => {
        store.update(updater);
      },
      [store]
    ),
    getState: useCallback(() => store.get(), [store]),
  };
}

export interface StoreSlice<T> {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => T;
}

export function createStoreSlice<T extends Record<string, unknown>, K extends keyof T>(
  store: AppStateStore<T>,
  key: K
): StoreSlice<T[K]> {
  return {
    subscribe: (callback: () => void) => {
      return store.subscribe(() => {
        callback();
      });
    },
    getSnapshot: () => store.get()[key],
  };
}

export function useStoreSlice<T extends Record<string, unknown>, K extends keyof T>(
  key: K
): T[K] {
  const store = useStore<T>();
  return useSyncExternalStoreSelector(
    store,
    (state) => state[key],
    Object.is
  );
}

export function useStoreWithSelector<T extends Record<string, unknown>, S>(
  selector: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is
): S {
  const store = useStore<T>();
  return useSyncExternalStoreSelector(store, selector, isEqual);
}

export function useMultipleStoreSelectors<T extends Record<string, unknown>, S1, S2>(
  selector1: (state: T) => S1,
  selector2: (state: T) => S2,
  isEqual1: (a: S1, b: S1) => boolean = Object.is,
  isEqual2: (a: S2, b: S2) => boolean = Object.is
): [S1, S2] {
  const value1 = useStoreWithSelector(selector1, isEqual1);
  const value2 = useStoreWithSelector(selector2, isEqual2);
  return [value1, value2];
}

export function useMultipleStoreSelectorsArr<T extends Record<string, unknown>, S>(
  selectors: ((state: T) => S)[]
): S[] {
  return selectors.map((selector) => useStoreWithSelector(selector));
}
