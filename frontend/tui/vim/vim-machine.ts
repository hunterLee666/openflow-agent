import {
  VimMode,
  VimState,
  VimConfig,
  VimKeybinding,
  NORMAL_MODE_BINDINGS,
  VISUAL_MODE_BINDINGS,
  INSERT_MODE_BINDINGS,
  COMMAND_MODE_BINDINGS,
  EX_COMMANDS,
  createInitialState,
} from './vim-types.js'

export interface VimAction {
  type: string
  payload?: {
    text?: string
    [key: string]: unknown
  }
}

export interface VimActionResult {
  action: VimAction | null
  shouldConsumeKey: boolean
  newState: VimState
}

export class VimStateMachine {
  private state: VimState
  private config: VimConfig
  private commandHistory: string[] = []
  private searchHistory: string[] = []
  private lastSearch?: string

  constructor(config: Partial<VimConfig> = {}) {
    this.config = {
      enableVimMode: config.enableVimMode ?? true,
      defaultMode: config.defaultMode ?? 'normal',
      useSystemClipboard: config.useSystemClipboard ?? true,
      relativeLineNumbers: config.relativeLineNumbers ?? true,
      highlightSearch: config.highlightSearch ?? true,
      showModeIndicator: config.showModeIndicator ?? true,
      timeoutMs: config.timeoutMs ?? 1000,
    }
    this.state = createInitialState(this.config)
  }

  getState(): VimState {
    return { ...this.state }
  }

  getConfig(): VimConfig {
    return { ...this.config }
  }

  setMode(mode: VimMode): void {
    this.state.mode = mode
    this.state.cursor.mode = mode
    this.state.pendingKeys = []
    this.state.commandBuffer = ''
  }

  handleKey(key: string): VimActionResult {
    if (!this.config.enableVimMode) {
      return { action: null, shouldConsumeKey: false, newState: { ...this.state } }
    }

    switch (this.state.mode) {
      case 'normal':
        return this.handleNormalModeKey(key)
      case 'insert':
        return this.handleInsertModeKey(key)
      case 'visual':
      case 'visual-line':
        return this.handleVisualModeKey(key)
      case 'command':
        return this.handleCommandModeKey(key)
      default:
        return { action: null, shouldConsumeKey: false, newState: { ...this.state } }
    }
  }

  private handleNormalModeKey(key: string): VimActionResult {
    this.state.pendingKeys.push(key)

    const binding = this.findBinding(this.state.pendingKeys, NORMAL_MODE_BINDINGS)

    if (binding) {
      this.state.pendingKeys = []
      const action = this.parseNormalAction(binding.action)
      return { action, shouldConsumeKey: true, newState: { ...this.state } }
    }

    const hasPartialMatch = NORMAL_MODE_BINDINGS.some((b) =>
      b.keys.length >= this.state.pendingKeys.length &&
      b.keys.slice(0, this.state.pendingKeys.length).every((k, i) => k === this.state.pendingKeys[i])
    )

    if (!hasPartialMatch) {
      this.state.pendingKeys = []
      return { action: null, shouldConsumeKey: false, newState: { ...this.state } }
    }

    return { action: null, shouldConsumeKey: true, newState: { ...this.state } }
  }

  private handleInsertModeKey(key: string): VimActionResult {
    const binding = INSERT_MODE_BINDINGS.find((b) => {
      if (b.keys.length === 1) {
        return b.keys[0] === key
      }
      return false
    })

    if (binding) {
      const action = this.parseInsertAction(binding.action)
      return { action, shouldConsumeKey: true, newState: { ...this.state } }
    }

    return { action: null, shouldConsumeKey: false, newState: { ...this.state } }
  }

  private handleVisualModeKey(key: string): VimActionResult {
    this.state.pendingKeys.push(key)

    const binding = this.findBinding(this.state.pendingKeys, VISUAL_MODE_BINDINGS)

    if (binding) {
      this.state.pendingKeys = []
      const action = this.parseVisualAction(binding.action)
      return { action, shouldConsumeKey: true, newState: { ...this.state } }
    }

    const hasPartialMatch = VISUAL_MODE_BINDINGS.some((b) =>
      b.keys.length >= this.state.pendingKeys.length &&
      b.keys.slice(0, this.state.pendingKeys.length).every((k, i) => k === this.state.pendingKeys[i])
    )

    if (!hasPartialMatch) {
      this.state.pendingKeys = []
      return { action: null, shouldConsumeKey: false, newState: { ...this.state } }
    }

    return { action: null, shouldConsumeKey: true, newState: { ...this.state } }
  }

