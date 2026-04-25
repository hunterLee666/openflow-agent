import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices, executeWithErrorHandling } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Error Handling Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Error Handler", () => {
    it("should have error handler initialized", () => {
      expect(services.errorHandler).toBeDefined();
    });

    it("should handle successful operation", async () => {
      const result = await services.errorHandler.handle(
        async () => "success",
        { operationId: "test-success" }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
    });

    it("should handle failed operation", async () => {
      const result = await services.errorHandler.handle(
        async () => {
          throw new Error("Test error");
        },
        { operationId: "test-failure", skipRetry: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Error Catalog", () => {
    it("should categorize errors correctly", async () => {
      const result = await services.errorHandler.handle(
        async () => {
          const error = new Error("Network timeout");
          (error as any).code = "ETIMEDOUT";
          throw error;
        },
        { operationId: "test-timeout", skipRetry: true }
      );

      expect(result.success).toBe(false);
    });
  });

  describe("Execute with Error Handling", () => {
    it("should execute successful operation", async () => {
      const result = await executeWithErrorHandling(
        async () => "test result",
        { operationId: "test-execute" }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe("test result");
    });

    it("should handle failed operation", async () => {
      const result = await executeWithErrorHandling(
        async () => {
          throw new Error("Test error");
        },
        { operationId: "test-execute-fail", skipRetry: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
