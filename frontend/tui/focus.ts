import { DOMElement } from './events/dispatcher.js'
import { FocusEvent } from './events/dispatcher.js'

const MAX_FOCUS_STACK = 10

export class FocusManager {
  activeElement: DOMElement | null = null
  private focusStack: DOMElement[] = []
  private enabled = true

  constructor(
    private dispatchFocusEvent: (target: DOMElement, event: FocusEvent) => boolean,
  ) {}

  focus(node: DOMElement): boolean {
    if (node === this.activeElement) return true
    if (!this.enabled) return false

    const previous = this.activeElement
    if (previous) {
      const idx = this.focusStack.indexOf(previous)
      if (idx !== -1) this.focusStack.splice(idx, 1)
      this.focusStack.push(previous)
      if (this.focusStack.length > MAX_FOCUS_STACK) this.focusStack.shift()
      this.dispatchFocusEvent(previous, new FocusEvent('blur', node))
    }

    this.activeElement = node
    this.dispatchFocusEvent(node, new FocusEvent('focus', previous))
    return true
  }

  blur(): void {
    if (!this.activeElement) return

    const previous = this.activeElement
    this.activeElement = null
    this.dispatchFocusEvent(previous, new FocusEvent('blur', null))
  }

  blurTo(parent: DOMElement): boolean {
    if (!this.activeElement) return true

    let current: DOMElement | null = this.activeElement
    while (current && current !== parent) {
      current = (current as DOMElement).parentNode
    }

    if (current !== parent) return false

    const previous = this.activeElement
    this.activeElement = null
    this.dispatchFocusEvent(previous, new FocusEvent('blur', null))
    return true
  }

  restore(): boolean {
    const previous = this.focusStack.pop()
    if (!previous) return false

    if (this.activeElement) {
      this.dispatchFocusEvent(this.activeElement, new FocusEvent('blur', previous))
    }

    this.activeElement = previous
    this.dispatchFocusEvent(previous, new FocusEvent('focus', null))
    return true
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  getPreviousElement(): DOMElement | null {
    return this.focusStack[this.focusStack.length - 1] ?? null
  }

  isActive(element: DOMElement): boolean {
    return this.activeElement === element
  }
}

export function createFocusManager(
  dispatchFocusEvent: (target: DOMElement, event: FocusEvent) => boolean,
): FocusManager {
  return new FocusManager(dispatchFocusEvent)
}
