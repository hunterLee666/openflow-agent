import { ESC } from './ansi.js'

export const OSC = {
  SET_WINDOW_TITLE: 0,
  SET_WINDOW_ICON: 1,
  SET_XPROPERTY: 4,
  RESET_XPROPERTY: 5,
  CURRENT_DIR: 6,
  SET_COLORS: 7,
  ELINK: 8,
  SET_FONT: 10,
  NOTIFY: 12,
  SET_CURSOR_COLOR: 12,
  CLEAR_FG_COLOR: 110,
  CLEAR_BG_COLOR: 111,
  CLEAR_CURSOR_COLOR: 112,
  PROGRESS: 9,
  TAB_STATUS: 133,
  SET_SELECTION: 52,
  CLEAR_SELECTION: 53,
  SHOW_HYPERLINK: 1337,
  CLEAR_HYPERLINK: 1337,
} as const

export const BSU = '\x1b[?2026h'
export const ESU = '\x1b[?2026l'

export function setWindowTitle(title: string): string {
  return `${ESC}]0;${title}${ESC}\\`
}

export function setClipboard(content: string, clipboardId?: string): string {
  const id = clipboardId ? `;${clipboardId}` : ''
  return `${ESC}]52;${id};${Buffer.from(content).toString('base64')}${ESC}\\`
}

export function getClipboard(clipboardId?: string): string {
  const id = clipboardId ? `;${clipboardId}` : ''
  return `${ESC}]52;${id}?${ESC}\\`
}

export function clearHyperlink(): string {
  return `${ESC}]8;;${ESC}\\`
}

export function setHyperlink(uri: string, id?: string): string {
  const params = id ? `id=${id}` : ''
  return `${ESC}]8;${params};${uri}${ESC}\\`
}

export function setProgressBar(state: 'indeterminate' | 'progress' | 'error' | 'none', value?: number): string {
  const params: string[] = ['9', '4']

  switch (state) {
    case 'indeterminate':
      params.push('0')
      break
    case 'progress':
      params.push('2', String(value ?? 0))
      break
    case 'error':
      params.push('3')
      break
    case 'none':
      params.push('0')
      break
  }

  return `${ESC}]${params.join(';')}${ESC}\\`
}

export function setTerminalNotification(title: string, body?: string): string {
  const titlePart = Buffer.from(title).toString('base64')
  if (!body) {
    return `${ESC}]9;${titlePart}${ESC}\\`
  }
  const bodyPart = Buffer.from(body).toString('base64')
  return `${ESC}]9;${titlePart};${bodyPart}${ESC}\\`
}

export function reportTerminalId(): string {
  return `${ESC}]1337;RequestTermId${ESC}\\`
}

export function setTabStatus(type: 'notes' | 'info' | 'warning' | 'error', index?: number): string {
  const statusCode = { notes: 0, info: 1, warning: 2, error: 3 }[type]
  const idx = index !== undefined ? `;${index}` : ''
  return `${ESC}]1337;Terminal-${type}${idx}${ESC}\\`
}

export function supportsTabStatus(termProgram?: string, termProgramVersion?: string): boolean {
  if (termProgram === 'iTerm.app' && termProgramVersion) {
    const [major] = termProgramVersion.split('.').map(Number)
    return major >= 3
  }
  return false
}

export function wrapForMultiplexer(content: string): string {
  return `${ESC}Ptmux;${content}${ESC}\\`
}

export function unwrapForMultiplexer(content: string): string {
  if (content.startsWith('\x1bPtmux;') && content.endsWith('\x1b\\')) {
    return content.slice(7, -2)
  }
  return content
}
