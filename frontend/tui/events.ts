type EventHandler = (...args: unknown[]) => void;

class SimpleDispatcher {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  dispatch(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const globalDispatcher = new SimpleDispatcher();

export const EventTypes = {
  MESSAGE: {
    RECEIVED: "message:received",
    SENT: "message:sent",
    UPDATED: "message:updated",
    DELETED: "message:deleted",
    CLEARED: "message:cleared",
  },
  SESSION: {
    CREATED: "session:created",
    SELECTED: "session:selected",
    DELETED: "session:deleted",
  },
  UI: {
    THEME_CHANGED: "ui:theme-changed",
    SETTINGS_UPDATED: "ui:settings-updated",
  },
  BRIDGE: {
    CONNECTED: "bridge:connected",
    DISCONNECTED: "bridge:disconnected",
    ERROR: "bridge:error",
  },
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];
