import { z } from "zod";

export const VimModeSchema = z.enum(['normal', 'insert', 'visual', 'visual-line', 'command']);
export type VimMode = z.infer<typeof VimModeSchema>;

export const VimCursorSchema = z.object({
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  mode: VimModeSchema,
  selectionStart: z.object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  }).optional(),
  selectionEnd: z.object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  }).optional(),
});
export type VimCursor = z.infer<typeof VimCursorSchema>;

export const VimKeybindingSchema = z.object({
  keys: z.array(z.string()),
  action: z.string(),
  description: z.string().optional(),
});
export type VimKeybinding = z.infer<typeof VimKeybindingSchema>;

export const VimStateSchema = z.object({
  mode: VimModeSchema,
  cursor: VimCursorSchema,
  pendingKeys: z.array(z.string()),
  commandBuffer: z.string(),
  lastCommand: z.string().optional(),
  registers: z.record(z.string(), z.string()),
  jumpList: z.array(z.object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  })),
  jumpIndex: z.number().int().nonnegative(),
  marks: z.record(z.string(), z.object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  })),
  history: z.array(z.object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    text: z.string().optional(),
  })),
  historyIndex: z.number().int().nonnegative(),
});
export type VimState = z.infer<typeof VimStateSchema>;

export const VimConfigSchema = z.object({
  enableVimMode: z.boolean(),
  defaultMode: VimModeSchema,
  useSystemClipboard: z.boolean(),
  relativeLineNumbers: z.boolean(),
  highlightSearch: z.boolean(),
  showModeIndicator: z.boolean(),
  timeoutMs: z.number().positive(),
});
export type VimConfig = z.infer<typeof VimConfigSchema>;

export const DEFAULT_VIM_CONFIG: VimConfig = {
  enableVimMode: false,
  defaultMode: 'normal',
  useSystemClipboard: true,
  relativeLineNumbers: true,
  highlightSearch: true,
  showModeIndicator: true,
  timeoutMs: 1000,
};

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
  { keys: ['x'], action: 'delete:char', description: 'Delete character' },
  { keys: ['r'], action: 'replace:char', description: 'Replace character' },
];

export const INSERT_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['Escape'], action: 'mode:normal', description: 'Enter normal mode' },
  { keys: ['Backspace'], action: 'delete:before', description: 'Delete character before cursor' },
  { keys: ['Delete'], action: 'delete:after', description: 'Delete character after cursor' },
  { keys: ['ArrowLeft'], action: 'cursor:left', description: 'Move cursor left' },
  { keys: ['ArrowRight'], action: 'cursor:right', description: 'Move cursor right' },
  { keys: ['ArrowUp'], action: 'cursor:up', description: 'Move cursor up' },
  { keys: ['ArrowDown'], action: 'cursor:down', description: 'Move cursor down' },
  { keys: ['Ctrl', 'w'], action: 'delete:word-before', description: 'Delete word before cursor' },
  { keys: ['Ctrl', 'u'], action: 'delete:line-before', description: 'Delete line before cursor' },
  { keys: ['Tab'], action: 'indent', description: 'Insert tab' },
  { keys: ['Enter'], action: 'newline', description: 'Insert newline' },
];

export const VISUAL_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['Escape'], action: 'mode:normal', description: 'Enter normal mode' },
  { keys: ['d'], action: 'delete:selection', description: 'Delete selection' },
  { keys: ['y'], action: 'yank:selection', description: 'Yank selection' },
  { keys: ['c'], action: 'change:selection', description: 'Change selection' },
  { keys: ['p'], action: 'paste:selection', description: 'Paste in selection' },
  { keys: ['>', '>'], action: 'indent:selection', description: 'Indent selection' },
  { keys: ['<', '<'], action: 'dedent:selection', description: 'Dedent selection' },
];

export const COMMAND_MODE_BINDINGS: VimKeybinding[] = [
  { keys: ['Escape'], action: 'mode:normal', description: 'Enter normal mode' },
  { keys: ['Enter'], action: 'command:execute', description: 'Execute command' },
  { keys: ['Backspace'], action: 'command:backspace', description: 'Delete character' },
];

export const EX_COMMANDS = [
  { name: 'quit', alias: 'q', description: 'Quit' },
  { name: 'write', alias: 'w', description: 'Write' },
  { name: 'wq', description: 'Write and quit' },
  { name: 'q!', description: 'Force quit' },
  { name: 'set', description: 'Set option' },
] as const;

export function createInitialState(config: VimConfig = DEFAULT_VIM_CONFIG): VimState {
  return {
    mode: config.defaultMode,
    cursor: {
      line: 0,
      column: 0,
      mode: config.defaultMode,
    },
    pendingKeys: [],
    commandBuffer: '',
    lastCommand: undefined,
    registers: {},
    jumpList: [],
    jumpIndex: 0,
    marks: {},
    history: [],
    historyIndex: -1,
  };
}

export function formatModeIndicator(mode: VimMode): string {
  switch (mode) {
    case 'normal': return '--';
    case 'insert': return 'INSERT';
    case 'visual': return 'VISUAL';
    case 'visual-line': return 'V-LINE';
    case 'command': return ':';
    default: return '--';
  }
}

export function formatKeySequence(keys: string[]): string {
  return keys.join('');
}
