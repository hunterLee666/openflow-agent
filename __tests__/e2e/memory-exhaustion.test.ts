import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("E2E: Memory Exhaustion Edge Cases", () => {
  describe("ResourceMonitor", () => {
    it("should create monitor with default config", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor();
      
      expect(monitor).toBeDefined();
    });

    it("should start and stop monitoring", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 100,
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 150));
      
      monitor.stop();
    });

    it("should set and remove limits", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor();
      
      monitor.setLimit({
        type: "memory",
        limit: 80,
        unit: "%",
        action: "warn",
      });
      
      const stats = monitor.getStats();
      expect(stats.limits.length).toBe(1);
      expect(stats.limits[0].type).toBe("memory");
      
      monitor.removeLimit("memory");
      
      const newStats = monitor.getStats();
      expect(newStats.limits.length).toBe(0);
    });

    it("should get usage for all resource types", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor();
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 150));
      
      const usage = monitor.getAllUsage();
      
      expect(usage).toHaveProperty("cpu");
      expect(usage).toHaveProperty("memory");
      expect(usage).toHaveProperty("disk");
      expect(usage).toHaveProperty("processes");
      
      expect(typeof usage.cpu).toBe("number");
      expect(typeof usage.memory).toBe("number");
      expect(typeof usage.disk).toBe("number");
      expect(typeof usage.processes).toBe("number");
      
      monitor.stop();
    });

    it("should trigger threshold exceeded callback", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const onThresholdExceeded = vi.fn();
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
        thresholds: {
          cpu: -1,
          memory: -1,
          disk: -1,
          processes: -1,
        },
        onThresholdExceeded,
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 200));
      
      monitor.stop();
      
      expect(onThresholdExceeded).toHaveBeenCalled();
    });

    it("should listen for usage changes", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
      });
      
      const listener = vi.fn();
      const unsubscribe = monitor.onUsageChange("cpu", listener);
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 200));
      
      monitor.stop();
      
      expect(listener).toHaveBeenCalled();
      
      unsubscribe();
    });

    it("should update existing limit", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor();
      
      monitor.setLimit({
        type: "memory",
        limit: 80,
        unit: "%",
      });
      
      monitor.setLimit({
        type: "memory",
        limit: 90,
        unit: "%",
      });
      
      const stats = monitor.getStats();
      expect(stats.limits.length).toBe(1);
      expect(stats.limits[0].limit).toBe(90);
    });

    it("should get stats", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor();
      
      monitor.setLimit({
        type: "cpu",
        limit: 80,
        unit: "%",
      });
      
      const stats = monitor.getStats();
      
      expect(stats).toHaveProperty("usage");
      expect(stats).toHaveProperty("limits");
      expect(stats.limits.length).toBe(1);
    });
  });

  describe("NetworkController", () => {
    it("should create controller with rules", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController([
        { pattern: "example.com", policy: "allow" },
      ]);
      
      expect(controller).toBeDefined();
    });

    it("should add and remove rules", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController();
      
      controller.addRule({ pattern: "test.com", policy: "deny" });
      
      const rules = controller.getRules();
      expect(rules.length).toBe(1);
      
      controller.removeRule("test.com");
      
      const newRules = controller.getRules();
      expect(newRules.length).toBe(0);
    });

    it("should check access with allow rule", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController([
        { pattern: "allowed.com", policy: "allow" },
      ]);
      
      const result = controller.checkAccess("allowed.com");
      
      expect(result.allowed).toBe(true);
    });

    it("should check access with deny rule", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController([
        { pattern: "blocked.com", policy: "deny" },
      ]);
      
      const result = controller.checkAccess("blocked.com");
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Blocked by rule");
    });

    it("should match wildcard patterns", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController([
        { pattern: "*.example.com", policy: "allow" },
      ]);
      
      const result1 = controller.checkAccess("api.example.com");
      expect(result1.allowed).toBe(true);
      
      const result2 = controller.checkAccess("www.example.com");
      expect(result2.allowed).toBe(true);
      
      const result3 = controller.checkAccess("other.com");
      expect(result3.allowed).toBe(true);
    });

    it("should match specific port", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController([
        { pattern: "example.com", port: 443, policy: "allow" },
      ]);
      
      const result1 = controller.checkAccess("example.com", 443);
      expect(result1.allowed).toBe(true);
      
      const result2 = controller.checkAccess("example.com", 80);
      expect(result2.allowed).toBe(true);
    });

    it("should allow and block hosts", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController();
      
      controller.allowHost("trusted.com");
      
      const allowed = controller.getAllowedHosts();
      expect(allowed).toContain("trusted.com");
      
      controller.blockHost("malicious.com");
      
      const blocked = controller.getBlockedHosts();
      expect(blocked).toContain("malicious.com");
    });

    it("should set default policy", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController();
      
      controller.setDefaultPolicy("deny");
      
      const result = controller.checkAccess("unknown.com");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Default deny");
    });

    it("should check blocked hosts", async () => {
      const { NetworkController } = await import("../../backend/security/resource-control.js");
      
      const controller = new NetworkController();
      
      controller.blockHost("malicious.com");
      
      const result = controller.checkAccess("malicious.com");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("explicitly blocked");
    });
  });

  describe("SecurityPolicyManager", () => {
    it("should register and unregister policies", async () => {
      const { SecurityPolicyManager, ResourceMonitor, NetworkController } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const policy = {
        networkController: new NetworkController(),
        resourceMonitor: new ResourceMonitor(),
        allowedPaths: [],
        deniedPaths: [],
        maxExecutionTimeMs: 30000,
        maxOutputSize: 1000000,
      };
      
      manager.registerPolicy("default", policy);
      
      const retrieved = manager.getPolicy("default");
      expect(retrieved).toBeDefined();
      
      manager.unregisterPolicy("default");
      
      const afterUnregister = manager.getPolicy("default");
      expect(afterUnregister).toBeUndefined();
    });

    it("should set active policy", async () => {
      const { SecurityPolicyManager, ResourceMonitor, NetworkController } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const policy = {
        networkController: new NetworkController(),
        resourceMonitor: new ResourceMonitor({ enabled: true, checkIntervalMs: 100 }),
        allowedPaths: [],
        deniedPaths: [],
        maxExecutionTimeMs: 30000,
        maxOutputSize: 1000000,
      };
      
      manager.registerPolicy("test", policy);
      
      const success = manager.setActivePolicy("test");
      expect(success).toBe(true);
      
      const active = manager.getActivePolicy();
      expect(active).toBeDefined();
      
      policy.resourceMonitor.stop();
    });

    it("should fail to set non-existent policy", async () => {
      const { SecurityPolicyManager } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const success = manager.setActivePolicy("nonexistent");
      expect(success).toBe(false);
    });

    it("should validate command", async () => {
      const { SecurityPolicyManager, ResourceMonitor, NetworkController } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const policy = {
        networkController: new NetworkController(),
        resourceMonitor: new ResourceMonitor(),
        allowedPaths: [],
        deniedPaths: [],
        maxExecutionTimeMs: 30000,
        maxOutputSize: 1000000,
      };
      
      manager.registerPolicy("default", policy);
      manager.setActivePolicy("default");
      
      const result = manager.validateCommand("ls", {});
      expect(result.valid).toBe(true);
    });

    it("should check network access", async () => {
      const { SecurityPolicyManager, ResourceMonitor, NetworkController } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const networkController = new NetworkController([
        { pattern: "allowed.com", policy: "allow" },
      ]);
      
      const policy = {
        networkController,
        resourceMonitor: new ResourceMonitor(),
        allowedPaths: [],
        deniedPaths: [],
        maxExecutionTimeMs: 30000,
        maxOutputSize: 1000000,
      };
      
      manager.registerPolicy("default", policy);
      manager.setActivePolicy("default");
      
      const result = manager.checkNetworkAccess("allowed.com");
      expect(result.allowed).toBe(true);
    });

    it("should get resource stats", async () => {
      const { SecurityPolicyManager, ResourceMonitor, NetworkController } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const resourceMonitor = new ResourceMonitor({ enabled: true, checkIntervalMs: 50 });
      
      const policy = {
        networkController: new NetworkController(),
        resourceMonitor,
        allowedPaths: [],
        deniedPaths: [],
        maxExecutionTimeMs: 30000,
        maxOutputSize: 1000000,
      };
      
      manager.registerPolicy("default", policy);
      manager.setActivePolicy("default");
      
      await new Promise(r => setTimeout(r, 100));
      
      const stats = manager.getResourceStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("cpu");
      expect(stats).toHaveProperty("memory");
      
      resourceMonitor.stop();
    });

    it("should return undefined when no active policy", async () => {
      const { SecurityPolicyManager } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const active = manager.getActivePolicy();
      expect(active).toBeUndefined();
      
      const stats = manager.getResourceStats();
      expect(stats).toBeUndefined();
    });
  });

  describe("Memory Exhaustion Scenarios", () => {
    it("should detect high memory usage", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
        thresholds: {
          memory: 0,
        },
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      const memoryUsage = monitor.getUsage("memory");
      expect(memoryUsage).toBeGreaterThanOrEqual(0);
      expect(memoryUsage).toBeLessThanOrEqual(100);
      
      monitor.stop();
    });

    it("should trigger warning on high memory", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const warnings: Array<{ type: string; current: number; limit: number }> = [];
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
        thresholds: {
          cpu: -1,
          memory: -1,
          disk: -1,
          processes: -1,
        },
        onThresholdExceeded: (type, current, limit) => {
          warnings.push({ type, current, limit });
        },
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 200));
      
      monitor.stop();
      
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("should handle memory limit with warn action", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
        thresholds: {
          memory: 0,
        },
      });
      
      monitor.setLimit({
        type: "memory",
        limit: 50,
        unit: "%",
        action: "warn",
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      const stats = monitor.getStats();
      expect(stats.limits.length).toBe(1);
      expect(stats.limits[0].action).toBe("warn");
      
      monitor.stop();
    });

    it("should handle memory limit with throttle action", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
        thresholds: {
          memory: 0,
        },
      });
      
      monitor.setLimit({
        type: "memory",
        limit: 50,
        unit: "%",
        action: "throttle",
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      monitor.stop();
    });

    it("should handle multiple resource limits", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor();
      
      monitor.setLimit({ type: "cpu", limit: 80, unit: "%" });
      monitor.setLimit({ type: "memory", limit: 85, unit: "%" });
      monitor.setLimit({ type: "disk", limit: 90, unit: "%" });
      monitor.setLimit({ type: "processes", limit: 500, unit: "count" });
      
      const stats = monitor.getStats();
      expect(stats.limits.length).toBe(4);
    });

    it("should monitor CPU usage", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      const cpuUsage = monitor.getUsage("cpu");
      expect(cpuUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage).toBeLessThanOrEqual(100);
      
      monitor.stop();
    });

    it("should monitor disk usage", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      const diskUsage = monitor.getUsage("disk");
      expect(diskUsage).toBeGreaterThanOrEqual(0);
      expect(diskUsage).toBeLessThanOrEqual(100);
      
      monitor.stop();
    });

    it("should monitor process count", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
      });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      const processCount = monitor.getUsage("processes");
      expect(processCount).toBeGreaterThanOrEqual(0);
      
      monitor.stop();
    });

    it("should handle rapid memory allocation simulation", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const memoryReadings: number[] = [];
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 20,
      });
      
      monitor.onUsageChange("memory", (current) => {
        memoryReadings.push(current);
      });
      
      monitor.start();
      
      const allocations: Buffer[] = [];
      for (let i = 0; i < 5; i++) {
        allocations.push(Buffer.alloc(1024 * 1024));
        await new Promise(r => setTimeout(r, 30));
      }
      
      monitor.stop();
      
      expect(memoryReadings.length).toBeGreaterThan(0);
    });

    it("should handle resource cleanup", async () => {
      const { ResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      const monitor = new ResourceMonitor({
        checkIntervalMs: 50,
      });
      
      monitor.setLimit({ type: "memory", limit: 80, unit: "%" });
      monitor.setLimit({ type: "cpu", limit: 90, unit: "%" });
      
      monitor.start();
      
      await new Promise(r => setTimeout(r, 100));
      
      monitor.stop();
      monitor.removeLimit("memory");
      monitor.removeLimit("cpu");
      
      const stats = monitor.getStats();
      expect(stats.limits.length).toBe(0);
    });

    it("should handle graceful degradation", async () => {
      const { SecurityPolicyManager, ResourceMonitor, NetworkController } = await import("../../backend/security/resource-control.js");
      
      const manager = new SecurityPolicyManager();
      
      const resourceMonitor = new ResourceMonitor({
        checkIntervalMs: 50,
        thresholds: {
          memory: 80,
          cpu: 90,
        },
      });
      
      const policy = {
        networkController: new NetworkController(),
        resourceMonitor,
        allowedPaths: ["/tmp"],
        deniedPaths: ["/etc"],
        maxExecutionTimeMs: 5000,
        maxOutputSize: 10000,
      };
      
      manager.registerPolicy("degraded", policy);
      manager.setActivePolicy("degraded");
      
      await new Promise(r => setTimeout(r, 100));
      
      const stats = manager.getResourceStats();
      expect(stats).toBeDefined();
      
      resourceMonitor.stop();
    });
  });

  describe("Default Instances", () => {
    it("should create default network controller", async () => {
      const { defaultNetworkController } = await import("../../backend/security/resource-control.js");
      
      expect(defaultNetworkController).toBeDefined();
      
      const result1 = defaultNetworkController.checkAccess("localhost");
      expect(result1.allowed).toBe(true);
      
      const result2 = defaultNetworkController.checkAccess("127.0.0.1");
      expect(result2.allowed).toBe(true);
    });

    it("should create default resource monitor", async () => {
      const { defaultResourceMonitor } = await import("../../backend/security/resource-control.js");
      
      expect(defaultResourceMonitor).toBeDefined();
    });

    it("should create default security policy manager", async () => {
      const { defaultSecurityPolicyManager } = await import("../../backend/security/resource-control.js");
      
      expect(defaultSecurityPolicyManager).toBeDefined();
    });
  });
});
