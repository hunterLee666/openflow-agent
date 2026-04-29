import type { Action, Reducer } from '../types'

export interface ToolCallState {
  toolId: string
  toolName: string
  status: 'pending' | 'executing' | 'completed' | 'error' | 'approval_required'
  input?: Record<string, unknown>
  output?: unknown
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface ToolsSlice {
  registryVersion: string
  activeCalls: ToolCallState[]
  lastError?: string
  totalCalls: number
  failedCalls: number
}

export const initialToolsState: ToolsSlice = {
  registryVersion: '1.0.0',
  activeCalls: [],
  totalCalls: 0,
  failedCalls: 0,
}

export const toolsActions = {
  REGISTER_TOOL_CALL: 'tools/REGISTER_TOOL_CALL',
  UPDATE_TOOL_CALL: 'tools/UPDATE_TOOL_CALL',
  COMPLETE_TOOL_CALL: 'tools/COMPLETE_TOOL_CALL',
  FAIL_TOOL_CALL: 'tools/FAIL_TOOL_CALL',
  CLEAR_ACTIVE_CALLS: 'tools/CLEAR_ACTIVE_CALLS',
  SET_REGISTRY_VERSION: 'tools/SET_REGISTRY_VERSION',
  SET_LAST_ERROR: 'tools/SET_LAST_ERROR',
  CLEAR_LAST_ERROR: 'tools/CLEAR_LAST_ERROR',
} as const

export type ToolsActionType = (typeof toolsActions)[keyof typeof toolsActions]

export interface ToolsAction extends Action {
  type: ToolsActionType
  payload?: unknown
}

export const toolsReducer: Reducer<ToolsSlice> = (
  state = initialToolsState,
  action: Action
): ToolsSlice => {
  switch (action.type) {
    case toolsActions.REGISTER_TOOL_CALL: {
      const toolCall = action.payload as ToolCallState
      return {
        ...state,
        activeCalls: [...state.activeCalls, toolCall],
        totalCalls: state.totalCalls + 1,
      }
    }
    case toolsActions.UPDATE_TOOL_CALL: {
      const { toolId, updates } = action.payload as {
        toolId: string
        updates: Partial<ToolCallState>
      }
      return {
        ...state,
        activeCalls: state.activeCalls.map((call) =>
          call.toolId === toolId ? { ...call, ...updates } : call
        ),
      }
    }
    case toolsActions.COMPLETE_TOOL_CALL: {
      const { toolId, output } = action.payload as {
        toolId: string
        output?: unknown
      }
      return {
        ...state,
        activeCalls: state.activeCalls.map((call) =>
          call.toolId === toolId
            ? { ...call, status: 'completed' as const, output, completedAt: Date.now() }
            : call
        ),
      }
    }
    case toolsActions.FAIL_TOOL_CALL: {
      const { toolId, error } = action.payload as { toolId: string; error: string }
      return {
        ...state,
        activeCalls: state.activeCalls.map((call) =>
          call.toolId === toolId
            ? { ...call, status: 'error' as const, error, completedAt: Date.now() }
            : call
        ),
        failedCalls: state.failedCalls + 1,
        lastError: error,
      }
    }
    case toolsActions.CLEAR_ACTIVE_CALLS: {
      return {
        ...state,
        activeCalls: [],
      }
    }
    case toolsActions.SET_REGISTRY_VERSION: {
      const version = action.payload as string
      return {
        ...state,
        registryVersion: version,
      }
    }
    case toolsActions.SET_LAST_ERROR: {
      const error = action.payload as string
      return {
        ...state,
        lastError: error,
      }
    }
    case toolsActions.CLEAR_LAST_ERROR: {
      return {
        ...state,
        lastError: undefined,
      }
    }
    default:
      return state
  }
}

export const toolsActionCreators = {
  registerToolCall: (toolCall: ToolCallState): ToolsAction => ({
    type: toolsActions.REGISTER_TOOL_CALL,
    payload: toolCall,
  }),
  updateToolCall: (toolId: string, updates: Partial<ToolCallState>): ToolsAction => ({
    type: toolsActions.UPDATE_TOOL_CALL,
    payload: { toolId, updates },
  }),
  completeToolCall: (toolId: string, output?: unknown): ToolsAction => ({
    type: toolsActions.COMPLETE_TOOL_CALL,
    payload: { toolId, output },
  }),
  failToolCall: (toolId: string, error: string): ToolsAction => ({
    type: toolsActions.FAIL_TOOL_CALL,
    payload: { toolId, error },
  }),
  clearActiveCalls: (): ToolsAction => ({
    type: toolsActions.CLEAR_ACTIVE_CALLS,
  }),
  setRegistryVersion: (version: string): ToolsAction => ({
    type: toolsActions.SET_REGISTRY_VERSION,
    payload: version,
  }),
  setLastError: (error: string): ToolsAction => ({
    type: toolsActions.SET_LAST_ERROR,
    payload: error,
  }),
  clearLastError: (): ToolsAction => ({
    type: toolsActions.CLEAR_LAST_ERROR,
  }),
}
