import React from "react";
import type { AppStateStore } from "./react-store.js";

export const AppStateStoreContext = React.createContext<AppStateStore<Record<string, unknown>> | null>(null);

interface AppStateStoreProviderProps {
  children: React.ReactNode;
  store: AppStateStore<Record<string, unknown>>;
}

export function AppStateStoreProvider({
  children,
  store,
}: AppStateStoreProviderProps): React.ReactNode {
  return (
    <AppStateStoreContext.Provider value={store}>
      {children}
    </AppStateStoreContext.Provider>
  );
}

export function useAppStateStoreContext(): AppStateStore<Record<string, unknown>> | null {
  return React.useContext(AppStateStoreContext);
}
