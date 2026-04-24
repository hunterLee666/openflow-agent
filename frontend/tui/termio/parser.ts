import { C0 } from './ansi.js'
import { CSI } from './csi.js'
import type { Action, Grapheme } from './types.js'
import { defaultStyle } from './sgr.js'

export type Token =
  | { type: 'text'; value: string }
  | { type: 'escape'; value: string }
  | { type: 'c0'; value: number }

export interface Tokenizer {
  write(buffer: string): void
  read(): Token[]
  flush(): Token[]
  reset(): void
}

export function createTokenizer(): Tokenizer {
  const buffer: string[] = []
  let escaped = false
  let csiStarted = false
  let csiBuffer = ''
  let oscStarted = false
  let oscBuffer = ''

  return {
    write(chunk: string): void {
      for (const char of chunk) {
        const code = char.charCodeAt(0)

        if (escaped) {
          escaped = false
          if (code === C0.ESC) {
            buffer.push('\x1b')
            escaped = true
          } else if (code === 0x5b) {
            csiStarted = true
            csiBuffer = '\x1b['
          } else if (code === 0x5d) {
            oscStarted = true
            oscBuffer = '\x1b]'
          } else {
            buffer.push('\x1b' + char)
          }
          continue
        }

        if (csiStarted) {
          csiBuffer += char
          if (code >= 0x40 && code <= 0x7e) {
            buffer.push(csiBuffer)
            csiStarted = false
            csiBuffer = ''
          }
          continue
        }

        if (oscStarted) {
          oscBuffer += char
          if (code === C0.BEL || (code === C0.ESC && chunk.indexOf('\\') === chunk.length - 1)) {
            buffer.push(oscBuffer.slice(0, -1) + '\\')
            oscStarted = false
            oscBuffer = ''
          }
          continue
        }

        if (code === C0.ESC) {
          escaped = true
        } else if (code < 0x20 || code === 0x7f) {
          buffer.push(String.fromCharCode(code))
        } else {
          buffer.push(char)
        }
      }
    },

    read(): Token[] {
      return buffer.splice(0).map(s => ({ type: 'text' as const, value: s }))
    },

    flush(): Token[] {
      if (csiStarted && csiBuffer) {
        buffer.push(csiBuffer)
        csiBuffer = ''
        csiStarted = false
      }
      if (oscStarted && oscBuffer) {
        buffer.push(oscBuffer)
        oscBuffer = ''
        oscStarted = false
      }
      return buffer.splice(0).map(s => ({ type: 'text' as const, value: s }))
    },

    reset(): void {
      buffer.length = 0
      escaped = false
      csiStarted = false
      csiBuffer = ''
      oscStarted = false
      oscBuffer = ''
    },
  }
}

function parseCSIParams(paramStr: string): number[] {
  if (paramStr === '') return []
  return paramStr.split(/[;:]/).map(s => (s === '' ? 0 : parseInt(s, 10)))
}

function parseCSI(rawSequence: string): Action | null {
  const inner = rawSequence.slice(2)
  if (inner.length === 0) return null

  const finalByte = inner.charCodeAt(inner.length - 1)
  const beforeFinal = inner.slice(0, -1)

  let privateMode = ''
  let paramStr = beforeFinal
  let intermediate = ''

  if (beforeFinal.length > 0 && '?>='.includes(beforeFinal[0]!)) {
    privateMode = beforeFinal[0]!
    paramStr = beforeFinal.slice(1)
  }

  const intermediateMatch = paramStr.match(/([^0-9;:]+)$/)
  if (intermediateMatch) {
    intermediate = intermediateMatch[1]!
    paramStr = paramStr.slice(0, -intermediate.length)
  }

  const params = parseCSIParams(paramStr)
  const p0 = params[0] ?? 1
  const p1 = params[1] ?? 1

  if (finalByte === CSI.SGR && privateMode === '') {
    return { type: 'sgr', params: paramStr }
  }

  if (finalByte === CSI.CUU) {
    return { type: 'cursor', action: { type: 'move', direction: 'up', count: p0 } }
  }
  if (finalByte === CSI.CUD) {
    return { type: 'cursor', action: { type: 'move', direction: 'down', count: p0 } }
  }
  if (finalByte === CSI.CUF) {
    return { type: 'cursor', action: { type: 'move', direction: 'forward', count: p0 } }
  }
  if (finalByte === CSI.CUB) {
    return { type: 'cursor', action: { type: 'move', direction: 'back', count: p0 } }
  }
  if (finalByte === CSI.CNL) {
    return { type: 'cursor', action: { type: 'nextLine', count: p0 } }
  }
  if (finalByte === CSI.CPL) {
    return { type: 'cursor', action: { type: 'prevLine', count: p0 } }
  }
  if (finalByte === CSI.CHA) {
    return { type: 'cursor', action: { type: 'column', col: p0 } }
  }
  if (finalByte === CSI.CUP || (finalByte === CSI.HVP && privateMode === '')) {
    return { type: 'cursor', action: { type: 'position', row: p0, col: p1 } }
  }
  if (finalByte === 0x72 && privateMode === '?') {
    return { type: 'mode', mode: 'set', code: params[0] ?? 0 }
  }
  if (finalByte === 0x72 && privateMode === '') {
    return { type: 'mode', mode: 'unset', code: params[0] ?? 0 }
  }
  if (finalByte === CSI.ED) {
    return { type: 'erase', area: 'display', mode: p0 }
  }
  if (finalByte === CSI.EL) {
    return { type: 'erase', area: 'line', mode: p0 }
  }
  if (finalByte === CSI.SU) {
    return { type: 'scroll', direction: 'up', count: p0 }
  }
  if (finalByte === CSI.SD) {
    return { type: 'scroll', direction: 'down', count: p0 }
  }
  if (finalByte === CSI.DECSTBM) {
    return { type: 'mode', mode: 'set', code: 6, value: params[0] && params[1] ? { top: params[0] - 1, bottom: params[1] - 1 } : undefined }
  }

  return { type: 'ignore' }
}

