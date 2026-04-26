import { BaseEvent } from './event.js'

type EventHandler = (event: BaseEvent) => void

interface HandlerMap {
  [type: string]: {
    capture?: EventHandler
    bubble?: EventHandler
  }
}

export interface DOMElement {
  parentNode: DOMElement | null
  dispatchEvent(event: BaseEvent): boolean
  addEventListener(type: string, handler: EventHandler, capture?: boolean): void
  removeEventListener(
    type: string,
    handler: EventHandler,
    capture?: boolean,
  ): void
}

function collectListeners(
  target: DOMElement,
  event: BaseEvent,
): Array<{ node: DOMElement; handler: EventHandler; phase: 'capturing' | 'at_target' | 'bubbling' }> {
  const listeners: Array<{
    node: DOMElement
    handler: EventHandler
    phase: 'capturing' | 'at_target' | 'bubbling'
  }> = []

  let node: DOMElement | undefined = target

  while (node) {
    const handlers = (node as unknown as { __handlers?: HandlerMap }).__handlers?.[event.constructor.name]

    if (handlers?.capture) {
      listeners.unshift({
        node,
        handler: handlers.capture,
        phase: node === target ? 'at_target' : 'capturing',
      })
    }

    if (handlers?.bubble && (event.bubbles || node === target)) {
      listeners.push({
        node,
        handler: handlers.bubble,
        phase: node === target ? 'at_target' : 'bubbling',
      })
    }

    node = node.parentNode ?? undefined
  }

  return listeners
}

export class Dispatcher {
  static dispatch(target: DOMElement, event: BaseEvent): boolean {
    const listeners = collectListeners(target, event)

    for (const listener of listeners) {
      listener.handler(event)

      if (event.didStopImmediatePropagation()) {
        return true
      }
    }

    return true
  }
}

export function createEventTarget(): DOMElement {
  const internals: { handlers: HandlerMap } = {
    handlers: {},
  }

  return {
    parentNode: null,

    dispatchEvent(event: BaseEvent): boolean {
      const handlers = internals.handlers[event.constructor.name]
      if (!handlers) return true

      if (handlers.capture) {
        handlers.capture(event)
      }

      if (!event.bubbles || event.didStopImmediatePropagation()) {
        return true
      }

      if (handlers.bubble) {
        handlers.bubble(event)
      }

      return true
    },

    addEventListener(
      type: string,
      handler: EventHandler,
      capture = false,
    ): void {
      if (!internals.handlers[type]) {
        internals.handlers[type] = {}
      }
      if (capture) {
        internals.handlers[type].capture = handler
      } else {
        internals.handlers[type].bubble = handler
      }
    },

    removeEventListener(
      type: string,
      handler: EventHandler,
      capture = false,
    ): void {
      const handlers = internals.handlers[type]
      if (handlers) {
        if (capture) {
          handlers.capture = undefined
        } else {
          handlers.bubble = undefined
        }
      }
    },
  } as DOMElement
}

export class FocusEvent extends BaseEvent {
  constructor(
    public readonly type: 'focus' | 'blur',
    public readonly relatedTarget: DOMElement | null,
  ) {
    super(type)
  }
}

export class KeyboardEvent extends BaseEvent {
  constructor(
    public readonly type: 'keydown' | 'keyup' | 'keypress',
    public readonly key: string,
    public readonly code: string,
    public readonly ctrlKey: boolean,
    public readonly shiftKey: boolean,
    public readonly altKey: boolean,
    public readonly metaKey: boolean,
  ) {
    super(type)
  }
}

export class MouseEvent extends BaseEvent {
  constructor(
    public readonly type: 'click' | 'mousedown' | 'mouseup' | 'mousemove',
    public readonly x: number,
    public readonly y: number,
    public readonly button: number,
  ) {
    super(type)
  }
}