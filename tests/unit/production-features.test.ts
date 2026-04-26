import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerRegistry,
} from "../../src/utils/circuit-breaker.js";
import {
  TranscriptStore,
  createUserMessageEvent,
  createAssistantMessageEvent,
  createErrorEvent,
} from "../../src/utils/transcript.js";
import {
  retryWithBackoff,
  calculateExponentialBackoff,
  RetryBudget,
} from "../../src/utils/retry-with-backoff.js";
import {
  DegradationLadder,
  DEFAULT_DEGRADATION_LEVELS,
} from "../../src/utils/degradation-ladder.js";

describe("Circuit Breaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("test", {
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 1000,
    });
  });

  afterEach(() => {
    breaker.shutdown();
  });

  it("should start in CLOSED state", () => {
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should execute successful operations", async () => {
    const result = await breaker.execute(async () => "success");
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should transition to OPEN after threshold failures", async () => {
    const failingFn = async () => {
      throw new Error("Test error");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch {
        // Expected
      }
    }

    expect(breaker.getState()).toBe("OPEN");
  });

  it("should throw CircuitBreakerError when OPEN", async () => {
    const failingFn = async () => {
      throw new Error("Test error");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch {
        // Expected
      }
    }

    await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitBreakerError);
  });

  it("should transition to HALF_OPEN after timeout", async () => {
    const failingFn = async () => {
      throw new Error("Test error");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch {
        // Expected
      }
    }

    expect(breaker.getState()).toBe("OPEN");

    await new Promise((resolve) => setTimeout(resolve, 1100));

    try {
      await breaker.execute(async () => "test");
    } catch {
      // May throw if still checking
    }

    expect(breaker.getState()).toBe("HALF_OPEN");
  });

  it("should reset to CLOSED after successful HALF_OPEN tests", async () => {
    const failingFn = async () => {
      throw new Error("Test error");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch {
        // Expected
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await breaker.execute(async () => "success1");
    await breaker.execute(async () => "success2");

    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should track statistics", async () => {
    await breaker.execute(async () => "success");

    try {
      await breaker.execute(async () => {
        throw new Error("Test");
      });
    } catch {
      // Expected
    }

    const stats = breaker.getStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.totalSuccesses).toBe(1);
    expect(stats.totalFailures).toBe(1);
  });
});

describe("Circuit Breaker Registry", () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  afterEach(() => {
    registry.shutdown();
  });

  it("should create and retrieve breakers", () => {
    const breaker1 = registry.create("api");
    const breaker2 = registry.get("api");

    expect(breaker1).toBe(breaker2);
  });

  it("should return existing breaker if name exists", () => {
    const breaker1 = registry.create("api");
    const breaker2 = registry.create("api");

    expect(breaker1).toBe(breaker2);
  });
});

describe("Transcript Store", () => {
  let store: TranscriptStore;

  beforeEach(() => {
    store = new TranscriptStore(1000);
  });

  it("should append events", () => {
    const event = createUserMessageEvent("session1", "Hello");
    const appended = store.append(event);

    expect(appended.id).toBeDefined();
    expect(appended.sequence).toBe(1);
    expect(appended.type).toBe("user_message");
  });

  it("should query events by type", () => {
    store.append(createUserMessageEvent("session1", "Hello"));
    store.append(createAssistantMessageEvent("session1", "Hi there"));
    store.append(createUserMessageEvent("session1", "How are you?"));

    const userMessages = store.query({ type: "user_message" });
    expect(userMessages).toHaveLength(2);
  });

  it("should query events by session", () => {
    store.append(createUserMessageEvent("session1", "Hello"));
    store.append(createUserMessageEvent("session2", "Hi"));

    const session1Events = store.query({ sessionId: "session1" });
    expect(session1Events).toHaveLength(1);
  });

  it("should generate summary", () => {
    store.append(createUserMessageEvent("session1", "Hello"));
    store.append(createAssistantMessageEvent("session1", "Hi"));
    store.append(createErrorEvent("session1", new Error("Test error")));

    const summary = store.getSummary();
    expect(summary.totalEvents).toBe(3);
    expect(summary.errorCount).toBe(1);
  });

  it("should notify on change", () => {
    let notified = false;
    store.onChange(() => {
      notified = true;
    });

    store.append(createUserMessageEvent("session1", "Hello"));
    expect(notified).toBe(true);
  });

  it("should export and import", () => {
    store.append(createUserMessageEvent("session1", "Hello"));
    store.append(createAssistantMessageEvent("session1", "Hi"));

    const exported = store.export();
    expect(exported).toHaveLength(2);

    const newStore = new TranscriptStore();
    newStore.import(exported);
    expect(newStore.getSummary().totalEvents).toBe(2);
  });
});

