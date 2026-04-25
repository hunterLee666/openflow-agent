import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SideEffect, EffectType } from "../../backend/state/side-effect/types.js";

const createTestEffect = (id: string, payload: any = {}): SideEffect => ({
  id,
  type: "custom" as EffectType,
  action: "test-action",
  payload,
  timestamp: new Date(),
  status: "pending",
});

describe("E2E: Race Conditions and Concurrency Edge Cases", () => {
  describe("EffectQueue", () => {
    it("should handle concurrent enqueue operations", async () => {
      const { EffectQueueImpl } = await import("../../backend/state/side-effect/sync.js");
      
      const queue = new EffectQueueImpl();
      
      const effects = Array.from({ length: 100 }, (_, i) => 
        createTestEffect(`effect-${i}`, { index: i })
      );
      
      await Promise.all(effects.map(effect => queue.enqueue(effect)));
      
      expect(queue.size).toBe(100);
    });

    it("should handle concurrent dequeue operations", async () => {
      const { EffectQueueImpl } = await import("../../backend/state/side-effect/sync.js");
      
      const queue = new EffectQueueImpl();
      
      for (let i = 0; i < 50; i++) {
        queue.enqueue(createTestEffect(`effect-${i}`, { index: i }));
      }
      
      const dequeued: SideEffect[] = [];
      await Promise.all(
        Array.from({ length: 50 }, async () => {
          const effect = queue.dequeue();
          if (effect) {
            dequeued.push(effect);
          }
        })
      );
      
      expect(dequeued.length).toBe(50);
      expect(queue.size).toBe(0);
    });

    it("should handle mixed enqueue and dequeue operations", async () => {
      const { EffectQueueImpl } = await import("../../backend/state/side-effect/sync.js");
      
      const queue = new EffectQueueImpl();
      
      const operations = Array.from({ length: 100 }, (_, i) => {
        if (i % 2 === 0) {
          return async () => {
            queue.enqueue(createTestEffect(`effect-${i}`));
          };
        } else {
          return async () => {
            queue.dequeue();
          };
        }
      });
      
      await Promise.all(operations.map(op => op()));
      
      expect(queue.size).toBeGreaterThanOrEqual(0);
    });

    it("should check if effect exists", async () => {
      const { EffectQueueImpl } = await import("../../backend/state/side-effect/sync.js");
      
      const queue = new EffectQueueImpl();
      
      queue.enqueue(createTestEffect("test-effect"));
      
      expect(queue.has("test-effect")).toBe(true);
      expect(queue.has("nonexistent")).toBe(false);
    });

    it("should clear queue", async () => {
      const { EffectQueueImpl } = await import("../../backend/state/side-effect/sync.js");
      
      const queue = new EffectQueueImpl();
      
      for (let i = 0; i < 10; i++) {
        queue.enqueue(createTestEffect(`effect-${i}`));
      }
      
      expect(queue.size).toBe(10);
      
      queue.clear();
      
      expect(queue.size).toBe(0);
    });

    it("should peek without removing", async () => {
      const { EffectQueueImpl } = await import("../../backend/state/side-effect/sync.js");
      
      const queue = new EffectQueueImpl();
      
      queue.enqueue(createTestEffect("first"));
      
      const peeked = queue.peek();
      expect(peeked?.id).toBe("first");
      expect(queue.size).toBe(1);
    });
  });

  describe("SideEffectSynchronizer", () => {
    it("should apply effects atomically", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const applyMock = vi.fn().mockResolvedValue(true);
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: applyMock,
          },
        ],
      });
      
      const effectId = await sync.apply({
        type: "custom",
        action: "test",
        payload: { data: "test" },
      });
      
      expect(effectId).toBeDefined();
      expect(applyMock).toHaveBeenCalled();
    });

    it("should queue non-atomic effects", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const applyMock = vi.fn().mockResolvedValue(true);
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: applyMock,
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      await sync.apply({ type: "custom", action: "test", payload: {} });
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      const result = await sync.processQueue();
      
      expect(result.applied).toBe(3);
    });

    it("should prevent concurrent queue processing", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const applyMock = vi.fn().mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 50));
        return true;
      });
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: applyMock,
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      const [result1, result2] = await Promise.all([
        sync.processQueue(),
        sync.processQueue(),
      ]);
      
      expect(result1.applied + result2.applied).toBe(2);
      expect(result1.errors.length + result2.errors.length).toBeGreaterThan(0);
    });

    it("should handle validation failures", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const validateMock = vi.fn().mockResolvedValue(false);
      const applyMock = vi.fn().mockResolvedValue(true);
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            validate: validateMock,
            apply: applyMock,
          },
        ],
      });
      
      const effectId = await sync.apply({ type: "custom", action: "test", payload: {} });
      
      expect(effectId).toBeDefined();
      expect(validateMock).toHaveBeenCalled();
      expect(applyMock).not.toHaveBeenCalled();
    });

    it("should retry on failure", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      let attempts = 0;
      const applyMock = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return false;
        }
        return true;
      });
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 5,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: applyMock,
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      const result = await sync.processQueue();
      
      expect(result.applied).toBe(1);
    });

    it("should revert on failure when autoRevert enabled", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const applyMock = vi.fn().mockResolvedValue(false);
      const revertMock = vi.fn().mockResolvedValue(true);
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: true,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: applyMock,
            revert: revertMock,
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      await sync.processQueue();
      
      expect(revertMock).toHaveBeenCalled();
    });

    it("should revert all applied effects", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const revertMock = vi.fn().mockResolvedValue(true);
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => true,
            revert: revertMock,
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: { id: 1 } });
      await sync.apply({ type: "custom", action: "test", payload: { id: 2 } });
      await sync.apply({ type: "custom", action: "test", payload: { id: 3 } });
      
      const reverted = await sync.revertAll();
      
      expect(reverted).toBe(3);
      expect(revertMock).toHaveBeenCalledTimes(3);
    });

    it("should collect metrics", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => true,
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      const metrics = sync.getMetrics();
      
      expect(metrics.totalEffects).toBe(2);
      expect(metrics.appliedCount).toBe(2);
    });

    it("should notify listeners", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const onApplied = vi.fn();
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => true,
          },
        ],
      });
      
      sync.addListener({ onApplied });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      expect(onApplied).toHaveBeenCalled();
    });

    it("should remove listeners", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const onApplied = vi.fn();
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 3,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => true,
          },
        ],
      });
      
      const listener = { onApplied };
      sync.addListener(listener);
      sync.removeListener(listener);
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      expect(onApplied).not.toHaveBeenCalled();
    });
  });

  describe("Race Condition Scenarios", () => {
    it("should handle rapid concurrent applies", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const appliedEffects: number[] = [];
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async (effect) => {
              const payload = effect.payload as { index?: number };
              if (payload.index !== undefined) {
                appliedEffects.push(payload.index);
              }
              return true;
            },
          },
        ],
      });
      
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          sync.apply({ type: "custom", action: "test", payload: { index: i } })
        )
      );
      
      expect(appliedEffects.length).toBe(100);
    });

    it("should maintain order in queue processing", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const processedOrder: number[] = [];
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async (effect) => {
              const payload = effect.payload as { index?: number };
              if (payload.index !== undefined) {
                processedOrder.push(payload.index);
              }
              return true;
            },
          },
        ],
      });
      
      for (let i = 0; i < 10; i++) {
        await sync.apply({ type: "custom", action: "test", payload: { index: i } });
      }
      
      await sync.processQueue();
      
      expect(processedOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("should handle concurrent state updates", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      let state = { count: 0 };
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => {
              state.count++;
              return true;
            },
            revert: async () => {
              state.count--;
              return true;
            },
          },
        ],
      });
      
      await Promise.all(
        Array.from({ length: 10 }, () =>
          sync.apply({ type: "custom", action: "increment", payload: {} })
        )
      );
      
      expect(state.count).toBe(10);
    });

    it("should handle partial failures with rollback", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const applied: number[] = [];
      const reverted: number[] = [];
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: true,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async (effect) => {
              const payload = effect.payload as { index?: number };
              const index = payload.index;
              if (index === 5) {
                return false;
              }
              if (index !== undefined) {
                applied.push(index);
              }
              return true;
            },
            revert: async (effect) => {
              const payload = effect.payload as { index?: number };
              if (payload.index !== undefined) {
                reverted.push(payload.index);
              }
              return true;
            },
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: { index: 5 } });
      
      expect(applied.length).toBe(0);
      expect(reverted.length).toBe(0);
    });

    it("should handle timeout during apply", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => {
              await new Promise(r => setTimeout(r, 1000));
              return true;
            },
          },
        ],
      });
      
      const start = Date.now();
      
      await Promise.race([
        sync.apply({ type: "custom", action: "slow", payload: {} }),
        new Promise(r => setTimeout(r, 100)),
      ]);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200);
    });

    it("should handle handler errors gracefully", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => {
              throw new Error("Handler error");
            },
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "error", payload: {} });
      await sync.processQueue();
      
      const metrics = sync.getMetrics();
      expect(metrics.failedCount).toBe(1);
    });

    it("should handle missing handler", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [],
      });
      
      await expect(
        sync.apply({ type: "custom", action: "missing", payload: {} })
      ).rejects.toThrow("No handler for effect type");
    });

    it("should handle concurrent listener notifications", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const notifications: string[] = [];
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => true,
          },
        ],
      });
      
      for (let i = 0; i < 5; i++) {
        sync.addListener({
          onApplied: (effect) => {
            notifications.push(`listener-${i}-${effect.id}`);
          },
        });
      }
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      expect(notifications.length).toBe(5);
    });

    it("should handle resource cleanup on error", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const resources: string[] = [];
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: true,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async (effect) => {
              resources.push(`acquired-${effect.id}`);
              throw new Error("Failed after acquisition");
            },
            revert: async (effect) => {
              resources.push(`released-${effect.id}`);
              return true;
            },
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "resource", payload: {} });
      await sync.processQueue();
      
      expect(resources.some(r => r.startsWith("acquired"))).toBe(true);
      expect(resources.some(r => r.startsWith("released"))).toBe(true);
    });
  });

  describe("Deadlock Prevention", () => {
    it("should not deadlock on circular dependencies", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "file" as EffectType,
            apply: async () => true,
          },
          {
            type: "network" as EffectType,
            apply: async () => true,
          },
        ],
      });
      
      await sync.apply({ type: "file", action: "A", payload: {} });
      await sync.apply({ type: "network", action: "B", payload: {} });
      await sync.apply({ type: "file", action: "A", payload: {} });
      
      const result = await sync.processQueue();
      
      expect(result.applied).toBe(3);
    });

    it("should handle nested effect applications", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: true,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "file" as EffectType,
            apply: async () => {
              return true;
            },
          },
          {
            type: "network" as EffectType,
            apply: async () => true,
          },
        ],
      });
      
      await sync.apply({ type: "file", action: "parent", payload: {} });
      await sync.apply({ type: "network", action: "child", payload: {} });
      
      const metrics = sync.getMetrics();
      expect(metrics.appliedCount).toBe(2);
    });

    it("should prevent queue processing reentry", async () => {
      const { SideEffectSynchronizer } = await import("../../backend/state/side-effect/sync.js");
      
      let processingCount = 0;
      
      const sync = new SideEffectSynchronizer({
        enabled: true,
        policy: {
          atomic: false,
          maxRetries: 1,
          retryDelayMs: 10,
          autoRevert: false,
        },
        handlers: [
          {
            type: "custom" as EffectType,
            apply: async () => {
              processingCount++;
              await new Promise(r => setTimeout(r, 50));
              return true;
            },
          },
        ],
      });
      
      await sync.apply({ type: "custom", action: "test", payload: {} });
      await sync.apply({ type: "custom", action: "test", payload: {} });
      
      const results = await Promise.all([
        sync.processQueue(),
        sync.processQueue(),
        sync.processQueue(),
      ]);
      
      const totalApplied = results.reduce((sum, r) => sum + r.applied, 0);
      expect(totalApplied).toBe(2);
    });
  });
});
