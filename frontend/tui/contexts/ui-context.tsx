import React, { createContext, useContext, useReducer, useCallback } from 'react';

export type ThemeName = 'default' | 'one-dark' | 'monokai' | 'dracula' | 'nord' | 'solarized';

export interface UIState {
  isSidebarOpen: boolean;
  isPaletteOpen: boolean;
  isHelpOpen: boolean;
  isSettingsOpen: boolean;
  isLoading: boolean;
  currentTheme: ThemeName;
  inputValue: string;
  isStreaming: boolean;
}

type UIAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'TOGGLE_PALETTE' }
  | { type: 'SET_PALETTE'; payload: boolean }
  | { type: 'TOGGLE_HELP' }
  | { type: 'SET_HELP'; payload: boolean }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'SET_SETTINGS'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_THEME'; payload: ThemeName }
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'SET_STREAMING'; payload: boolean };

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarOpen: !state.isSidebarOpen };
    case 'SET_SIDEBAR':
      return { ...state, isSidebarOpen: action.payload };
    case 'TOGGLE_PALETTE':
      return { ...state, isPaletteOpen: !state.isPaletteOpen };
    case 'SET_PALETTE':
      return { ...state, isPaletteOpen: action.payload };
    case 'TOGGLE_HELP':
      return { ...state, isHelpOpen: !state.isHelpOpen };
    case 'SET_HELP':
      return { ...state, isHelpOpen: action.payload };
    case 'TOGGLE_SETTINGS':
      return { ...state, isSettingsOpen: !state.isSettingsOpen };
    case 'SET_SETTINGS':
      return { ...state, isSettingsOpen: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_THEME':
      return { ...state, currentTheme: action.payload };
    case 'SET_INPUT':
      return { ...state, inputValue: action.payload };
    case 'SET_STREAMING':
      return { ...state, isStreaming: action.payload };
    default:
      return state;
  }
}

const initialState: UIState = {
  isSidebarOpen: true,
  isPaletteOpen: false,
  isHelpOpen: false,
  isSettingsOpen: false,
  isLoading: false,
  currentTheme: 'default',
  inputValue: '',
  isStreaming: false,
};

interface UIContextType {
  state: UIState;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  togglePalette: () => void;
  setPalette: (open: boolean) => void;
  toggleHelp: () => void;
  setHelp: (open: boolean) => void;
  toggleSettings: () => void;
  setSettings: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  setInput: (value: string) => void;
  setStreaming: (streaming: boolean) => void;
}

const UIContext = createContext<UIContextType | null>(null);

export const useUIContext = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUIContext must be used within a UIProvider');
  }
  return context;
};

interface UIProviderProps {
  children: React.ReactNode;
}

export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  const toggleSidebar = useCallback(() => dispatch({ type: 'TOGGLE_SIDEBAR' }), []);
  const setSidebar = useCallback((open: boolean) => dispatch({ type: 'SET_SIDEBAR', payload: open }), []);
  const togglePalette = useCallback(() => dispatch({ type: 'TOGGLE_PALETTE' }), []);
  const setPalette = useCallback((open: boolean) => dispatch({ type: 'SET_PALETTE', payload: open }), []);
  const toggleHelp = useCallback(() => dispatch({ type: 'TOGGLE_HELP' }), []);
  const setHelp = useCallback((open: boolean) => dispatch({ type: 'SET_HELP', payload: open }), []);
  const toggleSettings = useCallback(() => dispatch({ type: 'TOGGLE_SETTINGS' }), []);
  const setSettings = useCallback((open: boolean) => dispatch({ type: 'SET_SETTINGS', payload: open }), []);
  const setLoading = useCallback((loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }), []);
  const setTheme = useCallback((theme: ThemeName) => dispatch({ type: 'SET_THEME', payload: theme }), []);
  const setInput = useCallback((value: string) => dispatch({ type: 'SET_INPUT', payload: value }), []);
  const setStreaming = useCallback((streaming: boolean) => dispatch({ type: 'SET_STREAMING', payload: streaming }), []);

  const value: UIContextType = {
    state,
    toggleSidebar,
    setSidebar,
    togglePalette,
    setPalette,
    toggleHelp,
    setHelp,
    toggleSettings,
    setSettings,
    setLoading,
    setTheme,
    setInput,
    setStreaming,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