describe("Retry With Backoff", () => {
  it("should calculate exponential backoff with jitter", () => {
    const delay1 = calculateExponentialBackoff(0, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterFactor: 0.5,
    });

    const delay2 = calculateExponentialBackoff(1, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterFactor: 0.5,
    });

    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay2).toBeGreaterThan(delay1);
    expect(delay2).toBeLessThanOrEqual(30000);
  });

  it("should succeed on first attempt", async () => {
    const result = await retryWithBackoff(async () => "success", {
      maxRetries: 3,
      baseDelayMs: 100,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe("success");
    expect(result.attempts).toBe(1);
  });

  it("should retry on failure", async () => {
    let attemptCount = 0;
    const result = await retryWithBackoff(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Temporary error");
        }
        return "success";
      },
      {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 500,
      }
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it("should fail after max retries", async () => {
    const result = await retryWithBackoff(
      async () => {
        throw new Error("Persistent error");
      },
      {
        maxRetries: 2,
        baseDelayMs: 100,
        maxDelayMs: 500,
      }
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toBeDefined();
  });
});

describe("Retry Budget", () => {
  let budget: RetryBudget;

  beforeEach(() => {
    budget = new RetryBudget(3, 1000);
  });

  it("should allow retries within budget", () => {
    expect(budget.canRetry()).toBe(true);
    budget.recordRetry();
    expect(budget.getRetryCount()).toBe(1);
  });

  it("should block when budget exceeded", () => {
    budget.recordRetry();
    budget.recordRetry();
    budget.recordRetry();

    expect(budget.canRetry()).toBe(false);
    expect(budget.getRemainingBudget()).toBe(0);
  });

  it("should reset budget", () => {
    budget.recordRetry();
    budget.recordRetry();
    budget.reset();

    expect(budget.getRetryCount()).toBe(0);
    expect(budget.canRetry()).toBe(true);
  });
});

describe("Degradation Ladder", () => {
  let ladder: DegradationLadder;

  beforeEach(() => {
    ladder = new DegradationLadder({
      autoRecovery: false,
    });
  });

  afterEach(() => {
    ladder.shutdown();
  });

  it("should start at level 0", () => {
    expect(ladder.getCurrentLevel()).toBe(0);
  });

  it("should degrade on errors", () => {
    ladder.degrade("context_window_exceeded");
    expect(ladder.getCurrentLevel()).toBeGreaterThan(0);
  });

  it("should disable features at higher levels", () => {
    expect(ladder.isFeatureEnabled("full_context")).toBe(true);

    ladder.degrade("context_window_exceeded");
    ladder.degrade("context_window_exceeded");
    ladder.degrade("context_window_exceeded");

    const disabled = ladder.getDisabledFeatures();
    expect(disabled.length).toBeGreaterThan(0);
  });

  it("should recover", () => {
    ladder.degrade("context_window_exceeded");
    ladder.degrade("context_window_exceeded");

    const previousLevel = ladder.getCurrentLevel();
    ladder.recover();

    expect(ladder.getCurrentLevel()).toBeLessThanOrEqual(previousLevel);
  });

  it("should reset to level 0", () => {
    ladder.degrade("context_window_exceeded");
    ladder.degrade("context_window_exceeded");

    ladder.reset();
    expect(ladder.getCurrentLevel()).toBe(0);
  });

  it("should provide status", () => {
    const status = ladder.getStatus();
    expect(status.level).toBe(0);
    expect(status.name).toBe("Full Service");
    expect(status.enabledFeatures).toContain("full_context");
  });
});
