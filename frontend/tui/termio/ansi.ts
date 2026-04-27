export interface ANSIColor {
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  dim?: boolean
  inverse?: boolean
  strikethrough?: boolean
}

export const ANSI_COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  blink: "\x1b[5m",
  inverse: "\x1b[7m",
  hidden: "\x1b[8m",
  strikethrough: "\x1b[9m",
  boldOff: "\x1b[22m",
  italicOff: "\x1b[23m",
  underlineOff: "\x1b[24m",
  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",
  fgBrightBlack: "\x1b[90m",
  fgBrightRed: "\x1b[91m",
  fgBrightGreen: "\x1b[92m",
  fgBrightYellow: "\x1b[93m",
  fgBrightBlue: "\x1b[94m",
  fgBrightMagenta: "\x1b[95m",
  fgBrightCyan: "\x1b[96m",
  fgBrightWhite: "\x1b[97m",
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const

export function applyColor(text: string, color: ANSIColor): string {
  let result = ""

  if (color.bold) result += ANSI_COLORS.bold
  if (color.italic) result += ANSI_COLORS.italic
  if (color.underline) result += ANSI_COLORS.underline
  if (color.dim) result += ANSI_COLORS.dim
  if (color.inverse) result += ANSI_COLORS.inverse
  if (color.strikethrough) result += ANSI_COLORS.strikethrough

  if (color.fg) {
    result += `\x1b[38;2;${hexToRgb(color.fg)}m`
  }
  if (color.bg) {
    result += `\x1b[48;2;${hexToRgb(color.bg)}m`
  }

  result += text
  result += ANSI_COLORS.reset

  return result
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "")
}

export function getAnsiLength(text: string): number {
  return stripAnsi(text).length
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return "255;255;255"
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`
}
