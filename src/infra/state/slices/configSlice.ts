import type { Action, Reducer } from '../types'

export type PermissionMode = 'ask' | 'auto' | 'dontAsk'
export type ApprovalPolicy = 'ask' | 'auto' | 'never'

export interface ExperimentalFlags {
  enableStreaming?: boolean
  enableCache?: boolean
  enableCompaction?: boolean
  enableMultiAgent?: boolean
  [key: string]: boolean | undefined
}

export interface ConfigSlice {
  schemaVersion: number
  permissionMode: PermissionMode
  approvalPolicy: ApprovalPolicy
  defaultModel: string
  defaultProvider: string
  maxTurns: number
  maxTokens: number
  budgetLimitUsd?: number
  experimental: ExperimentalFlags
  customInstructions?: string
  mcpServers?: Record<string, unknown>
  lastUpdated: number
}

export const CURRENT_SCHEMA_VERSION = 2

export const initialConfigState: ConfigSlice = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  permissionMode: 'ask',
  approvalPolicy: 'ask',
  defaultModel: '',
  defaultProvider: '',
  maxTurns: 100,
  maxTokens: 200000,
  experimental: {
    enableStreaming: true,
    enableCache: true,
    enableCompaction: true,
    enableMultiAgent: false,
  },
  lastUpdated: Date.now(),
}

export const configActions = {
  SET_PERMISSION_MODE: 'config/SET_PERMISSION_MODE',
  SET_APPROVAL_POLICY: 'config/SET_APPROVAL_POLICY',
  SET_DEFAULT_MODEL: 'config/SET_DEFAULT_MODEL',
  SET_DEFAULT_PROVIDER: 'config/SET_DEFAULT_PROVIDER',
  SET_MAX_TURNS: 'config/SET_MAX_TURNS',
  SET_MAX_TOKENS: 'config/SET_MAX_TOKENS',
  SET_BUDGET_LIMIT: 'config/SET_BUDGET_LIMIT',
  SET_EXPERIMENTAL_FLAG: 'config/SET_EXPERIMENTAL_FLAG',
  SET_CUSTOM_INSTRUCTIONS: 'config/SET_CUSTOM_INSTRUCTIONS',
  SET_MCP_SERVERS: 'config/SET_MCP_SERVERS',
  PATCH_CONFIG: 'config/PATCH_CONFIG',
  MIGRATE_CONFIG: 'config/MIGRATE_CONFIG',
} as const

export type ConfigActionType = (typeof configActions)[keyof typeof configActions]

export interface ConfigAction extends Action {
  type: ConfigActionType
  payload?: unknown
}

export const configReducer: Reducer<ConfigSlice> = (
  state = initialConfigState,
  action: Action
): ConfigSlice => {
  switch (action.type) {
    case configActions.SET_PERMISSION_MODE: {
      const mode = action.payload as PermissionMode
      return { ...state, permissionMode: mode, lastUpdated: Date.now() }
    }
    case configActions.SET_APPROVAL_POLICY: {
      const policy = action.payload as ApprovalPolicy
      return { ...state, approvalPolicy: policy, lastUpdated: Date.now() }
    }
    case configActions.SET_DEFAULT_MODEL: {
      const model = action.payload as string
      return { ...state, defaultModel: model, lastUpdated: Date.now() }
    }
    case configActions.SET_DEFAULT_PROVIDER: {
      const provider = action.payload as string
      return { ...state, defaultProvider: provider, lastUpdated: Date.now() }
    }
    case configActions.SET_MAX_TURNS: {
      const maxTurns = action.payload as number
      return { ...state, maxTurns, lastUpdated: Date.now() }
    }
    case configActions.SET_MAX_TOKENS: {
      const maxTokens = action.payload as number
      return { ...state, maxTokens, lastUpdated: Date.now() }
    }
    case configActions.SET_BUDGET_LIMIT: {
      const budgetLimitUsd = action.payload as number | undefined
      return { ...state, budgetLimitUsd, lastUpdated: Date.now() }
    }
    case configActions.SET_EXPERIMENTAL_FLAG: {
      const { key, value } = action.payload as {
        key: keyof ExperimentalFlags
        value: boolean
      }
      return {
        ...state,
        experimental: { ...state.experimental, [key]: value },
        lastUpdated: Date.now(),
      }
    }
    case configActions.SET_CUSTOM_INSTRUCTIONS: {
      const instructions = action.payload as string | undefined
      return { ...state, customInstructions: instructions, lastUpdated: Date.now() }
    }
    case configActions.SET_MCP_SERVERS: {
      const servers = action.payload as Record<string, unknown>
      return { ...state, mcpServers: servers, lastUpdated: Date.now() }
    }
    case configActions.PATCH_CONFIG: {
      const patch = action.payload as Partial<ConfigSlice>
      return { ...state, ...patch, lastUpdated: Date.now() }
    }
    case configActions.MIGRATE_CONFIG: {
      const migrated = action.payload as ConfigSlice
      return { ...migrated, lastUpdated: Date.now() }
    }
    default:
      return state
  }
}

export const configActionCreators = {
  setPermissionMode: (mode: PermissionMode): ConfigAction => ({
    type: configActions.SET_PERMISSION_MODE,
    payload: mode,
  }),
  setApprovalPolicy: (policy: ApprovalPolicy): ConfigAction => ({
    type: configActions.SET_APPROVAL_POLICY,
    payload: policy,
  }),
  setDefaultModel: (model: string): ConfigAction => ({
    type: configActions.SET_DEFAULT_MODEL,
    payload: model,
  }),
  setDefaultProvider: (provider: string): ConfigAction => ({
    type: configActions.SET_DEFAULT_PROVIDER,
    payload: provider,
  }),
  setMaxTurns: (maxTurns: number): ConfigAction => ({
    type: configActions.SET_MAX_TURNS,
    payload: maxTurns,
  }),
  setMaxTokens: (maxTokens: number): ConfigAction => ({
    type: configActions.SET_MAX_TOKENS,
    payload: maxTokens,
  }),
  setBudgetLimit: (budgetLimitUsd?: number): ConfigAction => ({
    type: configActions.SET_BUDGET_LIMIT,
    payload: budgetLimitUsd,
  }),
  setExperimentalFlag: (key: keyof ExperimentalFlags, value: boolean): ConfigAction => ({
    type: configActions.SET_EXPERIMENTAL_FLAG,
    payload: { key, value },
  }),
  setCustomInstructions: (instructions?: string): ConfigAction => ({
    type: configActions.SET_CUSTOM_INSTRUCTIONS,
    payload: instructions,
  }),
  setMcpServers: (servers: Record<string, unknown>): ConfigAction => ({
    type: configActions.SET_MCP_SERVERS,
    payload: servers,
  }),
  patchConfig: (patch: Partial<ConfigSlice>): ConfigAction => ({
    type: configActions.PATCH_CONFIG,
    payload: patch,
  }),
  migrateConfig: (migrated: ConfigSlice): ConfigAction => ({
    type: configActions.MIGRATE_CONFIG,
    payload: migrated,
  }),
}
