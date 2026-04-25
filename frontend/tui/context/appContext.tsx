import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'

export interface AppContextValue {
  mode: 'chat' | 'edit' | 'search' | 'help'
  theme: 'light' | 'dark' | 'system'
  isLoading: boolean
  isProcessing: boolean
  toolExecutionCount: number
  lastError?: string
  sessionId?: string
}

export interface AppStateStore {
  getState(): AppContextValue
  setState(updater: (prev: AppContextValue) => AppContextValue): void
  subscribe(listener: () => void): () => void
}

export function createAppStateStore(initialState: Partial<AppContextValue> = {}): AppStateStore {
  let state: AppContextValue = {
    mode: 'chat',
    theme: 'system',
    isLoading: false,
    isProcessing: false,
    toolExecutionCount: 0,
    ...initialState,
  }

  const listeners = new Set<() => void>()

  return {
    getState() {
      return state
    },
    setState(updater) {
      const newState = updater(state)
      if (newState !== state) {
        state = newState
        listeners.forEach((listener) => listener())
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const AppContext = createContext<AppStateStore | null>(null)

export function useAppStore(): AppStateStore {
  const store = useContext(AppContext)
  if (!store) {
    throw new Error('useAppStore must be used within AppContextProvider')
  }
  return store
}

export function useAppState<T>(selector: (state: AppContextValue) => T): T {
  const store = useAppStore()
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  )
}

export function useAppContext(): AppContextValue {
  return useAppState((state) => state)
}

export function useIsLoading(): boolean {
  return useAppState((state) => state.isLoading)
}

export function useIsProcessing(): boolean {
  return useAppState((state) => state.isProcessing)
}

export function useTheme(): AppContextValue['theme'] {
  return useAppState((state) => state.theme)
}

export function useMode(): AppContextValue['mode'] {
  return useAppState((state) => state.mode)
}

export interface AppContextProviderProps {
  store: AppStateStore
  children: ReactNode
}

export function AppContextProvider({ store, children }: AppContextProviderProps) {
  return (
    <AppContext.Provider value={store}>
      {children}
    </AppContext.Provider>
  )
}

export default AppContext
