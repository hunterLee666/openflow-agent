export interface BackoffConfig {
  connInitialMs: number;
  connCapMs: number;
  connGiveUpMs: number;
  generalInitialMs: number;
  generalCapMs: number;
  generalGiveUpMs: number;
  shutdownGraceMs?: number;
  stopWorkBaseDelayMs?: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  connInitialMs: 2_000,
  connCapMs: 120_000,
  connGiveUpMs: 600_000,
  generalInitialMs: 500,
  generalCapMs: 30_000,
  generalGiveUpMs: 600_000,
  shutdownGraceMs: 30_000,
  stopWorkBaseDelayMs: 1_000,
};

export interface BackoffState {
  currentDelayMs: number;
  errorStartTime: number | null;
}

export function createBackoffState(initialDelayMs: number): BackoffState {
  return {
    currentDelayMs: initialDelayMs,
    errorStartTime: null,
  };
}

export function computeNextBackoff(
  state: BackoffState,
  config: BackoffConfig,
  isConnectionError: boolean
): number {
  const baseInitial = isConnectionError ? config.connInitialMs : config.generalInitialMs;
  const cap = isConnectionError ? config.connCapMs : config.generalCapMs;

  if (state.errorStartTime === null) {
    state.errorStartTime = Date.now();
  }

  const elapsed = Date.now() - state.errorStartTime;
  const giveUpMs = isConnectionError ? config.connGiveUpMs : config.generalGiveUpMs;

  if (elapsed >= giveUpMs) {
    return -1;
  }

  const newDelay = Math.min(state.currentDelayMs * 2, cap);
  state.currentDelayMs = Math.max(newDelay, baseInitial);

  return state.currentDelayMs;
}

export function resetBackoff(state: BackoffState): void {
  state.currentDelayMs = 0;
  state.errorStartTime = null;
}

export function isBackoffExpired(
  state: BackoffState,
  config: BackoffConfig,
  isConnectionError: boolean
): boolean {
  if (state.errorStartTime === null) {
    return false;
  }

  const giveUpMs = isConnectionError ? config.connGiveUpMs : config.generalGiveUpMs;
  const elapsed = Date.now() - state.errorStartTime;

  return elapsed >= giveUpMs;
}

export function sleepWithBackoff(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);

    if (signal) {
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error('Sleep aborted'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

export class BackoffController {
  private connState: BackoffState;
  private generalState: BackoffState;
  private config: BackoffConfig;

  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = { ...DEFAULT_BACKOFF, ...config };
    this.connState = createBackoffState(this.config.connInitialMs);
    this.generalState = createBackoffState(this.config.generalInitialMs);
  }

  recordConnectionError(): number {
    const delay = computeNextBackoff(this.connState, this.config, true);
    return delay;
  }

  recordGeneralError(): number {
    const delay = computeNextBackoff(this.generalState, this.config, false);
    return delay;
  }

  recordSuccess(): void {
    resetBackoff(this.connState);
    resetBackoff(this.generalState);
  }

  getConnectionBackoff(): BackoffState {
    return this.connState;
  }

  getGeneralBackoff(): BackoffState {
    return this.generalState;
  }

  shouldGiveUp(isConnectionError: boolean): boolean {
    const state = isConnectionError ? this.connState : this.generalState;
    return isBackoffExpired(state, this.config, isConnectionError);
  }

  getConfig(): BackoffConfig {
    return { ...this.config };
  }
}
