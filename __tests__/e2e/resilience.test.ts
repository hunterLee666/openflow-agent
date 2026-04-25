import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices, executeWithResilience } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Resilience Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Circuit Breaker", () => {
    it("should have circuit breaker initialized", () => {
      expect(services.circuitBreaker).toBeDefined();
    });

    it("should execute successful operation", async () => {
      const result = await services.circuitBreaker.execute(
        async () => "success"
      );

      expect(result).toBe("success");
    });

    it("should track failures", async () => {
      const breaker = services.circuitBreaker;
      
      const initialStats = breaker.getStats();
      expect(initialStats).toBeDefined();

      try {
        await breaker.execute(async () => {
          throw new Error("Test failure");
        });
      } catch {
        // Expected
      }

      const afterStats = breaker.getStats();
      expect(afterStats.failures).toBeGreaterThan(initialStats.failures);
    });
  });

  describe("Error Recovery Manager", () => {
    it("should have error recovery manager initialized", () => {
      expect(services.errorRecoveryManager).toBeDefined();
    });

    it("should execute operation with recovery", async () => {
      const result = await services.errorRecoveryManager.execute(
        async () => "recovered"
      );

      expect(result).toBe("recovered");
    });

    it("should get metrics", () => {
      const metrics = services.errorRecoveryManager.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe("Execute with Resilience", () => {
    it("should execute operation with circuit breaker", async () => {
      const result = await executeWithResilience(
        async () => "resilient result",
        { useCircuitBreaker: true }
      );

      expect(result).toBe("resilient result");
    });

    it("should execute operation without circuit breaker", async () => {
      const result = await executeWithResilience(
        async () => "normal result"
      );

      expect(result).toBe("normal result");
    });
  });
});
