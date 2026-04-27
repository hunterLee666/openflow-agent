export type ModifierKey = "ctrl" | "shift" | "alt" | "meta"

export interface KeyBinding {
  key: string
  modifiers?: ModifierKey[]
  action: string
  description?: string
  context?: string
  priority?: number
}

export interface KeyMatch {
  binding: KeyBinding
  matchedAt: number
}

export type KeyHandler = () => void | Promise<void>

export interface KeyBindingContext {
  name: string
  bindings: KeyBinding[]
  isActive: () => boolean
}
