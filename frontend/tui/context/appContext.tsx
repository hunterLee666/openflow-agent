import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { z } from 'zod';

export const AppContextModeSchema = z.enum(['chat', 'edit', 'search', 'help']);
export type AppContextMode = z.infer<typeof AppContextModeSchema>;

export const AppContextThemeSchema = z.enum(['light', 'dark', 'system']);
export type AppContextTheme = z.infer<typeof AppContextThemeSchema>;

export const AppContextValueSchema = z.object({
  mode: AppContextModeSchema,
  theme: AppContextThemeSchema,
  isLoading: z.boolean(),
  isProcessing: z.boolean(),
  toolExecutionCount: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  sessionId: z.string().optional(),
});
export type AppContextValue = z.infer<typeof AppContextValueSchema>;

export interface AppStateStore {
  getState(): AppContextValue;
  setState(updater: (prev: AppContextValue) => AppContextValue): void;
  subscribe(listener: () => void): () => void;
}

export function createAppStateStore(initialState: Partial<AppContextValue> = {}): AppStateStore {
  const validated = AppContextValueSchema.safeParse({
    mode: 'chat',
    theme: 'system',
    isLoading: false,
    isProcessing: false,
    toolExecutionCount: 0,
    ...initialState,
  });

  let state: AppContextValue = validated.success ? validated.data : {
    mode: 'chat',
    theme: 'system',
    isLoading: false,
    isProcessing: false,
    toolExecutionCount: 0,
  };

  const listeners = new Set<() => void>();

  return {
    getState() {
      return state;
    },
    setState(updater) {
      const newState = updater(state);
      const validatedNew = AppContextValueSchema.safeParse(newState);
      if (validatedNew.success && validatedNew.data !== state) {
        state = validatedNew.data;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const AppContext = createContext<AppStateStore | null>(null);

export function useAppStore(): AppStateStore {
  const store = useContext(AppContext);
  if (!store) {
    throw new Error('useAppStore must be used within AppContextProvider');
  }
  return store;
}

export function useAppState<T>(selector: (state: AppContextValue) => T): T {
  const store = useAppStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}

export function useAppContext(): AppContextValue {
  return useAppState((state) => state);
}

export function useIsLoading(): boolean {
  return useAppState((state) => state.isLoading);
}

export function useIsProcessing(): boolean {
  return useAppState((state) => state.isProcessing);
}

export interface AppContextProviderProps {
  initialState?: Partial<AppContextValue>;
  children: ReactNode;
}

export function AppContextProvider({ initialState, children }: AppContextProviderProps) {
  const store = createAppStateStore(initialState);
  return (
    <AppContext.Provider value={store}>
      {children}
    </AppContext.Provider>
  );
}

export default AppContext;
