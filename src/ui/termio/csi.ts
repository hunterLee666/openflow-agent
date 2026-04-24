import { ESC } from './ansi.js'

export const CSI = {
  CHA: 0x48,
  CNL: 0x45,
  CPL: 0x46,
  CPR: 0x61,
  cub: 0x44,
  CUB: 0x44,
  cud: 0x42,
  CUD: 0x42,
  cuf: 0x43,
  CUF: 0x43,
  cup: 0x48,
  CUP: 0x48,
  cuu: 0x41,
  CUU: 0x41,
  DCH: 0x50,
  DECSTBM: 0x6d,
  DL: 0x4d,
  ECH: 0x58,
  ED: 0x4a,
  EL: 0x4b,
  HPA: 0x60,
  HPR: 0x61,
  HVP: 0x66,
  IL: 0x4c,
  IND: 0x44,
  NEL: 0x45,
  RI: 0x4d,
  RIS: 0x63,
  SD: 0x54,
  SGR: 0x6d,
  SM: 0x68,
  SU: 0x53,
  VPA: 0x64,
  VPR: 0x61,
} as const

export const CURSOR_STYLES = {
  block: 0,
  underline: 1,
  bar: 2,
  blockOutline: 3,
  underlineOutline: 4,
  barOutline: 5,
} as const

export const ERASE_DISPLAY = {
  toEnd: 0,
  toStart: 1,
  all: 2,
  savedLines: 3,
} as const

export const ERASE_LINE_REGION = {
  toEnd: 0,
  toStart: 1,
  all: 2,
} as const

export function cursorTo(x: number, y: number): string {
  return `${ESC}[${y + 1};${x + 1}H`
}

export function cursorMove(dx: number, dy: number): string {
  const parts: string[] = []
  if (dx > 0) parts.push(`${ESC}[${dx}C`)
  else if (dx < 0) parts.push(`${ESC}[${-dx}D`)
  if (dy > 0) parts.push(`${ESC}[${dy}B`)
  else if (dy < 0) parts.push(`${ESC}[${-dy}A`)
  return parts.join('')
}

export function cursorPosition(row: number, col: number): string {
  return `${ESC}[${row};${col}H`
}

export const CURSOR_HOME = `${ESC}[H`
export const CURSOR_HOME_PATCH = { type: 'stdout' as const, content: CURSOR_HOME }

export const ERASE_SCREEN = `${ESC}[J`
export const ERASE_THEN_HOME_PATCH = { type: 'stdout' as const, content: ERASE_SCREEN + CURSOR_HOME }

export const DISABLE_KITTY_KEYBOARD = `${ESC}[<u`
export const ENABLE_KITTY_KEYBOARD = `${ESC}[>u`
export const DISABLE_MODIFY_OTHER_KEYS = `${ESC}[>4m`
export const ENABLE_MODIFY_OTHER_KEYS = `${ESC}[>4;2m`
export const HIDE_CURSOR = `${ESC}[?25l`
export const SHOW_CURSOR = `${ESC}[?25h`

export function eraseLines(count: number): string {
  return `${ESC}[${count}M`
}

export function saveCursor(): string {
  return `${ESC}7`
}

export function restoreCursor(): string {
  return `${ESC}8`
}

export function scrollUp(lines: number): string {
  return `${ESC}[${lines}S`
}

export function scrollDown(lines: number): string {
  return `${ESC}[${lines}T`
}

export function setMargins(top: number, bottom: number): string {
  return `${ESC}[${top + 1};${bottom + 1}r`
}
