export interface MouseProtocolConfig {
  enableMouse: boolean
  enableSGR: boolean
  enableKitty: boolean
  enableUT: boolean
  enableX10: boolean
  reportWheel: boolean
  reportMotion: boolean
}

export const DEFAULT_MOUSE_CONFIG: MouseProtocolConfig = {
  enableMouse: true,
  enableSGR: true,
  enableKitty: false,
  enableUT: false,
  enableX10: false,
  reportWheel: true,
  reportMotion: false,
}

export enum MouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  RELEASE = 3,
  WHEEL_UP = 64,
  WHEEL_DOWN = 65,
  WHEEL_LEFT = 66,
  WHEEL_RIGHT = 67,
}

export enum MouseModifier {
  NONE = 0,
  SHIFT = 1,
  ALT = 2,
  CTRL = 4,
}

export interface MouseEvent {
  button: MouseButton
  modifiers: MouseModifier
  x: number
  y: number
  isPress: boolean
  isRelease: boolean
  isMotion: boolean
}

export enum MouseMode {
  X10 = 9,
  VT200 = 1000,
  VT200_HIGHLIGHT = 1001,
  BTN_EVENT = 1002,
  ANY_EVENT = 1003,
  SGR = 1006,
  SGR_PIXEL = 1016,
  KITTY_BASIC = 1002,
  KITTY_SGR = 1006,
}

export const CSI = '\x1b['

export function enableMouse(mode: MouseMode = MouseMode.ANY_EVENT): string {
  let sequences = `${CSI}?${mode}h`

  if (mode >= MouseMode.BTN_EVENT) {
    sequences += `${CSI}?1003h`
  }

  return sequences
}

export function disableMouse(): string {
  return [
    `${CSI}?9l`,
    `${CSI}?1000l`,
    `${CSI}?1001l`,
    `${CSI}?1002l`,
    `${CSI}?1003l`,
    `${CSI}?1006l`,
    `${CSI}?1016l`,
  ].join('')
}

export function enableSGRMouse(): string {
  return `${CSI}?1006h`
}

export function disableSGRMouse(): string {
  return `${CSI}?1006l`
}

export function enableKittyMouse(): string {
  return [
    `${CSI}>1u`,
    `${CSI}<1u`,
    `${CSI}>1002h`,
    `${CSI}?1006h`,
  ].join('')
}

export function disableKittyMouse(): string {
  return [
    `${CSI}<u`,
    `${CSI}>1002l`,
    `${CSI}?1006l`,
  ].join('')
}

export function enableMouseMotion(): string {
  return `${CSI}?1003h`
}

export function disableMouseMotion(): string {
  return `${CSI}?1003l`
}

export function parseSGRMouseEvent(data: string): MouseEvent | null {
  const sgrMatch = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/)

  if (sgrMatch) {
    const [, buttonCode, x, y, eventType] = sgrMatch

    const code = parseInt(buttonCode, 10)
    const button = code & 3
    const modifiers = (code >> 2) & 3

    const isWheel = code >= 64
    const isPress = eventType === 'M'
    const isRelease = eventType === 'm'
    const isMotion = code === 32 || code === 33 || code === 34 || code === 35

    return {
      button: isWheel ? code as MouseButton : button as MouseButton,
      modifiers: modifiers as MouseModifier,
      x: parseInt(x, 10) - 1,
      y: parseInt(y, 10) - 1,
      isPress,
      isRelease,
      isMotion,
    }
  }

  const x10Match = data.match(/\x1b\[M([\x00-\xff])([\x21-\xff])([\x21-\xff])/)

  if (x10Match) {
    const [, buttonByte, xByte, yByte] = x10Match

    const code = buttonByte.charCodeAt(0) - 32
    const button = code & 3
    const modifiers = (code >> 2) & 3

    const isWheel = code >= 64
    const isMotion = code === 32 || code === 33 || code === 34 || code === 35

    return {
      button: isWheel ? code as MouseButton : button as MouseButton,
      modifiers: modifiers as MouseModifier,
      x: xByte.charCodeAt(0) - 33,
      y: yByte.charCodeAt(0) - 33,
      isPress: !isMotion,
      isRelease: false,
      isMotion,
    }
  }

  return null
}

export function formatMouseEventForTerminal(
  event: MouseEvent,
  useSGR: boolean = true
): string {
  if (useSGR) {
    let code = event.button
    code |= (event.modifiers << 2)

    if (event.isMotion) {
      code |= 32
    }

    const eventType = event.isRelease ? 'm' : 'M'

    return `${CSI}<${code};${event.x + 1};${event.y + 1}${eventType}`
  }

  let code = event.button
  code |= (event.modifiers << 2)

  if (event.isMotion) {
    code |= 32
  }

  const xByte = String.fromCharCode(event.x + 1 + 32)
  const yByte = String.fromCharCode(event.y + 1 + 32)

  return `${CSI}M${String.fromCharCode(code + 32)}${xByte}${yByte}`
}

export function supportsSGRMouse(termProgram?: string, termProgramVersion?: string): boolean {
  if (!termProgram) return false

  const supported = [
    'iTerm.app',
    'Apple_Terminal',
    'xterm',
    'alacritty',
    'WezTerm',
    'kitty',
    'foot',
    'st',
  ]

  return supported.some((t) => termProgram.includes(t))
}

export function supportsKittyMouse(termProgram?: string): boolean {
  return termProgram?.toLowerCase() === 'kitty' || termProgram?.toLowerCase().includes('kitty') || false
}

export function getMouseProtocolSequence(termProgram?: string): { enable: string; disable: string } {
  if (supportsKittyMouse(termProgram)) {
    return {
      enable: enableKittyMouse(),
      disable: disableKittyMouse(),
    }
  }

  if (supportsSGRMouse(termProgram)) {
    return {
      enable: enableSGRMouse() + enableMouseMotion(),
      disable: disableSGRMouse() + disableMouseMotion(),
    }
  }

  return {
    enable: enableMouse(MouseMode.ANY_EVENT),
    disable: disableMouse(),
  }
}

export function createMouseProtocolSequences(config: MouseProtocolConfig): { enable: string; disable: string } {
  let enableSeq = ''
  let disableSeq = ''

  if (config.enableKitty) {
    enableSeq += enableKittyMouse()
    disableSeq += disableKittyMouse()
  } else if (config.enableSGR) {
    enableSeq += enableSGRMouse()
    disableSeq += disableSGRMouse()
  }

  if (config.enableUT) {
    enableSeq += `${CSI}?1016h`
    disableSeq += `${CSI}?1016l`
  }

  if (config.enableX10) {
    enableSeq += `${CSI}?9h`
    disableSeq += `${CSI}?9l`
  }

  if (config.reportMotion) {
    enableSeq += enableMouseMotion()
    disableSeq += disableMouseMotion()
  }

  return { enable: enableSeq, disable: disableSeq }
}
