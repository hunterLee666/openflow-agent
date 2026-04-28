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

type ToolCallItem = {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  result?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
};

type SessionAction =
  | { type: 'SET_SESSIONS'; payload: Session[] }
  | { type: 'ADD_SESSION'; payload: Session }
  | { type: 'UPDATE_SESSION'; payload: { id: string; updates: Partial<Session> } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_ACTIVE_SESSION'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { sessionId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { sessionId: string; messageId: number; updates: Partial<Message> } }
  | { type: 'SET_SESSION_MESSAGES'; payload: { sessionId: string; messages: Message[] } }
  | { type: 'ADD_TOOL_CALL'; payload: { sessionId: string; messageId: number; toolCall: ToolCallItem } }
  | { type: 'UPDATE_TOOL_CALL'; payload: { sessionId: string; messageId: number; toolCallId: string; updates: Partial<ToolCallItem> } }
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

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                messages: s.messages.map((m, i) =>
                  i === action.payload.messageId ? { ...m, ...action.payload.updates } : m
                ),
                updatedAt: Date.now(),
              }
            : s
        ),
      };

    case 'SET_SESSION_MESSAGES':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, messages: action.payload.messages, updatedAt: Date.now() }
            : s
        ),
      };

    case 'ADD_TOOL_CALL':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                messages: s.messages.map((m, i) =>
                  i === action.payload.messageId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), action.payload.toolCall] }
                    : m
                ),
                updatedAt: Date.now(),
              }
            : s
        ),
      };

    case 'UPDATE_TOOL_CALL':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                messages: s.messages.map((m, i) =>
                  i === action.payload.messageId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc: any) =>
                          tc.id === action.payload.toolCallId ? { ...tc, ...action.payload.updates } : tc
                        ),
                      }
                    : m
                ),
                updatedAt: Date.now(),
              }
            : s
        ),
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
  updateMessage: (sessionId: string, messageId: number, updates: Partial<Message>) => void;
  setSessions: (sessions: Session[]) => void;
  loadSessionMessages: (sessionId: string, messages: Message[]) => void;
  addToolCall: (sessionId: string, messageId: number, toolCall: ToolCallItem) => void;
  updateToolCall: (sessionId: string, messageId: number, toolCallId: string, updates: Partial<ToolCallItem>) => void;
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
    dispatch({ type: 'SET_ACTIVE_SESSION', payload: newSession.id });
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

  const updateMessage = useCallback((sessionId: string, messageId: number, updates: Partial<Message>) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { sessionId, messageId, updates } });
  }, []);

  const setSessions = useCallback((sessions: Session[]) => {
    dispatch({ type: 'SET_SESSIONS', payload: sessions });
  }, []);

  const loadSessionMessages = useCallback((sessionId: string, messages: Message[]) => {
    dispatch({ type: 'SET_SESSION_MESSAGES', payload: { sessionId, messages } });
  }, []);

  const addToolCall = useCallback((sessionId: string, messageId: number, toolCall: ToolCallItem) => {
    dispatch({ type: 'ADD_TOOL_CALL', payload: { sessionId, messageId, toolCall } });
  }, []);

  const updateToolCall = useCallback((sessionId: string, messageId: number, toolCallId: string, updates: Partial<ToolCallItem>) => {
    dispatch({ type: 'UPDATE_TOOL_CALL', payload: { sessionId, messageId, toolCallId, updates } });
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
    updateMessage,
    setSessions,
    loadSessionMessages,
    addToolCall,
    updateToolCall,
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
