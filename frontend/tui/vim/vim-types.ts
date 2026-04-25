export type VimMode = 'normal' | 'insert' | 'visual' | 'visual-line' | 'command'

export interface VimCursor {
  line: number
  column: number
  mode: VimMode
  selectionStart?: { line: number; column: number }
  selectionEnd?: { line: number; column: number }
}

export interface VimKeybinding {
  keys: string[]
  action: string
  description?: string
}

export interface VimState {
  mode: VimMode
  cursor: VimCursor
  pendingKeys: string[]
  commandBuffer: string
  lastCommand?: string
  registers: Map<string, string>
  jumpList: Array<{ line: number; column: number }>
  jumpIndex: number
  marks: Map<string, { line: number; column: number }>
  history: Array<{ line: number; column: number; text?: string }>
  historyIndex: number
}

export interface VimConfig {
  enableVimMode: boolean
  defaultMode: VimMode
  useSystemClipboard: boolean
  relativeLineNumbers: boolean
  highlightSearch: boolean
  showModeIndicator: boolean
  timeoutMs: number
}

export const DEFAULT_VIM_CONFIG: VimConfig = {
  enableVimMode: false,
  defaultMode: 'normal',
  useSystemClipboard: true,
  relativeLineNumbers: true,
  highlightSearch: true,
  showModeIndicator: true,
  timeoutMs: 1000,
}

export const NORMAL_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['h'], action: 'cursor:left', description: 'Move cursor left' },
  { keys: ['j'], action: 'cursor:down', description: 'Move cursor down' },
  { keys: ['k'], action: 'cursor:up', description: 'Move cursor up' },
  { keys: ['l'], action: 'cursor:right', description: 'Move cursor right' },
  { keys: ['w'], action: 'cursor:word-forward', description: 'Move to next word' },
  { keys: ['b'], action: 'cursor:word-backward', description: 'Move to previous word' },
  { keys: ['e'], action: 'cursor:word-end', description: 'Move to end of word' },
  { keys: ['0'], action: 'cursor:line-start', description: 'Move to line start' },
  { keys: ['^'], action: 'cursor:line-first-nonblank', description: 'Move to first non-blank character' },
  { keys: ['$'], action: 'cursor:line-end', description: 'Move to line end' },
  { keys: ['g', 'g'], action: 'cursor:file-start', description: 'Move to file start' },
  { keys: ['G'], action: 'cursor:file-end', description: 'Move to file end' },
  { keys: ['i'], action: 'mode:insert', description: 'Enter insert mode' },
  { keys: ['a'], action: 'mode:insert:after', description: 'Enter insert mode after cursor' },
  { keys: ['I'], action: 'mode:insert:line-start', description: 'Enter insert mode at line start' },
  { keys: ['A'], action: 'mode:insert:line-end', description: 'Enter insert mode at line end' },
  { keys: ['o'], action: 'mode:insert:new-line-below', description: 'Open new line below' },
  { keys: ['O'], action: 'mode:insert:new-line-above', description: 'Open new line above' },
  { keys: ['v'], action: 'mode:visual', description: 'Enter visual mode' },
  { keys: ['V'], action: 'mode:visual-line', description: 'Enter visual line mode' },
  { keys: ['Escape'], action: 'mode:normal', description: 'Enter normal mode' },
  { keys: ['u'], action: 'undo', description: 'Undo' },
  { keys: ['Ctrl', 'r'], action: 'redo', description: 'Redo' },
  { keys: ['d', 'd'], action: 'delete:line', description: 'Delete line' },
  { keys: ['d', 'w'], action: 'delete:word', description: 'Delete word' },
  { keys: ['c', 'c'], action: 'change:line', description: 'Change line' },
  { keys: ['y', 'y'], action: 'yank:line', description: 'Yank line' },
  { keys: ['p'], action: 'paste:after', description: 'Paste after cursor' },
  { keys: ['P'], action: 'paste:before', description: 'Paste before cursor' },
  { keys: ['/'], action: 'search:forward', description: 'Search forward' },
  { keys: ['?'], action: 'search:backward', description: 'Search backward' },
  { keys: ['n'], action: 'search:next', description: 'Next search result' },
  { keys: ['N'], action: 'search:prev', description: 'Previous search result' },
  { keys: [':'], action: 'mode:command', description: 'Enter command mode' },
  { keys: ['Ctrl', 'd'], action: 'scroll:half-page-down', description: 'Scroll half page down' },
  { keys: ['Ctrl', 'u'], action: 'scroll:half-page-up', description: 'Scroll half page up' },
  { keys: ['Ctrl', 'f'], action: 'scroll:page-down', description: 'Scroll page down' },
  { keys: ['Ctrl', 'b'], action: 'scroll:page-up', description: 'Scroll page up' },
  { keys: ['z', 't'], action: 'scroll:top', description: 'Scroll line to top' },
  { keys: ['z', 'z'], action: 'scroll:center', description: 'Scroll line to center' },
  { keys: ['z', 'b'], action: 'scroll:bottom', description: 'Scroll line to bottom' },
  { keys: ['m', 'a'], action: 'mark:set-a', description: 'Set mark a' },
  { keys: ['`', 'a'], action: 'mark:goto-a', description: 'Go to mark a' },
  { keys: ['Ctrl', 'o'], action: 'jump:back', description: 'Jump back' },
  { keys: ['Ctrl', 'i'], action: 'jump:forward', description: 'Jump forward' },
]