function parseOSC(rawSequence: string): Action | null {
  const inner = rawSequence.slice(2, -1)
  if (inner.length === 0) return null

  const semicolonIndex = inner.indexOf(';')
  if (semicolonIndex === -1) return null

  const command = inner.slice(0, semicolonIndex)
  const payload = inner.slice(semicolonIndex + 1)

  switch (command) {
    case '0':
    case '1':
    case '2':
      return { type: 'title', title: payload }
    case '9':
      try {
        const decoded = Buffer.from(payload, 'base64').toString('utf8')
        const parts = decoded.split(';')
        return {
          type: 'progress',
          state: parts[0] === '2' ? 'progress' : parts[0] === '3' ? 'error' : 'indeterminate',
          value: parts[0] === '2' ? parseInt(parts[1] ?? '0', 10) : undefined,
        }
      } catch {
        return { type: 'ignore' }
      }
    case '52':
      return { type: 'clipboard', operation: 'set', content: payload }
    case '1337':
      if (payload.startsWith('Terminal-')) {
        const status = payload.slice(9).split(';')
        const type = status[0] as 'notes' | 'info' | 'warning' | 'error'
        return { type: 'tab_status', status: type, index: status[1] ? parseInt(status[1], 10) : undefined }
      }
      if (payload.startsWith('RequestTermId')) {
        return { type: 'ignore' }
      }
      return { type: 'ignore' }
    default:
      return { type: 'osc_string', payload: inner }
  }
}

export class Parser {
  private tokenizer: Tokenizer
  private currentStyle = defaultStyle()

  constructor() {
    this.tokenizer = createTokenizer()
  }

  write(chunk: string): Action[] {
    this.tokenizer.write(chunk)
    return this.read()
  }

  read(): Action[] {
    const actions: Action[] = []
    const tokens = this.tokenizer.read()

    for (const token of tokens) {
      if (token.type === 'c0') {
        if (token.value === C0.BEL) {
          actions.push({ type: 'bel' })
        }
      } else if (token.type === 'text') {
      } else if (token.type === 'escape') {
        if (token.value.startsWith('\x1b[')) {
          const action = parseCSI(token.value)
          if (action) actions.push(action)
        } else if (token.value.startsWith('\x1b]')) {
          const action = parseOSC(token.value)
          if (action) actions.push(action)
        } else if (token.value === '\x1b') {
        }
      }
    }

    return actions
  }

  flush(): Action[] {
    const tokens = this.tokenizer.flush()
    const actions: Action[] = []

    for (const token of tokens) {
      if (token.type === 'c0') {
        if (token.value === C0.BEL) {
          actions.push({ type: 'bel' })
        }
      } else if (token.type === 'text') {
      } else if (token.type === 'escape') {
        if (token.value.startsWith('\x1b[')) {
          const action = parseCSI(token.value)
          if (action) actions.push(action)
        } else if (token.value.startsWith('\x1b]')) {
          const action = parseOSC(token.value)
          if (action) actions.push(action)
        }
      }
    }

    return actions
  }

  reset(): void {
    this.tokenizer.reset()
    this.currentStyle = defaultStyle()
  }

  getStyle() {
    return { ...this.currentStyle }
  }
}

export function createParser(): Parser {
  return new Parser()
}
