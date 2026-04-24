import type { Store } from "./types.js";

export interface Subscriber<T> {
  callback: (value: T) => void;
  subscribedAt: number;
}

export class AppStateStore<T extends Record<string, unknown>>
  implements Store<T>
{
  private state: T;
  private subscribers = new Map<symbol, Subscriber<T>>();
  private changeCallbacks: ((newState: T, oldState: T) => void)[] = [];

  constructor(initialState: T) {
    this.state = initialState;
  }

  get(): T {
    return this.state;
  }

  set(value: T | ((prev: T) => T)): void {
    if (typeof value === "function") {
      const updater = value as (prev: T) => T;
      const newState = updater(this.state);
      this.setState(newState);
    } else {
      this.setState(value);
    }
  }

  update(updater: (prev: T) => T): void {
    const newState = updater(this.state);
    this.setState(newState);
  }

  private setState(newState: T): void {
    const oldState = this.state;
    if (oldState === newState) {
      return;
    }
    this.state = newState;
    this.notifySubscribers(newState, oldState);
    this.notifyChangeCallbacks(newState, oldState);
  }

  subscribe(callback: (value: T) => void): () => void {
    const id = Symbol();
    const subscriber: Subscriber<T> = {
      callback,
      subscribedAt: Date.now(),
    };
    this.subscribers.set(id, subscriber);

    return () => {
      this.subscribers.delete(id);
    };
  }

  subscribeWithSymbol(
    callback: (value: T) => void
  ): symbol {
    const id = Symbol();
    const subscriber: Subscriber<T> = {
      callback,
      subscribedAt: Date.now(),
    };
    this.subscribers.set(id, subscriber);
    return id;
  }

  unsubscribe(id: symbol): void {
    this.subscribers.delete(id);
  }

  private notifySubscribers(newState: T, oldState: T): void {
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber.callback(newState);
      } catch (error) {
        console.error("Subscriber callback error:", error);
      }
    });
  }

  onDidChange(callback: (newState: T, oldState: T) => void): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index > -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyChangeCallbacks(newState: T, oldState: T): void {
    this.changeCallbacks.forEach((callback) => {
      try {
        callback(newState, oldState);
      } catch (error) {
        console.error("Change callback error:", error);
      }
    });
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  snapshot(): T {
    return { ...this.state };
  }
}

export interface StoreConfig<T extends Record<string, unknown>> {
  initialState: T;
  onChange?: (newState: T, oldState: T) => void;
  persistence?: {
    key: string;
    load?: () => Promise<T | null>;
    save?: (state: T) => Promise<void>;
  };
}

export function createStore<T extends Record<string, unknown>>(
  config: StoreConfig<T>
): AppStateStore<T> {
  const store = new AppStateStore<T>(config.initialState);

  if (config.onChange) {
    store.onDidChange(config.onChange);
  }

  return store;
}

export function createReactiveStore<T extends Record<string, unknown>>(
  initialState: T
): AppStateStore<T> {
  return new AppStateStore<T>(initialState);
}
