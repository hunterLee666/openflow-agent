import { describe, test, expect } from "bun:test";
import { createLogger, generateTraceId, generateSpanId } from "../../../refactored/core/telemetry/logger.js";
import { createMetricsCollector } from "../../../refactored/core/telemetry/metrics.js";
import { createHealthChecker } from "../../../refactored/core/telemetry/health.js";

describe("Telemetry: Logger", () => {
  test("should create logger with default config", () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
  });

  test("should log at different levels", () => {
    const logger = createLogger({ minLevel: "debug" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const entries = logger.getEntries();
    expect(entries.length).toBe(4);
  });

  test("should filter by log level", () => {
    const logger = createLogger({ minLevel: "warn" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const entries = logger.getEntries();
    expect(entries.length).toBe(2);
  });

  test("should create child logger", () => {
    const parent = createLogger({}, "parent");
    const child = parent.child("child");

    child.info("child message");
    const entries = child.getEntries();
    expect(entries[0].module).toBe("child");
  });

  test("should generate trace and span ids", () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();

    expect(traceId).toMatch(/^trace_/);
    expect(spanId).toMatch(/^span_/);
  });

  test("should clear entries", () => {
    const logger = createLogger();
    logger.info("message 1");
    logger.info("message 2");
    logger.clear();

    expect(logger.getEntries().length).toBe(0);
  });
});

describe("Telemetry: Metrics", () => {
  test("should record metrics", () => {
    const collector = createMetricsCollector();
    collector.record({ name: "duration", value: 100, timestamp: Date.now() });
    collector.record({ name: "duration", value: 200, timestamp: Date.now() });

    const metrics = collector.getMetrics("duration");
    expect(metrics.length).toBe(2);
  });

  test("should calculate summary", () => {
    const collector = createMetricsCollector();
    collector.record({ name: "duration", value: 100, timestamp: Date.now() });
    collector.record({ name: "duration", value: 200, timestamp: Date.now() });
    collector.record({ name: "duration", value: 300, timestamp: Date.now() });

    const summary = collector.getSummary("duration");
    expect(summary.count).toBe(3);
    expect(summary.sum).toBe(600);
    expect(summary.avg).toBe(200);
    expect(summary.min).toBe(100);
    expect(summary.max).toBe(300);
  });

  test("should return empty summary for unknown metric", () => {
    const collector = createMetricsCollector();
    const summary = collector.getSummary("unknown");
    expect(summary.count).toBe(0);
  });

  test("should get tool execution summary", () => {
    const collector = createMetricsCollector();
    collector.record({ name: "tool_execution_duration", value: 100, timestamp: Date.now() });
    collector.record({ name: "tool_execution_duration", value: 200, timestamp: Date.now() });
    collector.record({ name: "tool_success", value: 1, timestamp: Date.now() });
    collector.record({ name: "tool_error", value: 1, timestamp: Date.now() });

    const summary = collector.getToolExecutionSummary();
    expect(summary.totalExecutions).toBe(2);
  });

  test("should get token usage summary", () => {
    const collector = createMetricsCollector();
    collector.record({ name: "input_tokens", value: 1000, timestamp: Date.now() });
    collector.record({ name: "output_tokens", value: 500, timestamp: Date.now() });
    collector.record({ name: "cost_usd", value: 0.05, timestamp: Date.now() });

    const summary = collector.getTokenUsageSummary();
    expect(summary.inputTokens.total).toBe(1000);
    expect(summary.outputTokens.total).toBe(500);
  });

  test("should clear metrics", () => {
    const collector = createMetricsCollector();
    collector.record({ name: "test", value: 1, timestamp: Date.now() });
    collector.clear();

    expect(collector.getMetrics().length).toBe(0);
  });
});

describe("Telemetry: Health Check", () => {
  test("should create health checker", () => {
    const checker = createHealthChecker();
    expect(checker).toBeDefined();
  });

  test("should register and run health checks", async () => {
    const checker = createHealthChecker();
    checker.registerCheck("database", async () => ({ status: "ok", message: "Connected" }));
    checker.registerCheck("cache", async () => ({ status: "ok", message: "Connected" }));

    const result = await checker.check();
    expect(result.status).toBe("healthy");
    expect(result.checks.database.status).toBe("ok");
    expect(result.checks.cache.status).toBe("ok");
  });

  test("should detect unhealthy checks", async () => {
    const checker = createHealthChecker();
    checker.registerCheck("database", async () => ({ status: "ok" }));
    checker.registerCheck("cache", async () => {
      throw new Error("Connection failed");
    });

    const result = await checker.check();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.cache.status).toBe("error");
  });

  test("should detect degraded checks", async () => {
    const checker = createHealthChecker();
    checker.registerCheck("database", async () => ({ status: "ok" }));
    checker.registerCheck("cache", async () => ({ status: "warn", message: "Slow response" }));

    const result = await checker.check();
    expect(result.status).toBe("degraded");
  });

  test("should include uptime", async () => {
    const checker = createHealthChecker();
    const result = await checker.check();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeGreaterThan(0);
  });
});
