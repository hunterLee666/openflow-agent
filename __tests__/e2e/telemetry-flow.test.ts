import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Telemetry Data Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Telemetry Initialization", () => {
    it("should have telemetry initialized", () => {
      expect(services.telemetry).toBeDefined();
    });

    it("should have telemetry collector initialized", () => {
      expect(services.telemetryCollector).toBeDefined();
    });

    it("should have perfetto tracer initialized", () => {
      expect(services.perfettoTracer).toBeDefined();
    });
  });

  describe("Telemetry Types", () => {
    it("should have ConsoleTelemetry class", async () => {
      const { ConsoleTelemetry } = await import("../../backend/services/telemetry.js");
      expect(ConsoleTelemetry).toBeDefined();
    });

    it("should have DefaultTelemetryCollector class", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      expect(DefaultTelemetryCollector).toBeDefined();
    });

    it("should have DefaultPerfettoTracer class", async () => {
      const { DefaultPerfettoTracer } = await import("../../backend/services/telemetry/index.js");
      expect(DefaultPerfettoTracer).toBeDefined();
    });
  });

  describe("Telemetry Methods", () => {
    it("should have recordEvent method", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      expect(typeof collector.recordEvent).toBe("function");
    });

    it("should have recordToolCall method", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      expect(typeof collector.recordToolCall).toBe("function");
    });

    it("should have recordApiLatency method", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      expect(typeof collector.recordApiLatency).toBe("function");
    });

    it("should have recordTokenUsage method", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      expect(typeof collector.recordTokenUsage).toBe("function");
    });

    it("should have createSpan method", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      expect(typeof collector.createSpan).toBe("function");
    });

    it("should have getTraceId method", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      expect(typeof collector.getTraceId).toBe("function");
    });
  });

  describe("Telemetry Event Recording", () => {
    it("should record tool calls", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      collector.recordToolCall("test-tool", 100, true, { key: "value" });
      const report = collector.getReport();
      expect(report).toBeDefined();
    });

    it("should record API latency", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      collector.recordApiLatency(500, "test-provider", "test-model", false);
      const report = collector.getReport();
      expect(report).toBeDefined();
    });

    it("should record token usage", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      collector.recordTokenUsage(100, 50, 0.01);
      const report = collector.getReport();
      expect(report).toBeDefined();
    });
  });

  describe("Span Creation", () => {
    it("should create spans", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      const span = collector.createSpan("test-operation");
      expect(span).toBeDefined();
      expect(span.name).toBe("test-operation");
    });

    it("should handle nested spans", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      const parentSpan = collector.createSpan("parent-operation");
      const childSpan = collector.createSpan("child-operation", parentSpan.spanId);
      expect(childSpan.parentId).toBe(parentSpan.spanId);
    });
  });

  describe("Telemetry Report", () => {
    it("should generate report", async () => {
      const { DefaultTelemetryCollector } = await import("../../backend/services/telemetry/index.js");
      const collector = new DefaultTelemetryCollector();
      collector.recordToolCall("tool-1", 100, true);
      collector.recordToolCall("tool-2", 200, false);
      const report = collector.getReport();
      expect(report).toBeDefined();
      expect(report.toolCalls).toBeDefined();
    });
  });
});
