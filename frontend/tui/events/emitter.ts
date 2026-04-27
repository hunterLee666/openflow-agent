import type { EventType, EventHandler, EventPayload, EventFilter } from "./event"

export class EventEmitter {
  private listeners = new Map<EventType, Set<EventHandler>>()
  private filters = new Map<EventType, Set<EventFilter>>()
  private history: EventPayload[] = []
  private maxHistory = 100

  on<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EventHandler)

    return () => this.off(event, handler as EventHandler)
  }

  off<T = unknown>(event: EventType, handler: EventHandler<T>): void {
    this.listeners.get(event)?.delete(handler as EventHandler)
  }

  once<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
    const onceHandler = (payload: EventPayload<T>) => {
      handler(payload)
      this.off(event, onceHandler as EventHandler)
    }
    return this.on(event, onceHandler)
  }

  filter<T = unknown>(
    event: EventType,
    predicate: (payload: EventPayload<T>) => boolean,
    handler: EventHandler<T>
  ): () => void {
    if (!this.filters.has(event)) {
      this.filters.set(event, new Set())
    }

    const filter: EventFilter<T> = { predicate, handler }
    this.filters.get(event)!.add(filter as EventFilter)

    return () => {
      this.filters.get(event)?.delete(filter as EventFilter)
    }
  }

  emit<T = unknown>(type: EventType, data: T, source?: string): void {
    const payload: EventPayload<T> = {
      type,
      data,
      timestamp: Date.now(),
      source,
    }

    this.history.push(payload)
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    this.listeners.get(type)?.forEach((handler) => {
      try {
        handler(payload)
      } catch (error) {
        console.error(`Event handler error for ${String(type)}:`, error)
      }
    })

    this.filters.get(type)?.forEach((filter) => {
      try {
        if (filter.predicate(payload)) {
          ;(filter.handler as EventHandler<T>)(payload)
        }
      } catch (error) {
        console.error(`Event filter error for ${String(type)}:`, error)
      }
    })
  }

  getHistory(): ReadonlyArray<EventPayload> {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  removeAllListeners(event?: EventType): void {
    if (event) {
      this.listeners.delete(event)
      this.filters.delete(event)
    } else {
      this.listeners.clear()
      this.filters.clear()
    }
  }

  listenerCount(event: EventType): number {
    return this.listeners.get(event)?.size ?? 0
  }
}
