import type { ToolPermissionContextUpdate } from '@openflow-types/toolPermissionContext'

export type PermissionResult =
  | { result: true }
  | {
      result: false
      message: string
      shouldPromptUser?: boolean
      suggestions?: ToolPermissionContextUpdate[]
    }