  private handleCommandModeKey(key: string): VimActionResult {
    if (key === 'Escape') {
      this.state.pendingKeys = []
      this.state.commandBuffer = ''
      this.setMode('normal')
      return {
        action: { type: 'mode:normal' },
        shouldConsumeKey: true,
        newState: { ...this.state },
      }
    }

    if (key === 'Enter') {
      const command = this.state.commandBuffer.trim()
      this.commandHistory.unshift(command)
      if (this.commandHistory.length > 50) {
        this.commandHistory.pop()
      }

      const action = this.parseExCommand(command)
      this.state.commandBuffer = ''
      this.state.pendingKeys = []
      this.setMode('normal')

      return { action, shouldConsumeKey: true, newState: { ...this.state } }
    }

    if (key === 'Backspace') {
      this.state.commandBuffer = this.state.commandBuffer.slice(0, -1)
      return { action: null, shouldConsumeKey: true, newState: { ...this.state } }
    }

    if (key.length === 1) {
      this.state.commandBuffer += key
      return { action: null, shouldConsumeKey: true, newState: { ...this.state } }
    }

    return { action: null, shouldConsumeKey: false, newState: { ...this.state } }
  }

  private findBinding(keys: string[], bindings: VimKeybinding[]): VimKeybinding | undefined {
    return bindings.find((b) =>
      b.keys.length === keys.length &&
      b.keys.every((k, i) => k === keys[i])
    )
  }

  private parseNormalAction(action: string): VimAction {
    const parts = action.split(':')
    return {
      type: action,
      payload: {
        mode: this.state.mode,
        cursor: { ...this.state.cursor },
      },
    }
  }

  private parseInsertAction(action: string): VimAction {
    if (action === 'mode:normal') {
      this.setMode('normal')
      if (this.state.cursor.column > 0) {
        this.state.cursor.column -= 1
      }
    }

    return {
      type: action,
      payload: {
        mode: this.state.mode,
        cursor: { ...this.state.cursor },
      },
    }
  }

  private parseVisualAction(action: string): VimAction {
    if (action === 'mode:normal') {
      this.setMode('normal')
      this.state.cursor.selectionStart = undefined
      this.state.cursor.selectionEnd = undefined
    } else if (action === 'mode:visual-line') {
      this.state.mode = 'visual-line'
      this.state.cursor.mode = 'visual-line'
    }

    return {
      type: action,
      payload: {
        mode: this.state.mode,
        cursor: { ...this.state.cursor },
      },
    }
  }

  private parseExCommand(command: string): VimAction {
    const match = command.match(/^(\d+)?(.+)$/)
    if (!match) {
      return { type: 'command:unknown', payload: { command } }
    }

    const [, lineNum, cmdPart] = match

    if (cmdPart.startsWith('s/')) {
      const parts = cmdPart.split('/')
      if (parts.length >= 4) {
        return {
          type: 'command:substitute',
          payload: {
            pattern: parts[1],
            replacement: parts[2],
            flags: parts[3],
          },
        }
      }
    }

    if (cmdPart.startsWith('set ')) {
      const option = cmdPart.slice(4)
      return { type: 'command:set', payload: { option } }
    }

    const exCmd = EX_COMMANDS.find(cmd => cmd.name === cmdPart || ('alias' in cmd && cmd.alias === cmdPart))
    if (exCmd) {
      return {
        type: `command:${exCmd.name}`,
        payload: { line: lineNum ? parseInt(lineNum, 10) : undefined },
      }
    }

    return { type: 'command:unknown', payload: { command } }
  }

  moveToMark(mark: string): void {
    const position = this.state.marks[mark]
    if (position) {
      this.pushJump()
      this.state.cursor.line = position.line
      this.state.cursor.column = position.column
    }
  }

  setMark(mark: string): void {
    this.state.marks[mark] = {
      line: this.state.cursor.line,
      column: this.state.cursor.column,
    }
  }

  pushJump(): void {
    this.state.jumpList.push({
      line: this.state.cursor.line,
      column: this.state.cursor.column,
    })
    this.state.jumpIndex = this.state.jumpList.length - 1
  }

  jumpBack(): void {
    if (this.state.jumpIndex > 0) {
      this.state.jumpIndex--
      const position = this.state.jumpList[this.state.jumpIndex]
      this.state.cursor.line = position.line
      this.state.cursor.column = position.column
    }
  }

  jumpForward(): void {
    if (this.state.jumpIndex < this.state.jumpList.length - 1) {
      this.state.jumpIndex++
      const position = this.state.jumpList[this.state.jumpIndex]
      this.state.cursor.line = position.line
      this.state.cursor.column = position.column
    }
  }

  setRegister(name: string, value: string): void {
    this.state.registers[name] = value
  }

  getRegister(name: string): string | undefined {
    return this.state.registers[name]
  }

  getCommandHistory(): string[] {
    return [...this.commandHistory]
  }

  setSearchHistory(): string[] {
    return [...this.searchHistory]
  }

  setLastSearch(search: string): void {
    this.lastSearch = search
    this.searchHistory.unshift(search)
    if (this.searchHistory.length > 50) {
      this.searchHistory.pop()
    }
  }

  getLastSearch(): string | undefined {
    return this.lastSearch
  }

  reset(): void {
    this.state = createInitialState(this.config)
    this.commandHistory = []
    this.searchHistory = []
    this.lastSearch = undefined
  }
}

export function createVimStateMachine(config?: Partial<VimConfig>): VimStateMachine {
  return new VimStateMachine(config)
}
