import type { KeybindingAction, KeybindingContextName } from './schema.js'
import type { ParsedBinding, ParsedKeystroke } from './types.js'
import { matchesKeystroke, type Key } from './match.js'

export { type Key }

export type ResolveResult =
  | { type: 'match'; action: KeybindingAction }
  | { type: 'none' }
  | { type: 'unbound' }

export type ChordResolveResult =
  | { type: 'match'; action: KeybindingAction }
  | { type: 'none' }
  | { type: 'unbound' }
  | { type: 'chord_started'; pending: ParsedKeystroke[] }
  | { type: 'chord_cancelled' }

export function parseKeystroke(input: string): ParsedKeystroke {
  const parts = input.split('+')
  const keystroke: ParsedKeystroke = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    super: false,
  }
  for (const part of parts) {
    const lower = part.toLowerCase()
    switch (lower) {
      case 'ctrl':
      case 'control':
        keystroke.ctrl = true
        break
      case 'alt':
      case 'opt':
      case 'option':
        keystroke.alt = true
        break
      case 'shift':
        keystroke.shift = true
        break
      case 'meta':
        keystroke.meta = true
        break
      case 'cmd':
      case 'command':
      case 'super':
      case 'win':
        keystroke.super = true
        break
      case 'esc':
        keystroke.key = 'escape'
        break
      case 'return':
        keystroke.key = 'enter'
        break
      case 'space':
        keystroke.key = ' '
        break
      case '↑':
        keystroke.key = 'up'
        break
      case '↓':
        keystroke.key = 'down'
        break
      case '←':
        keystroke.key = 'left'
        break
      case '→':
        keystroke.key = 'right'
        break
      default:
        keystroke.key = lower
        break
    }
  }
  return keystroke
}

export function keystrokeToString(ks: ParsedKeystroke): string {
  const parts: string[] = []
  if (ks.ctrl) parts.push('ctrl')
  if (ks.alt) parts.push('alt')
  if (ks.shift) parts.push('shift')
  if (ks.meta) parts.push('meta')
  if (ks.super) parts.push('cmd')
  const displayKey = keyToDisplayName(ks.key)
  parts.push(displayKey)
  return parts.join('+')
}

function keyToDisplayName(key: string): string {
  switch (key) {
    case 'escape':
      return 'Esc'
    case ' ':
      return 'Space'
    case 'tab':
      return 'Tab'
    case 'enter':
      return 'Enter'
    case 'backspace':
      return 'Backspace'
    case 'delete':
      return 'Delete'
    case 'up':
      return '↑'
    case 'down':
      return '↓'
    case 'left':
      return '←'
    case 'right':
      return '→'
    case 'pageup':
      return 'PageUp'
    case 'pagedown':
      return 'PageDown'
    case 'home':
      return 'Home'
    case 'end':
      return 'End'
    default:
      return key
  }
}

export function chordToString(chord: ParsedKeystroke[]): string {
  return chord.map(keystrokeToString).join(' ')
}

export function parseBindingString(
  keyString: string,
  action: KeybindingAction | null,
  context: KeybindingContextName,
): ParsedBinding {
  const keys = keyString.trim().split(/\s+/)
  const chord = keys.map(parseKeystroke)
  return {
    chord,
    action,
    context,
  }
}

export function resolveKey(
  input: string,
  key: Key,
  activeContexts: KeybindingContextName[],
  bindings: ParsedBinding[],
): ResolveResult {
  let match: ParsedBinding | undefined
  const ctxSet = new Set(activeContexts)

  for (const binding of bindings) {
    if (binding.chord.length !== 1) continue
    if (!ctxSet.has(binding.context as KeybindingContextName)) continue

    if (matchesKeystroke(input, key, binding.chord[0]!)) {
      match = binding
    }
  }

  if (!match) {
    return { type: 'none' }
  }

  if (match.action === null) {
    return { type: 'unbound' }
  }

  return { type: 'match', action: match.action as KeybindingAction }
}

export function resolveChord(
  pending: ParsedKeystroke[],
  input: string,
  key: Key,
  activeContexts: KeybindingContextName[],
  bindings: ParsedBinding[],
): ChordResolveResult {
  const nextPending = [...pending, { key: input, ctrl: key.ctrl, alt: key.alt, shift: key.shift, meta: key.meta, super: key.super }]
  const ctxSet = new Set(activeContexts)

  for (const binding of bindings) {
    if (binding.chord.length !== nextPending.length) continue
    if (!ctxSet.has(binding.context as KeybindingContextName)) continue

    const allMatch = binding.chord.every((parsed, i) => {
      const actual = nextPending[i]!
      return parsed.key === actual.key &&
        parsed.ctrl === actual.ctrl &&
        parsed.alt === actual.alt &&
        parsed.shift === actual.shift &&
        parsed.meta === actual.meta &&
        parsed.super === actual.super
    })

    if (allMatch) {
      if (binding.action === null) {
        return { type: 'unbound' }
      }
      return { type: 'match', action: binding.action as KeybindingAction }
    }
  }

  const isPartialMatch = bindings.some(binding => {
    if (binding.chord.length < nextPending.length) return false
    if (!ctxSet.has(binding.context as KeybindingContextName)) return false
    return binding.chord.slice(0, nextPending.length).every((parsed, i) => {
      const actual = nextPending[i]!
      return parsed.key === actual.key &&
        parsed.ctrl === actual.ctrl &&
        parsed.alt === actual.alt &&
        parsed.shift === actual.shift &&
        parsed.meta === actual.meta &&
        parsed.super === actual.super
    })
  })

  if (isPartialMatch) {
    return { type: 'chord_started', pending: nextPending }
  }

  return { type: 'chord_cancelled' }
}
