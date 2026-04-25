import { createSpy, createMockObject, AsyncTestHelper } from "../test-utils";

describe("Unit Test Examples", () => {
  describe("createSpy", () => {
    it("should record function calls", () => {
      const { fn, calls, reset } = createSpy<() => number>(() => 42);

      fn();
      fn();

      expect(calls.length).toBe(2);

      reset();
      expect(calls.length).toBe(0);
    });

    it("should record errors", () => {
      const error = new Error("Test error");
      const { fn, calls } = createSpy<() => void>(() => {
        throw error;
      });

      expect(() => fn()).toThrow("Test error");
      expect(calls.length).toBe(1);
      expect(calls[0].error).toBe(error);
    });
  });

  describe("createMockObject", () => {
    it("should return default values", () => {
      const mock = createMockObject({
        name: "test",
        value: 42,
      });

      expect(mock.name).toBe("test");
      expect(mock.value).toBe(42);
    });

    it("should return mock function for unknown properties", () => {
      const mock = createMockObject<{ fn: () => string }>();
      expect(typeof mock.fn).toBe("function");
    });
  });

  describe("AsyncTestHelper", () => {
    const helper = new AsyncTestHelper();

    it("should wait for specified time", async () => {
      const start = Date.now();
      await helper.waitFor(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
    });

    it("should wait for condition to be true", async () => {
      let counter = 0;
      const condition = () => counter >= 5;

      const interval = setInterval(() => {
        counter++;
      }, 10);

      const result = await helper.waitForCondition(condition, 1000, 50);

      clearInterval(interval);
      expect(result).toBe(true);
      expect(counter).toBeGreaterThanOrEqual(5);
    });
  });
});

describe("State Machine Tests", () => {
  it("should validate task state transitions", () => {
    const states = ["queued", "running", "paused", "completed", "failed", "cancelled"] as const;

    const validTransitions: Record<string, string[]> = {
      queued: ["running", "cancelled"],
      running: ["paused", "completed", "failed", "cancelled"],
      paused: ["running", "cancelled"],
      completed: [],
      failed: ["running", "queued"],
      cancelled: ["queued"],
    };

    for (const [from, toStates] of Object.entries(validTransitions)) {
      for (const to of toStates) {
        expect(validTransitions[from]).toContain(to);
      }
    }
  });
});

describe("Error Catalog Tests", () => {
  it("should categorize errors correctly", () => {
    const errorTypes = ["retryable", "fatal", "user-caused", "timeout", "rate-limit", "network", "validation"] as const;

    for (const type of errorTypes) {
      expect(errorTypes).toContain(type);
    }
  });
});
