import { ESC } from './ansi.js'
import type { Color, NamedColor, TextStyle } from './types.js'

export type { Color, NamedColor, TextStyle }
export type UnderlineStyle = 'none' | 'single' | 'double' | 'curly' | 'dotted' | 'dashed'

export function defaultStyle(): TextStyle {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: 'none',
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
    overline: false,
    fg: { type: 'default' },
    bg: { type: 'default' },
    underlineColor: { type: 'default' },
  }
}

const COLOR_MAP: Record<NamedColor, number> = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  brightBlack: 8,
  brightRed: 9,
  brightGreen: 10,
  brightYellow: 11,
  brightBlue: 12,
  brightMagenta: 13,
  brightCyan: 14,
  brightWhite: 15,
}

const NAMED_COLORS: NamedColor[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
]

export function colorToSgr(color: Color, isFg: boolean): string {
  if (color.type === 'default') {
    return isFg ? '39' : '49'
  }
  if (color.type === 'named') {
    const idx = COLOR_MAP[color.name]
    if (color.name.startsWith('bright')) {
      return isFg ? `9${idx - 8}` : `10${idx - 8}`
    }
    return isFg ? `3${idx}` : `4${idx}`
  }
  if (color.type === 'indexed') {
    return isFg ? `38;5;${color.index}` : `48;5;${color.index}`
  }
  if (color.type === 'rgb') {
    return isFg ? `38;2;${color.r};${color.g};${color.b}` : `48;2;${color.r};${color.g};${color.b}`
  }
  return ''
}

export function styleToSgr(style: TextStyle): string[] {
  const codes: string[] = []

  if (style.bold) codes.push('1')
  if (style.dim) codes.push('2')
  if (style.italic) codes.push('3')
  if (style.underline === 'single') codes.push('4')
  else if (style.underline === 'double') codes.push('4:3')
  else if (style.underline === 'curly') codes.push('4:4')
  else if (style.underline === 'dotted') codes.push('4:5')
  else if (style.underline === 'dashed') codes.push('4:6')
  else if (style.underline === 'none') codes.push('24')
  if (style.blink) codes.push('5')
  if (style.inverse) codes.push('7')
  if (style.hidden) codes.push('8')
  if (style.strikethrough) codes.push('9')
  if (style.overline) codes.push('53')

  codes.push(colorToSgr(style.fg, true))
  codes.push(colorToSgr(style.bg, false))
  codes.push(colorToSgr(style.underlineColor, true))

  return codes
}

export function sgrToStyle(params: string): Partial<TextStyle> {
  const parts = params.split(';')
  const style: Partial<TextStyle> = {}
  let i = 0

  while (i < parts.length) {
    const code = parseInt(parts[i]!, 10)

    if (code === 0) {
      Object.assign(style, defaultStyle())
    } else if (code === 1) {
      style.bold = true
    } else if (code === 2) {
      style.dim = true
    } else if (code === 3) {
      style.italic = true
    } else if (code === 4) {
      const next = parts[i + 1]
      if (next === '3') style.underline = 'double'
      else if (next === '4') style.underline = 'curly'
      else if (next === '5') style.underline = 'dotted'
      else if (next === '6') style.underline = 'dashed'
      else style.underline = 'single'
      if (next !== undefined) i++
    } else if (code === 5) {
      style.blink = true
    } else if (code === 7) {
      style.inverse = true
    } else if (code === 8) {
      style.hidden = true
    } else if (code === 9) {
      style.strikethrough = true
    } else if (code === 53) {
      style.overline = true
    } else if (code === 22) {
      style.bold = false
      style.dim = false
    } else if (code === 24) {
      style.underline = 'none'
    } else if (code === 27) {
      style.inverse = false
    } else if (code === 28) {
      style.hidden = false
    } else if (code === 29) {
      style.strikethrough = false
    } else if (code === 54) {
      style.overline = false
    } else if (code >= 30 && code <= 37) {
      style.fg = { type: 'named', name: NAMED_COLORS[code - 30] }
    } else if (code === 39) {
      style.fg = { type: 'default' }
    } else if (code >= 40 && code <= 47) {
      style.bg = { type: 'named', name: NAMED_COLORS[code - 40] }
    } else if (code === 49) {
      style.bg = { type: 'default' }
    } else if (code >= 90 && code <= 97) {
      style.fg = { type: 'named', name: NAMED_COLORS[code - 90 + 8] }
    } else if (code >= 100 && code <= 107) {
      style.bg = { type: 'named', name: NAMED_COLORS[code - 100 + 8] }
    } else if (code === 38 && parts[i + 1] === '5') {
      style.fg = { type: 'indexed', index: parseInt(parts[i + 2]!, 10) }
      i += 2
    } else if (code === 38 && parts[i + 1] === '2') {
      style.fg = {
        type: 'rgb',
        r: parseInt(parts[i + 2]!, 10),
        g: parseInt(parts[i + 3]!, 10),
        b: parseInt(parts[i + 4]!, 10),
      }
      i += 4
    } else if (code === 48 && parts[i + 1] === '5') {
      style.bg = { type: 'indexed', index: parseInt(parts[i + 2]!, 10) }
      i += 2
    } else if (code === 48 && parts[i + 1] === '2') {
      style.bg = {
        type: 'rgb',
        r: parseInt(parts[i + 2]!, 10),
        g: parseInt(parts[i + 3]!, 10),
        b: parseInt(parts[i + 4]!, 10),
      }
      i += 4
    }

    i++
  }

  return style
}

export function applySgr(style: TextStyle): string {
  const codes = styleToSgr(style)
  return codes.length > 0 ? `${ESC}[${codes.join(';')}m` : ''
}
