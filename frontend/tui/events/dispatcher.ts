import { EventEmitter } from "./emitter"
import type { EventType, EventHandler, EventPayload } from "./event"

export class EventDispatcher {
  private emitter: EventEmitter
  private middleware: Array<(payload: EventPayload) => EventPayload | void> = []

  constructor(emitter?: EventEmitter) {
    this.emitter = emitter ?? new EventEmitter()
  }

  use(middleware: (payload: EventPayload) => EventPayload | void): void {
    this.middleware.push(middleware)
  }

  dispatch<T = unknown>(type: EventType, data: T, source?: string): void {
    let payload: EventPayload<T> = {
      type,
      data,
      timestamp: Date.now(),
      source,
    }

    for (const mw of this.middleware) {
      const result = mw(payload)
      if (result === null) return
      if (result) payload = result as EventPayload<T>
    }

    this.emitter.emit(type, payload.data, payload.source)
  }

  on<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
    return this.emitter.on(event, handler)
  }

  once<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
    return this.emitter.once(event, handler)
  }

  off<T = unknown>(event: EventType, handler: EventHandler<T>): void {
    this.emitter.off(event, handler)
  }

  getEmitter(): EventEmitter {
    return this.emitter
  }
}

export const globalDispatcher = new EventDispatcher()
