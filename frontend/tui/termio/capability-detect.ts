export interface TerminalCapability {
  name: string
  supported: boolean
  version?: string
  fallback?: string
}

export interface TerminalInfo {
  name: string
  program: string
  version: string
  platform: string
  term: string
  isMultiplexer: boolean
  multiplexerType?: 'tmux' | 'screen' | 'byobu'
  supportsSGR: boolean
  supportsKitty: boolean
  supportsMouse: boolean
  supportsHyperlinks: boolean
  supportsTrueColor: boolean
  supportsUnicode: boolean
  supportsItalic: boolean
  supportsStrikethrough: boolean
  supportsUndercurl: boolean
  supportsBoxDrawing: boolean
  maxColors: number
}

export interface CapabilityQuery {
  term: string
  termProgram: string
  termProgramVersion: string
  colorterm: string
  sshTty: string
  tmux: string
}

export const DEFAULT_TERMINAL_INFO: TerminalInfo = {
  name: 'unknown',
  program: 'unknown',
  version: '0.0.0',
  platform: 'unknown',
  term: 'unknown',
  isMultiplexer: false,
  supportsSGR: false,
  supportsKitty: false,
  supportsMouse: true,
  supportsHyperlinks: false,
  supportsTrueColor: false,
  supportsUnicode: true,
  supportsItalic: false,
  supportsStrikethrough: false,
  supportsUndercurl: false,
  supportsBoxDrawing: true,
  maxColors: 8,
}

export function detectTerminalCapabilities(query: Partial<CapabilityQuery>): TerminalInfo {
  const info: TerminalInfo = { ...DEFAULT_TERMINAL_INFO }

  const term = query.term || process.env.TERM || ''
  const termProgram = query.termProgram || process.env.TERM_PROGRAM || ''
  const termProgramVersion = query.termProgramVersion || process.env.TERM_PROGRAM_VERSION || ''
  const colorterm = query.colorterm || process.env.COLORTERM || ''
  const sshTty = query.sshTty || process.env.SSH_TTY || ''
  const tmux = query.tmux || process.env.TMUX || ''

  info.term = term
  info.program = termProgram || 'unknown'
  info.version = termProgramVersion || '0.0.0'
  info.platform = process.platform || 'unknown'

  if (tmux) {
    info.isMultiplexer = true
    info.multiplexerType = 'tmux'
  } else if (process.env.STY) {
    info.isMultiplexer = true
    info.multiplexerType = 'screen'
  }

  info.supportsTrueColor = colorterm.includes('truecolor') || colorterm.includes('24bit')

  if (termProgram.includes('iTerm')) {
    info.name = 'iTerm2'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsItalic = true
    info.supportsStrikethrough = true
    info.supportsUndercurl = true
    info.maxColors = 16777216
  } else if (termProgram.includes('Apple_Terminal')) {
    info.name = 'Apple Terminal'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsItalic = true
    info.maxColors = 16777216
  } else if (termProgram.includes('WezTerm')) {
    info.name = 'WezTerm'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsKitty = true
    info.supportsItalic = true
    info.supportsStrikethrough = true
    info.supportsUndercurl = true
    info.maxColors = 16777216
  } else if (term.includes('kitty')) {
    info.name = 'Kitty'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsKitty = true
    info.supportsItalic = true
    info.supportsStrikethrough = true
    info.supportsUndercurl = true
    info.maxColors = 16777216
  } else if (term.includes('alacritty')) {
    info.name = 'Alacritty'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsItalic = true
    info.supportsStrikethrough = true
    info.maxColors = 16777216
  } else if (term.includes('xterm') || term.includes('xterm-256color')) {
    info.name = 'XTerm'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsItalic = true
    info.maxColors = 256
  } else if (term.includes('foot')) {
    info.name = 'Foot'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsHyperlinks = true
    info.supportsTrueColor = true
    info.supportsItalic = true
    info.supportsStrikethrough = true
    info.supportsUndercurl = true
    info.maxColors = 16777216
  } else if (term.includes('st')) {
    info.name = 'st'
    info.supportsSGR = true
    info.supportsMouse = true
    info.supportsTrueColor = true
    info.maxColors = 256
  } else if (term.includes('screen')) {
    info.name = 'GNU Screen'
    info.supportsSGR = false
    info.supportsMouse = false
    info.supportsHyperlinks = false
    info.supportsTrueColor = false
    info.maxColors = 256
  } else if (term.includes('linux')) {
    info.name = 'Linux Console'
    info.supportsSGR = false
    info.supportsMouse = false
    info.supportsHyperlinks = false
    info.supportsTrueColor = false
    info.supportsUnicode = false
    info.maxColors = 16
  } else if (term.includes('dumb')) {
    info.name = 'Dumb Terminal'
    info.supportsSGR = false
    info.supportsMouse = false
    info.supportsHyperlinks = false
    info.supportsTrueColor = false
    info.supportsUnicode = false
    info.supportsItalic = false
    info.supportsStrikethrough = false
    info.supportsUndercurl = false
    info.supportsBoxDrawing = false
    info.maxColors = 1
  }

  if (info.isMultiplexer) {
    info.supportsSGR = false
    info.supportsKitty = false
    info.supportsMouse = false
    info.supportsHyperlinks = false
  }

  return info
}

