import type { KeyBinding, KeyMatch } from "./types"

export function normalizeKey(input: string): string {
  return input.toLowerCase()
}

export function normalizeModifiers(modifiers?: string[]): string[] {
  return (modifiers ?? []).map((m) => m.toLowerCase()).sort()
}

export function bindingToString(binding: KeyBinding): string {
  const mods = binding.modifiers ?? []
  const modStr = mods.length > 0 ? mods.map((m) => m + "+").join("") : ""
  return `${modStr}${binding.key}`
}

export function matchesKey(
  binding: KeyBinding,
  input: string,
  modifiers: string[]
): boolean {
  if (normalizeKey(binding.key) !== normalizeKey(input)) {
    return false
  }

  const bindingMods = normalizeModifiers(binding.modifiers)
  const inputMods = normalizeModifiers(modifiers)

  if (bindingMods.length !== inputMods.length) {
    return false
  }

  return bindingMods.every((mod, i) => mod === inputMods[i])
}

export function findMatchingBindings(
  bindings: KeyBinding[],
  input: string,
  modifiers: string[]
): KeyMatch[] {
  return bindings
    .filter((b) => matchesKey(b, input, modifiers))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((b) => ({
      binding: b,
      matchedAt: Date.now(),
    }))
}

export function findBestMatch(
  bindings: KeyBinding[],
  input: string,
  modifiers: string[]
): KeyMatch | null {
  const matches = findMatchingBindings(bindings, input, modifiers)
  return matches.length > 0 ? matches[0] : null
}
