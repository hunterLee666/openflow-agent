export const logMock = {
  info: (message: string, ...args: unknown[]) => {},
  warn: (message: string, ...args: unknown[]) => {},
  error: (message: string, ...args: unknown[]) => {},
  debug: (message: string, ...args: unknown[]) => {},
  log: (message: string, ...args: unknown[]) => {},
};

export const consoleMock = {
  log: (message: string, ...args: unknown[]) => {},
  info: (message: string, ...args: unknown[]) => {},
  warn: (message: string, ...args: unknown[]) => {},
  error: (message: string, ...args: unknown[]) => {},
  debug: (message: string, ...args: unknown[]) => {},
};

export function createLogMock() {
  return {
    info: (message: string, ...args: unknown[]) => {},
    warn: (message: string, ...args: unknown[]) => {},
    error: (message: string, ...args: unknown[]) => {},
    debug: (message: string, ...args: unknown[]) => {},
    log: (message: string, ...args: unknown[]) => {},
  };
}

export function createConsoleMock() {
  return {
    log: (message: string, ...args: unknown[]) => {},
    info: (message: string, ...args: unknown[]) => {},
    warn: (message: string, ...args: unknown[]) => {},
    error: (message: string, ...args: unknown[]) => {},
    debug: (message: string, ...args: unknown[]) => {},
  };
}

export function resetMocks(...mocks: unknown[]) {
  for (const mock of mocks) {
    if (mock && typeof mock === "object" && "mock" in mock) {
      const m = mock as { mock: { Clear: () => void } };
      m.mock.Clear();
    }
  }
}
