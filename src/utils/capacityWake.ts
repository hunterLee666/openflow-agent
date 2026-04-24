export interface CapacityWakeSignal {
  signal: () => AbortSignal;
  wake: () => void;
  cleanup: () => void;
}

export function createCapacityWake(abortSignal: AbortSignal): CapacityWakeSignal {
  let wakeResolve: (() => void) | null = null;
  let wakePromise: Promise<void> | null = null;
  let cleanupFn: (() => void) | null = null;

  const signal = (): AbortSignal => {
    if (!wakePromise) {
      wakePromise = new Promise<void>((resolve) => {
        wakeResolve = resolve;
      });
    }

    const controller = new AbortController();

    const abortHandler = () => {
      controller.abort();
      cleanupFn?.();
    };

    abortSignal.addEventListener('abort', abortHandler, { once: true });

    cleanupFn = () => {
      abortSignal.removeEventListener('abort', abortHandler);
    };

    Promise.race([
      wakePromise,
      new Promise<undefined>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          cleanupFn?.();
          reject(new Error('Aborted'));
        });
      }),
    ]).catch(() => {});

    return controller.signal;
  };

  return {
    signal,
    wake: () => {
      if (wakeResolve) {
        wakeResolve();
        wakeResolve = null;
        wakePromise = null;
      }
    },
    cleanup: () => {
      cleanupFn?.();
      if (wakeResolve) {
        wakeResolve = null;
        wakePromise = null;
      }
    },
  };
}

export interface CapacityState {
  current: number;
  max: number;
  isAtCapacity: boolean;
  isIdle: boolean;
}

export class CapacityManager {
  private current = 0;
  private max: number;
  private wake: CapacityWakeSignal | null = null;

  constructor(max: number) {
    this.max = max;
  }

  acquire(): boolean {
    if (this.current >= this.max) {
      return false;
    }
    this.current++;
    return true;
  }

  release(): void {
    if (this.current > 0) {
      this.current--;
      this.wake?.wake();
    }
  }

  getState(): CapacityState {
    return {
      current: this.current,
      max: this.max,
      isAtCapacity: this.current >= this.max,
      isIdle: this.current === 0,
    };
  }

  setMax(max: number): void {
    this.max = max;
    this.wake?.wake();
  }

  setWake(wake: CapacityWakeSignal): void {
    this.wake = wake;
  }
}
