import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("E2E: Capacity Wake Flow", () => {
  describe("createCapacityWake", () => {
    it("should create wake signal", async () => {
      const { createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      
      expect(wake.signal).toBeDefined();
      expect(wake.wake).toBeDefined();
      expect(wake.cleanup).toBeDefined();
    });

    it("should create signal that can be aborted", async () => {
      const { createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      
      const signal = wake.signal();
      expect(signal.aborted).toBe(false);
      
      controller.abort();
      expect(signal.aborted).toBe(true);
    });

    it("should wake waiting processes", async () => {
      const { createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      
      let resolved = false;
      const promise = new Promise<void>((resolve) => {
        const signal = wake.signal();
        signal.addEventListener("abort", () => {
          resolved = true;
          resolve();
        });
      });
      
      wake.wake();
      
      await promise;
      expect(resolved).toBe(true);
    });

    it("should cleanup resources", async () => {
      const { createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      
      const signal1 = wake.signal();
      
      wake.cleanup();
      
      controller.abort();
      expect(signal1.aborted).toBe(false);
    });

    it("should handle multiple wake calls", async () => {
      const { createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      
      wake.wake();
      wake.wake();
      wake.wake();
      
      expect(() => wake.wake()).not.toThrow();
    });
  });

  describe("CapacityManager", () => {
    it("should create manager with max capacity", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(5);
      const state = manager.getState();
      
      expect(state.current).toBe(0);
      expect(state.max).toBe(5);
      expect(state.isAtCapacity).toBe(false);
      expect(state.isIdle).toBe(true);
    });

    it("should acquire capacity", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(3);
      
      expect(manager.acquire()).toBe(true);
      expect(manager.acquire()).toBe(true);
      expect(manager.acquire()).toBe(true);
      
      const state = manager.getState();
      expect(state.current).toBe(3);
      expect(state.isAtCapacity).toBe(true);
    });

    it("should reject when at capacity", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(2);
      
      manager.acquire();
      manager.acquire();
      
      expect(manager.acquire()).toBe(false);
    });

    it("should release capacity", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(3);
      
      manager.acquire();
      manager.acquire();
      expect(manager.getState().current).toBe(2);
      
      manager.release();
      expect(manager.getState().current).toBe(1);
      
      manager.release();
      expect(manager.getState().current).toBe(0);
    });

    it("should not go below zero on release", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(2);
      
      manager.release();
      manager.release();
      manager.release();
      
      expect(manager.getState().current).toBe(0);
    });

    it("should update max capacity", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(2);
      manager.acquire();
      manager.acquire();
      
      expect(manager.acquire()).toBe(false);
      
      manager.setMax(4);
      
      expect(manager.acquire()).toBe(true);
      expect(manager.acquire()).toBe(true);
    });

    it("should track idle state", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(2);
      
      expect(manager.getState().isIdle).toBe(true);
      
      manager.acquire();
      expect(manager.getState().isIdle).toBe(false);
      
      manager.release();
      expect(manager.getState().isIdle).toBe(true);
    });

    it("should wake on release", async () => {
      const { CapacityManager, createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      const manager = new CapacityManager(1);
      manager.setWake(wake);
      
      manager.acquire();
      
      let woken = false;
      const signal = wake.signal();
      signal.addEventListener("abort", () => {
        woken = true;
      });
      
      manager.release();
      
      expect(woken).toBe(true);
    });

    it("should wake on max increase", async () => {
      const { CapacityManager, createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      const manager = new CapacityManager(1);
      manager.setWake(wake);
      
      manager.acquire();
      
      let woken = false;
      const signal = wake.signal();
      signal.addEventListener("abort", () => {
        woken = true;
      });
      
      manager.setMax(2);
      
      expect(woken).toBe(true);
    });
  });

  describe("Integration", () => {
    it("should coordinate capacity and wake signals", async () => {
      const { CapacityManager, createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      const manager = new CapacityManager(2);
      manager.setWake(wake);
      
      const results: string[] = [];
      
      const task1 = async () => {
        if (manager.acquire()) {
          results.push("task1-start");
          await new Promise((r) => setTimeout(r, 50));
          results.push("task1-end");
          manager.release();
        }
      };
      
      const task2 = async () => {
        if (manager.acquire()) {
          results.push("task2-start");
          await new Promise((r) => setTimeout(r, 50));
          results.push("task2-end");
          manager.release();
        }
      };
      
      const task3 = async () => {
        while (!manager.acquire()) {
          await new Promise((r) => setTimeout(r, 10));
        }
        results.push("task3-start");
        await new Promise((r) => setTimeout(r, 50));
        results.push("task3-end");
        manager.release();
      };
      
      await Promise.all([task1(), task2(), task3()]);
      
      expect(results).toContain("task1-start");
      expect(results).toContain("task2-start");
      expect(results).toContain("task3-start");
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero max capacity", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(0);
      
      expect(manager.acquire()).toBe(false);
      expect(manager.getState().isAtCapacity).toBe(true);
    });

    it("should handle negative max capacity gracefully", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(-1);
      
      expect(manager.acquire()).toBe(false);
    });

    it("should handle rapid acquire/release cycles", async () => {
      const { CapacityManager } = await import("../../backend/utils/capacityWake.js");
      
      const manager = new CapacityManager(10);
      
      for (let i = 0; i < 100; i++) {
        manager.acquire();
        manager.release();
      }
      
      expect(manager.getState().current).toBe(0);
    });

    it("should handle cleanup during active operations", async () => {
      const { createCapacityWake } = await import("../../backend/utils/capacityWake.js");
      
      const controller = new AbortController();
      const wake = createCapacityWake(controller.signal);
      
      const signal = wake.signal();
      
      wake.cleanup();
      
      controller.abort();
      expect(signal.aborted).toBe(false);
    });
  });
});
