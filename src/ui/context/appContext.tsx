import { createContext, useContext, type ReactNode } from 'react'

export interface AppContextValue {
  mode: 'chat' | 'edit' | 'search' | 'help'
  theme: 'light' | 'dark' | 'system'
  isLoading: boolean
  isProcessing: boolean
}

export const AppContext = createContext<AppContextValue>({
  mode: 'chat',
  theme: 'system',
  isLoading: false,
  isProcessing: false,
})

export function useAppContext(): AppContextValue {
  return useContext(AppContext)
}

export function useIsLoading(): boolean {
  return useContext(AppContext).isLoading
}

export function useIsProcessing(): boolean {
  return useContext(AppContext).isProcessing
}

export interface AppContextProviderProps {
  value: AppContextValue
  children: ReactNode
}

export function AppContextProvider({ value, children }: AppContextProviderProps) {
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export default AppContext