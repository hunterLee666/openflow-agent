import { ESC } from './ansi.js'

export const DEC = {
  DECAWM: 1,
  DECSC: 5,
  DECOM: 6,
  DECRLM: 8,
  DECKPAM: 9,
  DECTCEM: 25,
  BAR_CURSOR: 12,
  BLINK_CURSOR: 12,
  DECSCUSR: 12,
  UNDLINE_CURSOR: 12,
  IRM: 20,
  SRM: 12,
  LNM: 20,
} as const

export const DEC_MODE = {
  ORIG_PAIR: 1,
  ORIG_CURSOR: 2,
  ORIG_COLORS: 4,
  ORIG_FONT: 8,
  BRACKETED_PASTE: 2004,
  MOUSE_TRACKING: 1000,
  MOUSE_CLICK: 1001,
  MOUSE_DRAG: 1002,
  MOUSE_MOVE: 1003,
  FOCUS_EVENT: 1005,
  SGR_MOUSE: 1006,
  URXVT_MOUSE: 1015,
  SYNC_OUTPUT: 2026,
  EXTENDED_REPORT: 2025,
} as const

export const BSU = `${ESC}[?2026h`
export const ESU = `${ESC}[?2026l`

export const HIDE_CURSOR = `${ESC}[?25l`
export const SHOW_CURSOR = `${ESC}[?25h`

export const ENABLE_MOUSE_TRACKING = `${ESC}[?1000h`
export const DISABLE_MOUSE_TRACKING = `${ESC}[?1000l`

export const ENABLE_BRAILLE_PASTE = `${ESC}[?2004h`
export const DISABLE_BRAILLE_PASTE = `${ESC}[?2004l`

export function setBracketedPaste(mode: 'on' | 'off'): string {
  return mode === 'on' ? `${ESC}[?2004h` : `${ESC}[?2004l`
}

export function setMouseTracking(mode: 'on' | 'off'): string {
  return mode === 'on' ? `${ESC}[?1000h` : `${ESC}[?1000l`
}

export function setAltScreen(mode: 'on' | 'off'): string {
  return mode === 'on' ? `${ESC}[?1049h` : `${ESC}[?1049l`
}

export function enterAlternateScreen(): string {
  return `${ESC}[?1049h`
}

export function exitAlternateScreen(): string {
  return `${ESC}[?1049l`
}

export function saveDecPrivateModeState(): string {
  return `${ESC}[?s`
}

export function restoreDecPrivateModeState(): string {
  return `${ESC}[?r`
}

export function resetAllModes(): string {
  return `${ESC}[!p`
}
