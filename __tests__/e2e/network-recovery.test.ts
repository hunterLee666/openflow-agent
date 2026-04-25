import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("E2E: Network Recovery Edge Cases", () => {
  describe("CircuitBreaker", () => {
    it("should start in closed state", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 5000,
      });
      
      expect(breaker.getState()).toBe("closed");
    });

    it("should open after failure threshold", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 5000,
      });
      
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error("Failed")));
        } catch {}
      }
      
      expect(breaker.getState()).toBe("open");
    });

    it("should reject immediately when open", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 1000,
        resetTimeout: 10000,
      });
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      expect(breaker.getState()).toBe("open");
      
      await expect(
        breaker.execute(() => Promise.resolve("success"))
      ).rejects.toThrow("Circuit breaker is open");
    });

    it("should transition to half-open after reset timeout", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 1000,
        resetTimeout: 100,
      });
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      expect(breaker.getState()).toBe("open");
      
      await new Promise(r => setTimeout(r, 150));
      
      const result = await breaker.execute(() => Promise.resolve("success"));
      expect(result).toBe("success");
      expect(breaker.getState()).toBe("closed");
    });

    it("should close after success threshold in half-open", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 100,
      });
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      await new Promise(r => setTimeout(r, 150));
      
      await breaker.execute(() => Promise.resolve("success1"));
      expect(breaker.getState()).toBe("half-open");
      
      await breaker.execute(() => Promise.resolve("success2"));
      expect(breaker.getState()).toBe("closed");
    });

    it("should reopen on failure in half-open", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 100,
      });
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      await new Promise(r => setTimeout(r, 150));
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed again")));
      } catch {}
      
      expect(breaker.getState()).toBe("open");
    });

    it("should track stats correctly", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 5000,
      });
      
      await breaker.execute(() => Promise.resolve("success1"));
      await breaker.execute(() => Promise.resolve("success2"));
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(1);
      expect(stats.state).toBe("closed");
      expect(stats.lastSuccess).toBeInstanceOf(Date);
      expect(stats.lastFailure).toBeInstanceOf(Date);
    });

    it("should reset manually", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 1000,
        resetTimeout: 10000,
      });
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      expect(breaker.getState()).toBe("open");
      
      breaker.reset();
      
      expect(breaker.getState()).toBe("closed");
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });
  });

  describe("Retry", () => {
    it("should succeed on first attempt", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      const result = await retry(
        () => Promise.resolve("success"),
        { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 1000, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
    });

    it("should retry on failure", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      let attempts = 0;
      const result = await retry(
        () => {
          attempts++;
          if (attempts < 3) {
            return Promise.reject(new Error("Failed"));
          }
          return Promise.resolve("success");
        },
        { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 1000, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.attempts).toBe(3);
      expect(result.totalDelayMs).toBeGreaterThan(0);
    });

    it("should fail after max retries", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      const result = await retry(
        () => Promise.reject(new Error("Always fails")),
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 1000, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe("Always fails");
      expect(result.attempts).toBe(3);
    });

    it("should apply exponential backoff", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      const delays: number[] = [];
      let lastTime = Date.now();
      
      const result = await retry(
        () => {
          const now = Date.now();
          if (lastTime > 0) {
            delays.push(now - lastTime);
          }
          lastTime = now;
          return Promise.reject(new Error("Failed"));
        },
        { maxRetries: 3, initialDelayMs: 20, maxDelayMs: 1000, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(false);
      expect(delays.length).toBeGreaterThan(0);
      
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1] * 0.8);
      }
    });

    it("should apply jitter", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      const results = await Promise.all([
        retry(
          () => Promise.reject(new Error("Failed")),
          { maxRetries: 1, initialDelayMs: 50, maxDelayMs: 1000, backoffMultiplier: 2, jitter: true }
        ),
        retry(
          () => Promise.reject(new Error("Failed")),
          { maxRetries: 1, initialDelayMs: 50, maxDelayMs: 1000, backoffMultiplier: 2, jitter: true }
        ),
        retry(
          () => Promise.reject(new Error("Failed")),
          { maxRetries: 1, initialDelayMs: 50, maxDelayMs: 1000, backoffMultiplier: 2, jitter: true }
        ),
      ]);
      
      const delays = results.map(r => r.totalDelayMs);
      const allSame = delays.every(d => d === delays[0]);
      expect(allSame).toBe(false);
    });

    it("should respect max delay", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      const result = await retry(
        () => Promise.reject(new Error("Failed")),
        { maxRetries: 5, initialDelayMs: 100, maxDelayMs: 200, backoffMultiplier: 10 }
      );
      
      expect(result.success).toBe(false);
      expect(result.totalDelayMs).toBeLessThanOrEqual(200 * 5);
    });
  });

  describe("Backoff Strategies", () => {
    it("should calculate exponential backoff", async () => {
      const { ExponentialBackoff } = await import("../../backend/resilience/recovery.js");
      
      const backoff = new ExponentialBackoff(100, 10000, 2);
      
      expect(backoff.calculate(0)).toBe(100);
      expect(backoff.calculate(1)).toBe(200);
      expect(backoff.calculate(2)).toBe(400);
      expect(backoff.calculate(3)).toBe(800);
    });

    it("should respect max delay in exponential backoff", async () => {
      const { ExponentialBackoff } = await import("../../backend/resilience/recovery.js");
      
      const backoff = new ExponentialBackoff(100, 500, 2);
      
      expect(backoff.calculate(10)).toBe(500);
      expect(backoff.calculate(20)).toBe(500);
    });

    it("should calculate linear backoff", async () => {
      const { LinearBackoff } = await import("../../backend/resilience/recovery.js");
      
      const backoff = new LinearBackoff(100, 10000);
      
      expect(backoff.calculate(0)).toBe(100);
      expect(backoff.calculate(1)).toBe(200);
      expect(backoff.calculate(2)).toBe(300);
      expect(backoff.calculate(3)).toBe(400);
    });

    it("should respect max delay in linear backoff", async () => {
      const { LinearBackoff } = await import("../../backend/resilience/recovery.js");
      
      const backoff = new LinearBackoff(100, 500);
      
      expect(backoff.calculate(10)).toBe(500);
    });

    it("should calculate fibonacci backoff", async () => {
      const { FibonacciBackoff } = await import("../../backend/resilience/recovery.js");
      
      const backoff = new FibonacciBackoff(100, 10000);
      
      expect(backoff.calculate(0)).toBe(100);
      expect(backoff.calculate(1)).toBe(100);
      expect(backoff.calculate(2)).toBe(200);
      expect(backoff.calculate(3)).toBe(300);
      expect(backoff.calculate(4)).toBe(500);
    });

    it("should create backoff function", async () => {
      const { createBackoff } = await import("../../backend/resilience/recovery.js");
      
      const exponentialBackoff = createBackoff({
        type: "exponential",
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
      });
      
      expect(exponentialBackoff(0)).toBe(100);
      expect(exponentialBackoff(1)).toBe(200);
      
      const linearBackoff = createBackoff({
        type: "linear",
        initialDelayMs: 100,
        maxDelayMs: 10000,
      });
      
      expect(linearBackoff(0)).toBe(100);
      expect(linearBackoff(1)).toBe(200);
      
      const fibonacciBackoff = createBackoff({
        type: "fibonacci",
        initialDelayMs: 100,
        maxDelayMs: 10000,
      });
      
      expect(fibonacciBackoff(0)).toBe(100);
      expect(fibonacciBackoff(1)).toBe(100);
    });
  });

  describe("ErrorRecoveryManager", () => {
    it("should execute operation successfully", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        false,
        false,
        false
      );
      
      const result = await manager.execute(() => Promise.resolve("success"));
      expect(result).toBe("success");
    });

    it("should retry on failure", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        false,
        true,
        false,
        undefined,
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 }
      );
      
      let attempts = 0;
      const result = await manager.execute(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error("Failed"));
        }
        return Promise.resolve("success");
      });
      
      expect(result).toBe("success");
      
      const metrics = manager.getMetrics();
      expect(metrics.totalRetries).toBeGreaterThan(0);
    });

    it("should use circuit breaker", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        true,
        false,
        false,
        { failureThreshold: 2, successThreshold: 1, timeout: 1000, resetTimeout: 10000 }
      );
      
      try {
        await manager.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      try {
        await manager.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      const stats = manager.getCircuitBreakerStats();
      expect(stats?.state).toBe("open");
    });

    it("should use fallback on failure", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        false,
        false,
        true,
        undefined,
        undefined,
        {
          handle: (error) => "fallback",
        }
      );
      
      const result = await manager.execute(
        () => Promise.reject(new Error("Failed")),
        "fallback-value"
      );
      
      expect(result).toBe("fallback-value");
      
      const metrics = manager.getMetrics();
      expect(metrics.fallbackUsage).toBe(1);
    });

    it("should combine circuit breaker, retry, and fallback", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        true,
        true,
        true,
        { failureThreshold: 10, successThreshold: 1, timeout: 1000, resetTimeout: 10000 },
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 },
        { handle: () => "fallback" }
      );
      
      let attempts = 0;
      const result = await manager.execute(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error("Failed"));
        }
        return Promise.resolve("success");
      });
      
      expect(result).toBe("success");
      
      const metrics = manager.getMetrics();
      expect(metrics.totalRetries).toBeGreaterThan(0);
    });

    it("should track metrics correctly", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        true,
        true,
        true,
        { failureThreshold: 5, successThreshold: 1, timeout: 1000, resetTimeout: 10000 },
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 },
        { handle: () => "fallback" }
      );
      
      await manager.execute(() => Promise.resolve("success1"));
      await manager.execute(() => Promise.resolve("success2"));
      
      try {
        await manager.execute(() => Promise.reject(new Error("Failed")));
      } catch {}
      
      const metrics = manager.getMetrics();
      expect(metrics.totalFailures).toBeGreaterThan(0);
    });

    it("should create manager with factory function", async () => {
      const { createErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = createErrorRecoveryManager(
        true,
        true,
        true,
        { failureThreshold: 3, successThreshold: 2, timeout: 1000, resetTimeout: 5000 },
        { maxRetries: 3, initialDelayMs: 100, maxDelayMs: 10000, backoffMultiplier: 2 },
        { handle: () => "fallback" }
      );
      
      expect(manager).toBeDefined();
      
      const result = await manager.execute(() => Promise.resolve("success"));
      expect(result).toBe("success");
    });
  });

  describe("Network Recovery Scenarios", () => {
    it("should handle connection timeout", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      const result = await retry(
        () => Promise.reject(new Error("Connection timeout")),
        { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Connection timeout");
    });

    it("should handle network unreachable", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 1,
        timeout: 1000,
        resetTimeout: 100,
      });
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Network unreachable")));
      } catch {}
      
      try {
        await breaker.execute(() => Promise.reject(new Error("Network unreachable")));
      } catch {}
      
      expect(breaker.getState()).toBe("open");
      
      await new Promise(r => setTimeout(r, 150));
      
      const result = await breaker.execute(() => Promise.resolve("connected"));
      expect(result).toBe("connected");
      expect(breaker.getState()).toBe("closed");
    });

    it("should handle DNS resolution failure", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        true,
        false,
        true,
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, resetTimeout: 100 },
        undefined,
        { handle: () => ({ cached: true }) }
      );
      
      const result = await manager.execute(
        () => Promise.reject(new Error("DNS resolution failed")),
        { cached: true }
      );
      
      expect(result).toEqual({ cached: true });
    });

    it("should handle SSL/TLS errors", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      let attempts = 0;
      const result = await retry(
        () => {
          attempts++;
          if (attempts < 2) {
            return Promise.reject(new Error("SSL certificate error"));
          }
          return Promise.resolve("secured");
        },
        { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(true);
      expect(result.result).toBe("secured");
    });

    it("should handle connection reset", async () => {
      const { CircuitBreaker } = await import("../../backend/resilience/recovery.js");
      
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        resetTimeout: 50,
      });
      
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error("Connection reset")));
        } catch {}
      }
      
      expect(breaker.getState()).toBe("open");
      
      await new Promise(r => setTimeout(r, 100));
      
      await breaker.execute(() => Promise.resolve("reconnected"));
      await breaker.execute(() => Promise.resolve("stable"));
      
      expect(breaker.getState()).toBe("closed");
    });

    it("should handle rate limiting", async () => {
      const { retry } = await import("../../backend/resilience/recovery.js");
      
      let attempts = 0;
      const result = await retry(
        () => {
          attempts++;
          if (attempts < 4) {
            const error = new Error("Rate limit exceeded");
            (error as any).status = 429;
            return Promise.reject(error);
          }
          return Promise.resolve("success");
        },
        { maxRetries: 5, initialDelayMs: 50, maxDelayMs: 1000, backoffMultiplier: 2 }
      );
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(4);
    });

    it("should handle intermittent connectivity", async () => {
      const { ErrorRecoveryManager } = await import("../../backend/resilience/recovery.js");
      
      const manager = new ErrorRecoveryManager(
        true,
        false,
        true,
        { failureThreshold: 5, successThreshold: 2, timeout: 1000, resetTimeout: 100 },
        undefined,
        { handle: () => "offline-mode" }
      );
      
      let callCount = 0;
      const operation = () => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error("Connection lost"));
        }
        return Promise.resolve("success");
      };
      
      const result1 = await manager.execute(operation);
      expect(result1).toBe("success");
      
      const result2 = await manager.execute(operation, "offline-mode");
      expect(result2).toBe("offline-mode");
      
      const result3 = await manager.execute(operation);
      expect(result3).toBe("success");
    });
  });
});