export function getFallbackStrategy(info: TerminalInfo): string[] {
  const fallbacks: string[] = []

  if (!info.supportsTrueColor) {
    fallbacks.push('Use 256-color palette instead of RGB')
  }

  if (!info.supportsHyperlinks) {
    fallbacks.push('Use inline URLs instead of OSC 8 hyperlinks')
  }

  if (!info.supportsMouse) {
    fallbacks.push('Disable mouse event handling')
  }

  if (!info.supportsUnicode) {
    fallbacks.push('Use ASCII-only characters for box drawing')
  }

  if (!info.supportsItalic) {
    fallbacks.push('Use dim or color instead of italic')
  }

  if (!info.supportsStrikethrough) {
    fallbacks.push('Use strikethrough emulation with overline')
  }

  if (info.isMultiplexer) {
    fallbacks.push('Wrap escape sequences for multiplexer passthrough')
  }

  return fallbacks
}

export function formatCapabilityReport(info: TerminalInfo): string {
  const lines = [
    `Terminal: ${info.name}`,
    `Program: ${info.program}`,
    `Version: ${info.version}`,
    `Platform: ${info.platform}`,
    `Multiplexer: ${info.isMultiplexer ? info.multiplexerType || 'yes' : 'no'}`,
    ``,
    `Capabilities:`,
    `  SGR Mouse: ${info.supportsSGR ? 'yes' : 'no'}`,
    `  Kitty Protocol: ${info.supportsKitty ? 'yes' : 'no'}`,
    `  Mouse Events: ${info.supportsMouse ? 'yes' : 'no'}`,
    `  Hyperlinks (OSC 8): ${info.supportsHyperlinks ? 'yes' : 'no'}`,
    `  True Color (24-bit): ${info.supportsTrueColor ? 'yes' : 'no'}`,
    `  Unicode: ${info.supportsUnicode ? 'yes' : 'no'}`,
    `  Italic: ${info.supportsItalic ? 'yes' : 'no'}`,
    `  Strikethrough: ${info.supportsStrikethrough ? 'yes' : 'no'}`,
    `  Undercurl: ${info.supportsUndercurl ? 'yes' : 'no'}`,
    `  Box Drawing: ${info.supportsBoxDrawing ? 'yes' : 'no'}`,
    `  Max Colors: ${info.maxColors}`,
  ]

  const fallbacks = getFallbackStrategy(info)
  if (fallbacks.length > 0) {
    lines.push(``, `Fallback Strategies:`)
    for (const fb of fallbacks) {
      lines.push(`  - ${fb}`)
    }
  }

  return lines.join('\n')
}

export function isTerminalCapable(info: TerminalInfo, required: Partial<TerminalInfo>): boolean {
  if (required.supportsSGR && !info.supportsSGR) return false
  if (required.supportsKitty && !info.supportsKitty) return false
  if (required.supportsMouse && !info.supportsMouse) return false
  if (required.supportsHyperlinks && !info.supportsHyperlinks) return false
  if (required.supportsTrueColor && !info.supportsTrueColor) return false
  if (required.supportsUnicode && !info.supportsUnicode) return false
  if (required.supportsItalic && !info.supportsItalic) return false
  if (required.supportsStrikethrough && !info.supportsStrikethrough) return false
  if (required.supportsUndercurl && !info.supportsUndercurl) return false
  if (required.supportsBoxDrawing && !info.supportsBoxDrawing) return false
  if (required.maxColors && info.maxColors < required.maxColors) return false

  return true
}

export function detectTerminalFromEnv(): TerminalInfo {
  return detectTerminalCapabilities({})
}
