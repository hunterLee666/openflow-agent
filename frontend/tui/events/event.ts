export type EventType = string | symbol

export interface EventPayload<T = unknown> {
  type: EventType
  data: T
  timestamp: number
  source?: string
}

export type EventHandler<T = unknown> = (payload: EventPayload<T>) => void

export interface EventFilter<T = unknown> {
  predicate: (payload: EventPayload<T>) => boolean
  handler: EventHandler<T>
}

export const EventTypes = {
  UI: {
    RENDER: "ui:render",
    RESIZE: "ui:resize",
    FOCUS_CHANGE: "ui:focus",
    SCROLL: "ui:scroll",
    MODAL_OPEN: "ui:modal:open",
    MODAL_CLOSE: "ui:modal:close",
  },
  MESSAGE: {
    RECEIVED: "message:received",
    SENT: "message:sent",
    STREAMING: "message:streaming",
    COMPLETE: "message:complete",
    ERROR: "message:error",
  },
  TOOL: {
    EXECUTE: "tool:execute",
    COMPLETE: "tool:complete",
    ERROR: "tool:error",
  },
  COMMAND: {
    EXECUTE: "command:execute",
    COMPLETE: "command:complete",
  },
  SESSION: {
    START: "session:start",
    END: "session:end",
    COMPACT: "session:compact",
  },
  SYSTEM: {
    ERROR: "system:error",
    WARNING: "system:warning",
    NOTIFICATION: "system:notification",
  },
} as const
