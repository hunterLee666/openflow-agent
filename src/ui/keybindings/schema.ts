export const KEYBINDING_CONTEXTS = [
  'Global',
  'Chat',
  'Autocomplete',
  'Confirmation',
  'Help',
  'Transcript',
  'HistorySearch',
  'Task',
  'ThemePicker',
  'Settings',
  'Tabs',
  'Attachments',
  'Footer',
  'MessageSelector',
  'DiffDialog',
  'ModelPicker',
  'Select',
  'Plugin',
] as const

export type KeybindingContextName = (typeof KEYBINDING_CONTEXTS)[number]

export const KEYBINDING_ACTIONS = [
  'app:interrupt',
  'app:exit',
  'app:toggleTodos',
  'app:toggleTranscript',
  'app:toggleBrief',
  'app:toggleTeammatePreview',
  'app:toggleTerminal',
  'app:redraw',
  'app:globalSearch',
  'app:quickOpen',
  'history:search',
  'history:previous',
  'history:next',
  'chat:submit',
  'chat:cancel',
  'chat:newline',
  'chat:historyUp',
  'chat:historyDown',
  'chat:complete',
  'chat:slashCommand',
  'chat:selectSuggestion',
  'chat:dismissSuggestion',
  'message:edit',
  'message:delete',
  'message:copy',
  'message:retry',
  'navigation:nextTab',
  'navigation:prevTab',
  'navigation:closeTab',
  'navigation:newTab',
  'navigation:gotoTab',
  'diff:accept',
  'diff:reject',
  'diff:quit',
  'diff:toggleSide',
  'help:show',
  'help:hide',
  'settings:show',
  'settings:hide',
  'select:confirm',
  'select:cancel',
  'select:next',
  'select:previous',
  'task:showDetails',
  'task:cancelTask',
  'task:retryTask',
  'clipboard:paste',
  'clipboard:copy',
  'focus:next',
  'focus:previous',
  'focus:escape',
  'scroll:up',
  'scroll:down',
  'scroll:pageUp',
  'scroll:pageDown',
  'scroll:top',
  'scroll:bottom',
] as const

export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number]

export interface KeybindingSchema {
  context: KeybindingContextName
  bindings: KeybindingDefinition[]
}

export interface KeybindingDefinition {
  key: string
  action: KeybindingAction | null
  description?: string
  when?: string
}

export function createKeybindingSchema(
  context: KeybindingContextName,
  bindings: KeybindingDefinition[],
): KeybindingSchema {
  return { context, bindings }
}
