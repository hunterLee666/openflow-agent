// Minimal context store (stub)
type ContextValue = Record<string, any>;
let globalContext: ContextValue = {};

export function getContext<T extends ContextValue = ContextValue>(): T {
  return globalContext as T;
}

export function setContext(context: ContextValue): void {
  globalContext = { ...globalContext, ...context };
}

export function removeContext(...keys: string[]): void {
  for (const key of keys) {
    delete globalContext[key];
  }
}
