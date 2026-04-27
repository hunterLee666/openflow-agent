import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { Message } from '../api-types';

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionMetrics {
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  metrics: SessionMetrics;
}

type SessionAction =
  | { type: 'SET_SESSIONS'; payload: Session[] }
  | { type: 'ADD_SESSION'; payload: Session }
  | { type: 'UPDATE_SESSION'; payload: { id: string; updates: Partial<Session> } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_ACTIVE_SESSION'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { sessionId: string; message: Message } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_METRICS'; payload: Partial<SessionMetrics> }
  | { type: 'CLEAR_MESSAGES'; payload: string };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload };

    case 'ADD_SESSION':
      return {
        ...state,
        sessions: [action.payload, ...state.sessions],
        activeSessionId: action.payload.id,
      };

    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      };

    case 'DELETE_SESSION': {
      const newSessions = state.sessions.filter((s) => s.id !== action.payload);
      return {
        ...state,
        sessions: newSessions,
        activeSessionId:
          state.activeSessionId === action.payload
            ? newSessions[0]?.id ?? null
            : state.activeSessionId,
      };
    }

    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.payload };

    case 'ADD_MESSAGE':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                messages: [...s.messages, action.payload.message],
                updatedAt: Date.now(),
              }
            : s
        ),
        metrics: {
          ...state.metrics,
          totalMessages: state.metrics.totalMessages + 1,
        },
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'UPDATE_METRICS':
      return {
        ...state,
        metrics: { ...state.metrics, ...action.payload },
      };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload ? { ...s, messages: [], updatedAt: Date.now() } : s
        ),
      };

    default:
      return state;
  }
}

const initialState: SessionState = {
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  error: null,
  metrics: {
    totalMessages: 0,
    totalTokens: 0,
    totalCost: 0,
  },
};

interface SessionContextType {
  state: SessionState;
  createSession: () => Session;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: Message) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  clearMessages: (sessionId: string) => void;
  getActiveSession: () => Session | null;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const useSessionContext = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
};

interface SessionProviderProps {
  children: React.ReactNode;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  const createSession = useCallback((): Session => {
    const newSession: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: `Session ${state.sessions.length + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch({ type: 'ADD_SESSION', payload: newSession });
    return newSession;
  }, [state.sessions.length]);

  const deleteSession = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SESSION', payload: id });
  }, []);

  const setActiveSession = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_SESSION', payload: id });
  }, []);

  const addMessage = useCallback((sessionId: string, message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { sessionId, message } });
  }, []);

  const updateSession = useCallback((id: string, updates: Partial<Session>) => {
    dispatch({ type: 'UPDATE_SESSION', payload: { id, updates } });
  }, []);

  const clearMessages = useCallback((sessionId: string) => {
    dispatch({ type: 'CLEAR_MESSAGES', payload: sessionId });
  }, []);

  const getActiveSession = useCallback((): Session | null => {
    if (!state.activeSessionId) return null;
    return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
  }, [state.activeSessionId, state.sessions]);

  const value: SessionContextType = {
    state,
    createSession,
    deleteSession,
    setActiveSession,
    addMessage,
    updateSession,
    clearMessages,
    getActiveSession,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
