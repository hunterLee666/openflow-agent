import { describe, test, expect } from "bun:test";
import { TokenRefreshScheduler, DEFAULT_TOKEN_REFRESH_CONFIG } from "../../../refactored/core/token/token-refresh.js";

describe("Token Refresh Scheduler", () => {
  test("should schedule token refresh", () => {
    const scheduler = new TokenRefreshScheduler(
      { refreshBeforeExpiryMs: 100, defaultExpiryMs: 500 },
      () => "new-token-123"
    );
    scheduler.schedule("session-1", 500);

    expect(scheduler.getPendingCount()).toBe(1);
    expect(scheduler.listPending()).toContain("session-1");

    scheduler.cancelAll();
  });

  test("should cancel scheduled refresh", () => {
    const scheduler = new TokenRefreshScheduler(
      { refreshBeforeExpiryMs: 100, defaultExpiryMs: 500 },
      () => "new-token-123"
    );
    scheduler.schedule("session-2", 500);

    const cancelled = scheduler.cancel("session-2");
    expect(cancelled).toBe(true);
    expect(scheduler.getPendingCount()).toBe(0);
  });

  test("should return null for unscheduled session", () => {
    const scheduler = new TokenRefreshScheduler({}, () => "new-token-123");
    const scheduledTime = scheduler.getScheduledTime("non-existent");
    expect(scheduledTime).toBeNull();
  });

  test("should use default config when not provided", () => {
    const scheduler = new TokenRefreshScheduler();
    expect(scheduler.getPendingCount()).toBe(0);
  });

  test("should handle custom config", () => {
    const customConfig = {
      refreshBeforeExpiryMs: 60000,
      defaultExpiryMs: 3600000,
    };
    const scheduler = new TokenRefreshScheduler(customConfig);
    expect(scheduler.getPendingCount()).toBe(0);
  });
});
