import React, { createContext, useContext, useReducer, useCallback } from "react"
import type { ReactNode } from "react"
import type { Message } from "@/types"
import { globalDispatcher, EventTypes } from "@/events"

export interface AppState {
  messages: Message[]
  isStreaming: boolean
  isLoading: boolean
  error: string | null
  sessionId: string | null
  tokenCount: number
  connected: boolean
}

export type AppAction =
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "SET_STREAMING"; payload: boolean }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_SESSION"; payload: string | null }
  | { type: "SET_TOKEN_COUNT"; payload: number }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "CLEAR_MESSAGES" }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_MESSAGE":
      globalDispatcher.dispatch(EventTypes.MESSAGE.RECEIVED, action.payload)
      return {
        ...state,
        messages: [...state.messages, action.payload],
      }
    case "SET_STREAMING":
      return { ...state, isStreaming: action.payload }
    case "SET_LOADING":
      return { ...state, isLoading: action.payload }
    case "SET_ERROR":
      return { ...state, error: action.payload }
    case "SET_SESSION":
      return { ...state, sessionId: action.payload }
    case "SET_TOKEN_COUNT":
      return { ...state, tokenCount: action.payload }
    case "SET_CONNECTED":
      return { ...state, connected: action.payload }
    case "CLEAR_MESSAGES":
      return { ...state, messages: [] }
    default:
      return state
  }
}

const initialState: AppState = {
  messages: [],
  isStreaming: false,
  isLoading: false,
  error: null,
  sessionId: null,
  tokenCount: 0,
  connected: false,
}

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  addMessage: (message: Message) => void
  clearMessages: () => void
  setError: (error: string | null) => void
}

const AppContext = createContext<AppContextType>({
  state: initialState,
  dispatch: () => {},
  addMessage: () => {},
  clearMessages: () => {},
  setError: () => {},
})

export const useAppContext = () => useContext(AppContext)

interface AppProviderProps {
  children: ReactNode
}

export const AppProvider = ({ children }: AppProviderProps) => {
  const [state, dispatch] = useReducer(appReducer, initialState)

  const addMessage = useCallback((message: Message) => {
    dispatch({ type: "ADD_MESSAGE", payload: message })
  }, [])

  const clearMessages = useCallback(() => {
    dispatch({ type: "CLEAR_MESSAGES" })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: error })
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, addMessage, clearMessages, setError }}>
      {children}
    </AppContext.Provider>
  )
}
