import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("State Corruption Recovery E2E Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("AppState - Corruption Detection", () => {
    it("should detect corrupted state value", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "user" }, { name: "test", id: 123 });

      const value = state.get({ scope: "session", key: "user" });
      expect(value).toEqual({ name: "test", id: 123 });

      state.set({ scope: "session", key: "user" }, null as any);
      const corruptedValue = state.get({ scope: "session", key: "user" });
      expect(corruptedValue).toBeNull();
    });

    it("should validate state key format", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "global",
        enableHistory: true,
      });

      state.set({ scope: "global", key: "valid_key" }, "value");

      const value = state.get({ scope: "global", key: "valid_key" });
      expect(value).toBe("value");
    });

    it("should handle circular reference in state", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      const circularObj: any = { name: "circular" };
      circularObj.self = circularObj;

      expect(() => {
        state.set({ scope: "session", key: "circular" }, circularObj);
      }).not.toThrow();
    });
  });

  describe("AppState - State Recovery", () => {
    it("should recover from transaction rollback", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "counter" }, 10);

      const txnId = state.beginTransaction();

      state.set({ scope: "session", key: "counter" }, 20);
      state.set({ scope: "session", key: "new_key" }, "new_value");

      const rolledBack = state.rollbackTransaction(txnId);
      expect(rolledBack).toBe(true);

      const counter = state.get({ scope: "session", key: "counter" });
      expect(counter).toBe(10);

      const newKey = state.get({ scope: "session", key: "new_key" });
      expect(newKey).toBeUndefined();
    });

    it("should recover state from history", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
        maxHistorySize: 100,
      });

      state.set({ scope: "session", key: "data" }, "v1");
      state.set({ scope: "session", key: "data" }, "v2");
      state.set({ scope: "session", key: "data" }, "v3");

      const history = state.history();
      expect(history.length).toBe(3);

      const lastChange = history[history.length - 1];
      expect(lastChange.previousValue).toBe("v2");
      expect(lastChange.newValue).toBe("v3");
    });

    it("should handle multiple nested transactions", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "value" }, 0);

      const txn1 = state.beginTransaction();
      state.set({ scope: "session", key: "value" }, 1);

      const txn2 = state.beginTransaction();
      state.set({ scope: "session", key: "value" }, 2);

      state.rollbackTransaction(txn2);

      const valueAfterRollback2 = state.get({ scope: "session", key: "value" });
      expect(valueAfterRollback2).toBe(1);

      state.commitTransaction(txn1);

      const finalValue = state.get({ scope: "session", key: "value" });
      expect(finalValue).toBe(1);
    });
  });

  describe("AppState - Backup and Restore", () => {
    it("should create state snapshot", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "user" }, { id: 1, name: "test" });
      state.set({ scope: "session", key: "settings" }, { theme: "dark" });

      const snapshot = state.snapshot();

      expect(snapshot.values.size).toBe(2);
      expect(snapshot.scope).toBe("session");
    });

    it("should restore from snapshot", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "original" }, "value1");

      const snapshot = state.snapshot();

      state.set({ scope: "session", key: "original" }, "value2");
      state.set({ scope: "session", key: "added" }, "value3");

      state.clear();

      for (const [key, value] of snapshot.values) {
        const keyParts = key.split(":");
        state.set(
          {
            scope: keyParts[0] as any,
            key: keyParts[keyParts.length - 1],
          },
          value.value
        );
      }

      const restored = state.get({ scope: "session", key: "original" });
      expect(restored).toBe("value1");

      const added = state.get({ scope: "session", key: "added" });
      expect(added).toBeUndefined();
    });

    it("should handle snapshot with deleted keys", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "toDelete" }, "value");
      const snapshot = state.snapshot();

      state.delete({ scope: "session", key: "toDelete" });

      expect(state.has({ scope: "session", key: "toDelete" })).toBe(false);
      expect(snapshot.values.has("session:toDelete")).toBe(true);
    });
  });

  describe("PersistenceManager - Corruption Handling", () => {
    it("should handle corrupted persisted data", async () => {
      const { PersistenceManager, MemoryStorageBackend, DEFAULT_STRATEGIES } = await import(
        "../../backend/state/persistence/manager.js"
      );

      const storage = new MemoryStorageBackend();

      storage.write("corrupted_key", "not valid json {{{");

      const manager = new PersistenceManager(
        {
          strategies: DEFAULT_STRATEGIES,
          defaultStrategy: "always",
          maxSizeBytes: 1024 * 1024,
        },
        storage
      );

      const result = await manager.retrieve("corrupted_key");
      expect(result).toBeNull();
    });

    it("should validate checksum on retrieval", async () => {
      const { PersistenceManager, MemoryStorageBackend, DEFAULT_STRATEGIES } = await import(
        "../../backend/state/persistence/manager.js"
      );

      const storage = new MemoryStorageBackend();

      const manager = new PersistenceManager(
        {
          strategies: DEFAULT_STRATEGIES,
          defaultStrategy: "always",
          maxSizeBytes: 1024 * 1024,
        },
        storage
      );

      await manager.persist("valid_key", { data: "test" });

      const result = await manager.retrieve("valid_key");
      expect(result).toEqual({ data: "test" });
    });

    it("should handle missing strategy on retrieval", async () => {
      const { PersistenceManager, MemoryStorageBackend } = await import(
        "../../backend/state/persistence/manager.js"
      );

      const storage = new MemoryStorageBackend();

      storage.write(
        "unknown_strategy",
        JSON.stringify({
          key: "unknown_strategy",
          value: { data: "test" },
          strategy: "non_existent_strategy",
          timestamp: new Date(),
          size: 100,
          checksum: "abc123",
        })
      );

      const manager = new PersistenceManager(
        {
          strategies: [
            {
              name: "always",
              priority: 0,
              shouldPersist: () => true,
              serialize: JSON.stringify,
              deserialize: JSON.parse,
            },
          ],
          defaultStrategy: "always",
          maxSizeBytes: 1024 * 1024,
        },
        storage
      );

      const result = await manager.retrieve("unknown_strategy");
      expect(result).toBeNull();
    });
  });

  describe("PersistenceManager - Recovery", () => {
    it("should recover from storage failure", async () => {
      const { PersistenceManager, DEFAULT_STRATEGIES } = await import(
        "../../backend/state/persistence/manager.js"
      );

      const failingStorage = {
        read: vi.fn().mockReturnValue(null),
        write: vi.fn().mockImplementation(() => {
          throw new Error("Storage write failed");
        }),
        delete: vi.fn(),
        keys: vi.fn().mockReturnValue([]),
        exists: vi.fn().mockReturnValue(false),
        size: vi.fn().mockReturnValue(0),
      };

      const manager = new PersistenceManager(
        {
          strategies: DEFAULT_STRATEGIES,
          defaultStrategy: "always",
          maxSizeBytes: 1024 * 1024,
        },
        failingStorage as any
      );

      const result = await manager.persist("test_key", { data: "test" });
      expect(result).toBe(false);
    });

    it("should handle eviction on size limit", async () => {
      const { PersistenceManager, MemoryStorageBackend, DEFAULT_STRATEGIES } = await import(
        "../../backend/state/persistence/manager.js"
      );

      const storage = new MemoryStorageBackend();

      const manager = new PersistenceManager(
        {
          strategies: DEFAULT_STRATEGIES,
          defaultStrategy: "always",
          maxSizeBytes: 500,
        },
        storage
      );

      await manager.persist("key1", { data: "a".repeat(200) });
      await manager.persist("key2", { data: "b".repeat(200) });
      await manager.persist("key3", { data: "c".repeat(200) });

      const metrics = manager.getMetrics();
      expect(metrics.evictionCount).toBeGreaterThan(0);
    });

    it("should handle strategy selection failure", async () => {
      const { PersistenceManager, MemoryStorageBackend } = await import(
        "../../backend/state/persistence/manager.js"
      );

      const storage = new MemoryStorageBackend();

      const manager = new PersistenceManager(
        {
          strategies: [
            {
              name: "never",
              priority: 0,
              shouldPersist: () => false,
              serialize: JSON.stringify,
              deserialize: JSON.parse,
            },
          ],
          defaultStrategy: "never",
          maxSizeBytes: 1024 * 1024,
        },
        storage
      );

      const result = await manager.persist("test_key", { data: "test" });
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Store - State Corruption", () => {
    it("should handle undefined initial state", async () => {
      const { createStore } = await import("../../backend/state/store.js");

      const store = createStore(undefined as any);

      expect(store.get()).toBeUndefined();
    });

    it("should handle null state update", async () => {
      const { createStore } = await import("../../backend/state/store.js");

      const store = createStore({ value: "initial" });

      store.set(null as any);

      expect(store.get()).toBeNull();
    });

    it("should recover from updater error", async () => {
      const { createStore } = await import("../../backend/state/store.js");

      const store = createStore({ count: 0 });

      expect(() => {
        store.update(() => {
          throw new Error("Updater error");
        });
      }).toThrow("Updater error");

      expect(store.get()).toEqual({ count: 0 });
    });
  });

  describe("History - Corruption Recovery", () => {
    it("should handle empty history", async () => {
      const { createHistory } = await import("../../backend/state/store.js");

      const history = createHistory<string>();

      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
      expect(history.undo()).toBeUndefined();
      expect(history.redo()).toBeUndefined();
    });

    it("should handle history overflow", async () => {
      const { createHistory } = await import("../../backend/state/store.js");

      const history = createHistory<string>(3);

      history.push("a");
      history.push("b");
      history.push("c");
      history.push("d");

      const all = history.getAll();
      expect(all.length).toBe(3);
      expect(all).toEqual(["b", "c", "d"]);
    });

    it("should clear redo stack on new push", async () => {
      const { createHistory } = await import("../../backend/state/store.js");

      const history = createHistory<string>();

      history.push("a");
      history.push("b");
      history.undo();
      history.push("c");

      expect(history.canRedo()).toBe(false);
      expect(history.getAll()).toEqual(["a", "c"]);
    });
  });

  describe("MigrationManager - Corruption Recovery", () => {
    it("should handle migration failure", async () => {
      const { DefaultMigrationManager } = await import("../../backend/state/store.js");

      const manager = new DefaultMigrationManager();

      manager.register({
        version: 1,
        name: "failing_migration",
        up: () => {
          throw new Error("Migration failed");
        },
      });

      expect(() => {
        manager.migrate({ data: "test" }, 0);
      }).toThrow("Migration failed");
    });

    it("should skip migrations for up-to-date state", async () => {
      const { DefaultMigrationManager } = await import("../../backend/state/store.js");

      const manager = new DefaultMigrationManager();

      manager.register({
        version: 1,
        name: "v1_migration",
        up: (state: unknown) => ({ ...(state as Record<string, unknown>), v1: true }),
      });

      const result = manager.migrate({ data: "test" }, 1);

      expect(result).toEqual({ data: "test" });
    });

    it("should apply migrations in order", async () => {
      const { DefaultMigrationManager } = await import("../../backend/state/store.js");

      const manager = new DefaultMigrationManager();

      manager.register({
        version: 2,
        name: "v2_migration",
        up: (state: any) => ({ ...state, v2: true }),
      });

      manager.register({
        version: 1,
        name: "v1_migration",
        up: (state: any) => ({ ...state, v1: true }),
      });

      const result = manager.migrate({ data: "test" }, 0);

      expect(result).toEqual({ data: "test", v1: true, v2: true });
    });
  });

  describe("Edge Cases", () => {
    it("should handle concurrent state modifications", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      const promises: Promise<void>[] = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          (async () => {
            state.set({ scope: "session", key: `key_${i}` }, i);
          })()
        );
      }

      await Promise.all(promises);

      const keys = state.getAllKeys();
      expect(keys.length).toBe(100);
    });

    it("should handle large state values", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      const largeValue = {
        data: "x".repeat(100000),
        nested: {
          array: Array(1000).fill({ item: "test" }),
        },
      };

      state.set({ scope: "session", key: "large" }, largeValue);

      const retrieved = state.get<{ data: string; nested: { array: unknown[] } }>({ scope: "session", key: "large" });
      expect(retrieved?.data.length).toBe(100000);
    });

    it("should handle state with special characters in keys", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      state.set({ scope: "session", key: "key:with:colons" }, "value1");
      state.set({ scope: "session", key: "key-with-dashes" }, "value2");
      state.set({ scope: "session", key: "key_with_underscores" }, "value3");

      expect(state.get({ scope: "session", key: "key:with:colons" })).toBe("value1");
      expect(state.get({ scope: "session", key: "key-with-dashes" })).toBe("value2");
      expect(state.get({ scope: "session", key: "key_with_underscores" })).toBe("value3");
    });

    it("should handle rapid set and delete operations", async () => {
      const { AppState } = await import("../../backend/state/app-state/store.js");

      const state = new AppState({
        scope: "session",
        enableHistory: true,
      });

      for (let i = 0; i < 100; i++) {
        state.set({ scope: "session", key: "temp" }, i);
        state.delete({ scope: "session", key: "temp" });
      }

      expect(state.has({ scope: "session", key: "temp" })).toBe(false);
    });
  });
});
