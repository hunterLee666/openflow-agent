import type { ParsedKeystroke } from './types.js'

export interface Key {
  value: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  super: boolean
  escape?: boolean
  return?: boolean
  tab?: boolean
  backspace?: boolean
  delete?: boolean
  upArrow?: boolean
  downArrow?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  pageUp?: boolean
  pageDown?: boolean
  home?: boolean
  end?: boolean
  wheelUp?: boolean
  wheelDown?: boolean
}

export function getKeyName(input: string, key: Key): string | null {
  if (key.escape) return 'escape'
  if (key.return) return 'enter'
  if (key.tab) return 'tab'
  if (key.backspace) return 'backspace'
  if (key.delete) return 'delete'
  if (key.upArrow) return 'up'
  if (key.downArrow) return 'down'
  if (key.leftArrow) return 'left'
  if (key.rightArrow) return 'right'
  if (key.pageUp) return 'pageup'
  if (key.pageDown) return 'pagedown'
  if (key.wheelUp) return 'wheelup'
  if (key.wheelDown) return 'wheeldown'
  if (key.home) return 'home'
  if (key.end) return 'end'
  if (input.length === 1) return input.toLowerCase()
  return null
}

function getInkModifiers(key: Key): { ctrl: boolean; shift: boolean; meta: boolean; super: boolean } {
  return {
    ctrl: key.ctrl,
    shift: key.shift,
    meta: key.meta,
    super: key.super,
  }
}

function modifiersMatch(
  inkMods: { ctrl: boolean; shift: boolean; meta: boolean; super: boolean },
  target: ParsedKeystroke,
): boolean {
  if (inkMods.ctrl !== target.ctrl) return false
  if (inkMods.shift !== target.shift) return false

  const targetNeedsMeta = target.alt || target.meta
  if (inkMods.meta !== targetNeedsMeta) return false

  if (inkMods.super !== target.super) return false

  return true
}

export function matchesKeystroke(
  input: string,
  key: Key,
  target: ParsedKeystroke,
): boolean {
  const keyName = getKeyName(input, key)
  if (keyName !== target.key) return false

  const inkMods = getInkModifiers(key)

  if (key.escape) {
    const effectiveMeta = false
    if (effectiveMeta !== (target.alt || target.meta)) return false
  } else {
    if (!modifiersMatch(inkMods, target)) return false
  }

  return true
}

export function matchesBinding(
  input: string,
  key: Key,
  chord: ParsedKeystroke[],
): boolean {
  if (chord.length !== 1) return false

  const expected = chord[0]
  return matchesKeystroke(input, key, expected)
}
