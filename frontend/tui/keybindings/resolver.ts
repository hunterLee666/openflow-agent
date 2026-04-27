import type { KeyBinding, KeyHandler, KeyBindingContext } from "./types"
import { findBestMatch } from "./match"
import { DEFAULT_KEYBINDINGS } from "./schema"

export class KeyBindingResolver {
  private bindings: KeyBinding[] = []
  private handlers = new Map<string, KeyHandler>()
  private contexts: KeyBindingContext[] = []
  private activeContext: string | null = null

  constructor(bindings?: KeyBinding[]) {
    this.bindings = bindings ?? DEFAULT_KEYBINDINGS
  }

  register(action: string, handler: KeyHandler): void {
    this.handlers.set(action, handler)
  }

  unregister(action: string): void {
    this.handlers.delete(action)
  }

  addBindings(newBindings: KeyBinding[]): void {
    this.bindings.push(...newBindings)
  }

  removeBindings(action: string): void {
    this.bindings = this.bindings.filter((b) => b.action !== action)
  }

  registerContext(context: KeyBindingContext): void {
    this.contexts.push(context)
    this.addBindings(context.bindings)
  }

  setActiveContext(name: string | null): void {
    this.activeContext = name
  }

  getActiveBindings(): KeyBinding[] {
    if (!this.activeContext) {
      return this.bindings
    }

    const context = this.contexts.find((c) => c.name === this.activeContext)
    if (!context || !context.isActive()) {
      this.activeContext = null
      return this.bindings
    }

    return context.bindings
  }

  resolve(input: string, modifiers: string[]): string | null {
    const bindings = this.getActiveBindings()
    const match = findBestMatch(bindings, input, modifiers)

    return match?.binding.action ?? null
  }

  async execute(input: string, modifiers: string[]): Promise<boolean> {
    const action = this.resolve(input, modifiers)
    if (!action) return false

    const handler = this.handlers.get(action)
    if (!handler) return false

    try {
      await handler()
      return true
    } catch (error) {
      console.error(`Keybinding handler "${action}" failed:`, error)
      return false
    }
  }

  getHandler(action: string): KeyHandler | undefined {
    return this.handlers.get(action)
  }

  getAllBindings(): KeyBinding[] {
    return [...this.bindings]
  }

  getContexts(): KeyBindingContext[] {
    return [...this.contexts]
  }
}

export const globalKeyResolver = new KeyBindingResolver()
