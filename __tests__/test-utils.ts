export interface Mockable {
  fetch?: typeof fetch;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  Date?: typeof Date;
  Math?: typeof Math;
  JSON?: typeof JSON;
}

export interface MockConfig {
  mockDate?: boolean;
  mockTimers?: boolean;
  mockNetwork?: boolean;
  mockRandom?: boolean;
  seed?: number;
}

export class TestMock {
  private originalValues: Map<string, unknown> = new Map();
  private mocks: Map<string, unknown> = new Map();

  constructor(private config: MockConfig = {}) {}

  mock<T>(key: string, value: T): void {
    this.originalValues.set(key, (globalThis as Record<string, unknown>)[key]);
    (globalThis as Record<string, unknown>)[key] = value;
    this.mocks.set(key, value);
  }

  restore(): void {
    for (const [key, value] of this.originalValues) {
      (globalThis as Record<string, unknown>)[key] = value;
    }
    this.originalValues.clear();
    this.mocks.clear();
  }

  get<T>(key: string): T | undefined {
    return this.mocks.get(key) as T | undefined;
  }
}

export class AsyncTestHelper {
  private originalFetch?: typeof fetch;
  private pendingRequests: Array<{ url: string; resolve: (value: unknown) => void }> = [];

  async waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForCondition(
    condition: () => boolean,
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (condition()) {
        return true;
      }
      await this.waitFor(intervalMs);
    }

    return false;
  }

  async waitForAsyncOperation(
    operation: () => Promise<boolean>,
    timeoutMs: number = 5000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await operation()) {
        return true;
      }
      await this.waitFor(50);
    }

    return false;
  }

  async flushPromises(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export class MockFetch {
  private responses: Map<string, MockResponse> = new Map();
  private requests: Array<{ url: string; options?: RequestInit }> = [];

  addResponse(url: string, response: MockResponse): void {
    this.responses.set(url, response);
  }

  private createMockFetch(): (url: string, options?: RequestInit) => Promise<Response> {
    return async (url: string, options?: RequestInit): Promise<Response> => {
      this.requests.push({ url, options });

      const response = this.responses.get(url);

      if (!response) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (response.delay) {
        await new Promise((resolve) => setTimeout(resolve, response.delay));
      }

      return new Response(
        typeof response.body === "string" ? response.body : JSON.stringify(response.body),
        {
          status: response.status || 200,
          headers: response.headers || { "Content-Type": "application/json" },
        }
      );
    };
  }

  install(): (url: string, options?: RequestInit) => Promise<Response> {
    this.originalFetch = globalThis.fetch;
    const mockFetch = this.createMockFetch();
    (globalThis as { fetch: (url: string, options?: RequestInit) => Promise<Response> }).fetch = mockFetch;
    return mockFetch;
  }

  uninstall(): void {
    if (this.originalFetch) {
      (globalThis as { fetch: typeof globalThis.fetch }).fetch = this.originalFetch;
    }
  }

  private originalFetch: typeof fetch | undefined;

  getRequests(): Array<{ url: string; options?: RequestInit }> {
    return [...this.requests];
  }

  getRequestsByUrl(url: string): Array<{ url: string; options?: RequestInit }> {
    return this.requests.filter((r) => r.url === url);
  }

  clearRequests(): void {
    this.requests = [];
  }
}

export interface MockResponse {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
  delay?: number;
}

export class MockTimer {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private timerId = 0;
  private time = 0;

  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const id = `mock_${++this.timerId}`;
    const timeout: NodeJS.Timeout = {
      ref: () => timeout,
      unref: () => timeout,
      hasRef: () => true,
      refresh: () => timeout,
      [Symbol.toPrimitive]: () => id,
    } as unknown as NodeJS.Timeout;

    this.timers.set(id, timeout);

    setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, ms);

    return timeout;
  }

  clearTimeout(id: NodeJS.Timeout): void {
    const key = String(id);
    this.timers.delete(key);
  }

  advance(ms: number): void {
    this.time += ms;
  }

  getTime(): number {
    return this.time;
  }

  getPendingTimers(): string[] {
    return Array.from(this.timers.keys());
  }

  clearAll(): void {
    for (const timeout of this.timers.values()) {
      this.clearTimeout(timeout);
    }
  }
}

export function createMockObject<T extends object>(defaults?: Partial<T>): T {
  return new Proxy({} as T, {
    get(target, prop, receiver) {
      if (prop in (defaults || {})) {
        return (defaults as Record<string, unknown>)[prop as string];
      }
      if (prop === "toJSON") {
        return () => target;
      }
      return createMockFunction();
    },
    set(target, prop, value) {
      if (defaults) {
        (defaults as Record<string, unknown>)[prop as string] = value;
      }
      return true;
    },
  });
}

export function createMockFunction<T extends (...args: unknown[]) => unknown = () => void>(): T {
  const fn = async (...args: unknown[]): Promise<unknown> => {
    return args;
  };
  return fn as T;
}

export function createMockArray<T>(items: T[]): T[] & { mockMethods: MockArrayMethods<T> } {
  const arr = [...items];

  return new Proxy(arr as unknown as T[] & { mockMethods: MockArrayMethods<T> }, {
    get(target, prop) {
      if (prop === "mockMethods") {
        return {
          push: (...items: T[]) => target.push(...items),
          pop: () => target.pop(),
          shift: () => target.shift(),
          splice: (start: number, deleteCount?: number) => target.splice(start, deleteCount),
          get length() { return target.length; },
        };
      }
      return (target as unknown as Record<string, unknown>)[prop as string];
    },
  }) as T[] & { mockMethods: MockArrayMethods<T> };
}

export interface MockArrayMethods<T> {
  push: (...items: T[]) => number;
  pop: () => T | undefined;
  shift: () => T | undefined;
  splice: (start: number, deleteCount?: number) => T[];
  length: number;
}

export function generateTestId(prefix: string = "test"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createSpy<T extends (...args: unknown[]) => unknown>(
  implementation?: T
): {
  fn: T;
  calls: Array<{ args: Parameters<T>; result?: ReturnType<T>; error?: Error }>;
  reset: () => void;
} {
  const calls: Array<{ args: Parameters<T>; result?: ReturnType<T>; error?: Error }> = [];

  const fn = ((...args: Parameters<T>) => {
    try {
      const result = implementation ? implementation(...args) : undefined;
      calls.push({ args, result: result as ReturnType<T> });
      return result;
    } catch (error) {
      calls.push({ args, error: error as Error });
      throw error;
    }
  }) as T;

  return {
    fn,
    calls,
    reset: () => { calls.length = 0; },
  };
}

export class MockEventEmitter<T extends Record<string, unknown[]> = Record<string, unknown[]>> {
  private listeners: Map<keyof T, Set<Function>> = new Map();

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => this.off(event, listener);
  }

  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error("Event listener error:", error);
        }
      }
    }
  }

  getListenerCount(event: keyof T): number {
    return this.listeners.get(event)?.size || 0;
  }

  clear(event?: keyof T): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
