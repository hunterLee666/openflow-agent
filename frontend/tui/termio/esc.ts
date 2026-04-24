import type { Action } from './types.js'

export type EscAction =
  | { type: 'reset' }
  | { type: 'cursor'; action: { type: 'save' } | { type: 'restore' } | { type: 'move'; direction: 'up' | 'down'; count: number } | { type: 'nextLine'; count: number } }
  | { type: 'unknown'; sequence: string }

export function parseEsc(chars: string): EscAction | null {
  if (chars.length === 0) return null

  const first = chars[0]!

  if (first === 'c') {
    return { type: 'reset' }
  }

  if (first === '7') {
    return { type: 'cursor', action: { type: 'save' } }
  }

  if (first === '8') {
    return { type: 'cursor', action: { type: 'restore' } }
  }

  if (first === 'D') {
    return {
      type: 'cursor',
      action: { type: 'move', direction: 'down', count: 1 },
    }
  }

  if (first === 'M') {
    return {
      type: 'cursor',
      action: { type: 'move', direction: 'up', count: 1 },
    }
  }

  if (first === 'E') {
    return { type: 'cursor', action: { type: 'nextLine', count: 1 } }
  }

  if (first === 'H') {
    return null
  }

  if ('()'.includes(first) && chars.length >= 2) {
    return null
  }

  return { type: 'unknown', sequence: `\x1b${chars}` }
}

export const ESC_SEQUENCES = {
  RESET: '\x1bc',
  SAVE_CURSOR: '\x1b7',
  RESTORE_CURSOR: '\x1b8',
  INDEX: '\x1bD',
  REVERSE_INDEX: '\x1bM',
  NEXT_LINE: '\x1bE',
} as const

export function isEscSequence(char: string): boolean {
  return char === '\x1b'
}

export function isTwoCharEsc(chars: string): boolean {
  if (chars.length < 2) return false
  const first = chars[0]!
  return '()'.includes(first)
}

export function toAction(escAction: EscAction): Action {
  return escAction as unknown as Action
}

export default parseEsc