import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("E2E: Backoff Strategy Flow", () => {
  describe("DEFAULT_BACKOFF", () => {
    it("should have default backoff configuration", async () => {
      const { DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      expect(DEFAULT_BACKOFF.connInitialMs).toBe(2000);
      expect(DEFAULT_BACKOFF.connCapMs).toBe(120000);
      expect(DEFAULT_BACKOFF.connGiveUpMs).toBe(600000);
      expect(DEFAULT_BACKOFF.generalInitialMs).toBe(500);
      expect(DEFAULT_BACKOFF.generalCapMs).toBe(30000);
      expect(DEFAULT_BACKOFF.generalGiveUpMs).toBe(600000);
    });
  });

  describe("createBackoffState", () => {
    it("should create backoff state with initial delay", async () => {
      const { createBackoffState } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(1000);
      
      expect(state.currentDelayMs).toBe(1000);
      expect(state.errorStartTime).toBeNull();
    });

    it("should create state with zero delay", async () => {
      const { createBackoffState } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(0);
      
      expect(state.currentDelayMs).toBe(0);
    });
  });

  describe("computeNextBackoff", () => {
    it("should compute exponential backoff for connection errors", async () => {
      const { createBackoffState, computeNextBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      
      const delay1 = computeNextBackoff(state, DEFAULT_BACKOFF, true);
      expect(delay1).toBeGreaterThan(0);
      
      const delay2 = computeNextBackoff(state, DEFAULT_BACKOFF, true);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it("should compute exponential backoff for general errors", async () => {
      const { createBackoffState, computeNextBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.generalInitialMs);
      
      const delay1 = computeNextBackoff(state, DEFAULT_BACKOFF, false);
      expect(delay1).toBeGreaterThan(0);
      
      const delay2 = computeNextBackoff(state, DEFAULT_BACKOFF, false);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it("should cap backoff at maximum", async () => {
      const { createBackoffState, computeNextBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connCapMs);
      
      for (let i = 0; i < 10; i++) {
        computeNextBackoff(state, DEFAULT_BACKOFF, true);
      }
      
      expect(state.currentDelayMs).toBeLessThanOrEqual(DEFAULT_BACKOFF.connCapMs);
    });

    it("should return -1 when give up time reached", async () => {
      const { createBackoffState, computeNextBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      state.errorStartTime = Date.now() - DEFAULT_BACKOFF.connGiveUpMs - 1000;
      
      const delay = computeNextBackoff(state, DEFAULT_BACKOFF, true);
      
      expect(delay).toBe(-1);
    });

    it("should set error start time on first error", async () => {
      const { createBackoffState, computeNextBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      expect(state.errorStartTime).toBeNull();
      
      computeNextBackoff(state, DEFAULT_BACKOFF, true);
      
      expect(state.errorStartTime).not.toBeNull();
    });
  });

  describe("resetBackoff", () => {
    it("should reset backoff state", async () => {
      const { createBackoffState, computeNextBackoff, resetBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      computeNextBackoff(state, DEFAULT_BACKOFF, true);
      computeNextBackoff(state, DEFAULT_BACKOFF, true);
      
      expect(state.errorStartTime).not.toBeNull();
      expect(state.currentDelayMs).toBeGreaterThan(DEFAULT_BACKOFF.connInitialMs);
      
      resetBackoff(state);
      
      expect(state.currentDelayMs).toBe(0);
      expect(state.errorStartTime).toBeNull();
    });
  });

  describe("isBackoffExpired", () => {
    it("should return false when no error started", async () => {
      const { createBackoffState, isBackoffExpired, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      
      expect(isBackoffExpired(state, DEFAULT_BACKOFF, true)).toBe(false);
    });

    it("should return false before give up time", async () => {
      const { createBackoffState, isBackoffExpired, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      state.errorStartTime = Date.now() - 1000;
      
      expect(isBackoffExpired(state, DEFAULT_BACKOFF, true)).toBe(false);
    });

    it("should return true after give up time", async () => {
      const { createBackoffState, isBackoffExpired, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(DEFAULT_BACKOFF.connInitialMs);
      state.errorStartTime = Date.now() - DEFAULT_BACKOFF.connGiveUpMs - 1000;
      
      expect(isBackoffExpired(state, DEFAULT_BACKOFF, true)).toBe(true);
    });
  });

  describe("sleepWithBackoff", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should sleep for specified duration", async () => {
      const { sleepWithBackoff } = await import("../../backend/utils/backoff.js");
      
      const promise = sleepWithBackoff(1000);
      
      vi.advanceTimersByTime(1000);
      
      await expect(promise).resolves.toBeUndefined();
    });

    it("should be abortable", async () => {
      const { sleepWithBackoff } = await import("../../backend/utils/backoff.js");
      
      const controller = new AbortController();
      const promise = sleepWithBackoff(10000, controller.signal);
      
      controller.abort();
      
      await expect(promise).rejects.toThrow("Sleep aborted");
    });
  });

  describe("BackoffController", () => {
    it("should create controller with default config", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      const config = controller.getConfig();
      
      expect(config.connInitialMs).toBeDefined();
      expect(config.generalInitialMs).toBeDefined();
    });

    it("should create controller with custom config", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController({
        connInitialMs: 500,
        generalInitialMs: 100,
      });
      const config = controller.getConfig();
      
      expect(config.connInitialMs).toBe(500);
      expect(config.generalInitialMs).toBe(100);
    });

    it("should track connection errors separately", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      
      controller.recordConnectionError();
      const connState = controller.getConnectionBackoff();
      
      expect(connState.currentDelayMs).toBeGreaterThan(0);
      expect(connState.errorStartTime).not.toBeNull();
      
      const generalState = controller.getGeneralBackoff();
      expect(generalState.errorStartTime).toBeNull();
    });

    it("should track general errors separately", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      
      controller.recordGeneralError();
      const generalState = controller.getGeneralBackoff();
      
      expect(generalState.currentDelayMs).toBeGreaterThan(0);
      expect(generalState.errorStartTime).not.toBeNull();
      
      const connState = controller.getConnectionBackoff();
      expect(connState.errorStartTime).toBeNull();
    });

    it("should reset both states on success", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      
      controller.recordConnectionError();
      controller.recordGeneralError();
      
      controller.recordSuccess();
      
      const connState = controller.getConnectionBackoff();
      const generalState = controller.getGeneralBackoff();
      
      expect(connState.errorStartTime).toBeNull();
      expect(generalState.errorStartTime).toBeNull();
    });

    it("should check if should give up", async () => {
      const { BackoffController, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      
      expect(controller.shouldGiveUp(true)).toBe(false);
      
      controller.recordConnectionError();
      const connState = controller.getConnectionBackoff();
      connState.errorStartTime = Date.now() - DEFAULT_BACKOFF.connGiveUpMs - 1000;
      
      expect(controller.shouldGiveUp(true)).toBe(true);
    });

    it("should return config copy", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      const config1 = controller.getConfig();
      const config2 = controller.getConfig();
      
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero initial delay", async () => {
      const { createBackoffState, computeNextBackoff, DEFAULT_BACKOFF } = await import("../../backend/utils/backoff.js");
      
      const state = createBackoffState(0);
      const delay = computeNextBackoff(state, DEFAULT_BACKOFF, false);
      
      expect(delay).toBeGreaterThan(0);
    });

    it("should handle very small give up time", async () => {
      const { createBackoffState, computeNextBackoff } = await import("../../backend/utils/backoff.js");
      
      const config = {
        connInitialMs: 100,
        connCapMs: 1000,
        connGiveUpMs: 10,
        generalInitialMs: 100,
        generalCapMs: 1000,
        generalGiveUpMs: 10,
      };
      
      const state = createBackoffState(config.connInitialMs);
      state.errorStartTime = Date.now() - 20;
      
      const delay = computeNextBackoff(state, config, true);
      
      expect(delay).toBe(-1);
    });

    it("should handle concurrent backoff computations", async () => {
      const { BackoffController } = await import("../../backend/utils/backoff.js");
      
      const controller = new BackoffController();
      
      const promises = Array(10).fill(null).map(() => 
        Promise.resolve(controller.recordConnectionError())
      );
      
      await Promise.all(promises);
      
      const state = controller.getConnectionBackoff();
      expect(state.errorStartTime).not.toBeNull();
    });
  });
});
