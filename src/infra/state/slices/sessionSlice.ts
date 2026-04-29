import type { Action, Reducer } from '../types'

export interface SessionSlice {
  sessionId: string
  cwd: string
  model: string
  provider: string
  startedAt: number
  updatedAt: number
  resumedFromCheckpoint?: string
  parentSessionId?: string
  status: 'idle' | 'active' | 'paused' | 'completed' | 'error'
  turn: number
  lastError?: string
}

export const initialSessionState: SessionSlice = {
  sessionId: '',
  cwd: '',
  model: '',
  provider: '',
  startedAt: Date.now(),
  updatedAt: Date.now(),
  status: 'idle',
  turn: 0,
}

export const sessionActions = {
  INIT_SESSION: 'session/INIT_SESSION',
  UPDATE_SESSION: 'session/UPDATE_SESSION',
  SET_STATUS: 'session/SET_STATUS',
  INCREMENT_TURN: 'session/INCREMENT_TURN',
  SET_ERROR: 'session/SET_ERROR',
  CLEAR_ERROR: 'session/CLEAR_ERROR',
  RESUME_FROM_CHECKPOINT: 'session/RESUME_FROM_CHECKPOINT',
  RESET_SESSION: 'session/RESET_SESSION',
} as const

export type SessionActionType = (typeof sessionActions)[keyof typeof sessionActions]

export interface SessionAction extends Action {
  type: SessionActionType
  payload?: Partial<SessionSlice> | string | { checkpointId: string; parentSessionId?: string }
}

export const sessionReducer: Reducer<SessionSlice> = (
  state = initialSessionState,
  action: Action
): SessionSlice => {
  switch (action.type) {
    case sessionActions.INIT_SESSION: {
      const payload = action.payload as Partial<SessionSlice>
      return {
        ...state,
        ...payload,
        startedAt: payload.startedAt ?? Date.now(),
        updatedAt: Date.now(),
        status: 'active',
      }
    }
    case sessionActions.UPDATE_SESSION: {
      const payload = action.payload as Partial<SessionSlice>
      return {
        ...state,
        ...payload,
        updatedAt: Date.now(),
      }
    }
    case sessionActions.SET_STATUS: {
      const status = action.payload as SessionSlice['status']
      return {
        ...state,
        status,
        updatedAt: Date.now(),
      }
    }
    case sessionActions.INCREMENT_TURN: {
      return {
        ...state,
        turn: state.turn + 1,
        updatedAt: Date.now(),
      }
    }
    case sessionActions.SET_ERROR: {
      const error = action.payload as string
      return {
        ...state,
        status: 'error',
        lastError: error,
        updatedAt: Date.now(),
      }
    }
    case sessionActions.CLEAR_ERROR: {
      return {
        ...state,
        lastError: undefined,
        updatedAt: Date.now(),
      }
    }
    case sessionActions.RESUME_FROM_CHECKPOINT: {
      const payload = action.payload as { checkpointId: string; parentSessionId?: string }
      return {
        ...state,
        resumedFromCheckpoint: payload.checkpointId,
        parentSessionId: payload.parentSessionId,
        status: 'active',
        updatedAt: Date.now(),
      }
    }
    case sessionActions.RESET_SESSION: {
      return {
        ...initialSessionState,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      }
    }
    default:
      return state
  }
}

export const sessionActionCreators = {
  initSession: (payload: Partial<SessionSlice>): SessionAction => ({
    type: sessionActions.INIT_SESSION,
    payload,
  }),
  updateSession: (payload: Partial<SessionSlice>): SessionAction => ({
    type: sessionActions.UPDATE_SESSION,
    payload,
  }),
  setStatus: (status: SessionSlice['status']): SessionAction => ({
    type: sessionActions.SET_STATUS,
    payload: status,
  }),
  incrementTurn: (): SessionAction => ({
    type: sessionActions.INCREMENT_TURN,
  }),
  setError: (error: string): SessionAction => ({
    type: sessionActions.SET_ERROR,
    payload: error,
  }),
  clearError: (): SessionAction => ({
    type: sessionActions.CLEAR_ERROR,
  }),
  resumeFromCheckpoint: (checkpointId: string, parentSessionId?: string): SessionAction => ({
    type: sessionActions.RESUME_FROM_CHECKPOINT,
    payload: { checkpointId, parentSessionId },
  }),
  resetSession: (): SessionAction => ({
    type: sessionActions.RESET_SESSION,
  }),
}