export const VISUAL_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['h'], action: 'visual:left', description: 'Extend selection left' },
  { keys: ['j'], action: 'visual:down', description: 'Extend selection down' },
  { keys: ['k'], action: 'visual:up', description: 'Extend selection up' },
  { keys: ['l'], action: 'visual:right', description: 'Extend selection right' },
  { keys: ['w'], action: 'visual:word-forward', description: 'Extend to next word' },
  { keys: ['b'], action: 'visual:word-backward', description: 'Extend to previous word' },
  { keys: ['0'], action: 'visual:line-start', description: 'Extend to line start' },
  { keys: ['$'], action: 'visual:line-end', description: 'Extend to line end' },
  { keys: ['Escape'], action: 'mode:normal', description: 'Exit visual mode' },
  { keys: ['d'], action: 'visual:delete', description: 'Delete selection' },
  { keys: ['y'], action: 'visual:yank', description: 'Yank selection' },
  { keys: ['c'], action: 'visual:change', description: 'Change selection' },
  { keys: ['v'], action: 'mode:normal', description: 'Exit visual mode' },
  { keys: ['V'], action: 'mode:visual-line', description: 'Switch to visual line mode' },
  { keys: ['o'], action: 'visual:swap-ends', description: 'Swap selection ends' },
  { keys: ['O'], action: 'visual:swap-ends', description: 'Swap selection ends' },
]

export const INSERT_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['Escape'], action: 'mode:normal', description: 'Exit insert mode' },
  { keys: ['Ctrl', '['], action: 'mode:normal', description: 'Exit insert mode' },
  { keys: ['Ctrl', 'o'], action: 'insert:one-command', description: 'Execute one normal command' },
  { keys: ['Ctrl', 'w'], action: 'insert:delete-word', description: 'Delete word before cursor' },
  { keys: ['Ctrl', 'u'], action: 'insert:delete-line-start', description: 'Delete to line start' },
  { keys: ['Ctrl', 'h'], action: 'insert:backspace', description: 'Backspace' },
  { keys: ['Ctrl', 't'], action: 'insert:indent', description: 'Indent' },
  { keys: ['Ctrl', 'd'], action: 'insert:dedent', description: 'Dedent' },
  { keys: ['Ctrl', 'n'], action: 'insert:complete-next', description: 'Next completion' },
  { keys: ['Ctrl', 'p'], action: 'insert:complete-prev', description: 'Previous completion' },
]

export const COMMAND_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['Escape'], action: 'mode:normal', description: 'Exit command mode' },
  { keys: ['Enter'], action: 'command:execute', description: 'Execute command' },
  { keys: ['Backspace'], action: 'command:backspace', description: 'Delete last character' },
  { keys: ['Tab'], action: 'command:complete', description: 'Complete command' },
  { keys: ['ArrowUp'], action: 'command:history-prev', description: 'Previous command' },
  { keys: ['ArrowDown'], action: 'command:history-next', description: 'Next command' },
]

export const EX_COMMANDS: Record<string, string> = {
  'q': 'quit',
  'q!': 'quit-force',
  'w': 'write',
  'wq': 'write-quit',
  'x': 'write-quit',
  'e': 'edit',
  's': 'substitute',
  'noh': 'nohlsearch',
  'set': 'set-option',
  'marks': 'show-marks',
  'registers': 'show-registers',
  'history': 'show-history',
}

export function createInitialState(config: Partial<VimConfig> = {}): VimState {
  const mergedConfig = { ...DEFAULT_VIM_CONFIG, ...config }

  return {
    mode: mergedConfig.defaultMode,
    cursor: {
      line: 0,
      column: 0,
      mode: mergedConfig.defaultMode,
    },
    pendingKeys: [],
    commandBuffer: '',
    registers: new Map(),
    jumpList: [],
    jumpIndex: -1,
    marks: new Map(),
    history: [],
    historyIndex: -1,
  }
}

export function formatModeIndicator(mode: VimMode): string {
  const indicators: Record<VimMode, string> = {
    'normal': '-- NORMAL --',
    'insert': '-- INSERT --',
    'visual': '-- VISUAL --',
    'visual-line': '-- VISUAL LINE --',
    'command': '-- COMMAND --',
  }
  return indicators[mode] || ''
}

export function formatKeySequence(keys: string[]): string {
  return keys.join(' ')
}
