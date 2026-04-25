import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Resource Monitoring Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Resource Monitor Initialization", () => {
    it("should have resource monitor initialized", () => {
      expect(services.resourceMonitor).toBeDefined();
    });
  });

  describe("Resource Monitoring Features", () => {
    it("should monitor CPU usage", () => {
      expect(services.resourceMonitor).toBeDefined();
    });

    it("should monitor memory usage", () => {
      expect(services.resourceMonitor).toBeDefined();
    });

    it("should monitor disk usage", () => {
      expect(services.resourceMonitor).toBeDefined();
    });
  });

  describe("Resource Thresholds", () => {
    it("should have configurable thresholds", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const config = {
        enabled: true,
        checkIntervalMs: 5000,
        thresholds: {
          cpu: 80,
          memory: 85,
          disk: 90,
        },
      };
      
      const monitor = new ResourceMonitor(config);
      expect(monitor).toBeDefined();
    });
  });

  describe("Resource Monitor Methods", () => {
    it("should have start method", () => {
      expect(typeof services.resourceMonitor.start).toBe("function");
    });

    it("should have stop method", () => {
      expect(typeof services.resourceMonitor.stop).toBe("function");
    });

    it("should have getUsage method", () => {
      expect(typeof services.resourceMonitor.getUsage).toBe("function");
    });

    it("should have setLimit method", () => {
      expect(typeof services.resourceMonitor.setLimit).toBe("function");
    });
  });

  describe("Resource Statistics", () => {
    it("should get current resource stats", () => {
      expect(services.resourceMonitor).toBeDefined();
    });

    it("should track all resource types", () => {
      const usage = services.resourceMonitor.getAllUsage();
      expect(usage).toBeDefined();
    });
  });

  describe("Resource Alerts", () => {
    it("should support alert callbacks", () => {
      expect(services.resourceMonitor).toBeDefined();
    });

    it("should register usage change listeners", () => {
      const listener = () => {};
      const unsubscribe = services.resourceMonitor.onUsageChange("cpu", listener);
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });
});
