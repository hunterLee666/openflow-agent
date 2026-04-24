import type {
  TelemetryCollector,
  TelemetryReport,
  PerfettoTracer,
  TraceSpan,
  TelemetryEvent,
} from "./types.js";
import { generateTraceId, generateSpanId } from "./types.js";

export class DefaultTelemetryCollector implements TelemetryCollector {
  private toolCalls: { tool: string; duration: number; success: boolean; attributes?: Record<string, unknown> }[] = [];
  private apiLatencies: { latency: number; provider?: string; model?: string; cached?: boolean }[] = [];
  private tokenUsage: { input: number; output: number; estimatedCostUsd?: number }[] = [];
  private compactions: { before: number; after: number }[] = [];
  private events: TelemetryEvent[] = [];
  private spans: TraceSpan[] = [];
  private sessionStart: number;
  private traceId: string;

  constructor(traceId?: string) {
    this.sessionStart = Date.now();
    this.traceId = traceId || generateTraceId();
  }

  getTraceId(): string {
    return this.traceId;
  }

  recordToolCall(tool: string, duration: number, success: boolean, attributes?: Record<string, unknown>): void {
    const spanId = generateSpanId();
    const event: TelemetryEvent = {
      traceId: this.traceId,
      spanId,
      event: "tool_call",
      timestamp: Date.now(),
      durationMs: duration,
      payloadBytes: JSON.stringify({ tool, success, attributes }).length,
      attributes: { tool, success, ...attributes },
    };
    this.events.push(event);
    this.toolCalls.push({ tool, duration, success, attributes });
  }

  recordApiLatency(latency: number, provider?: string, model?: string, cached?: boolean): void {
    const spanId = generateSpanId();
    const event: TelemetryEvent = {
      traceId: this.traceId,
      spanId,
      event: "api_latency",
      timestamp: Date.now(),
      durationMs: latency,
      attributes: { provider, model, cached },
    };
    this.events.push(event);
    this.apiLatencies.push({ latency, provider, model, cached });
  }

  recordTokenUsage(input: number, output: number, estimatedCostUsd?: number): void {
    const spanId = generateSpanId();
    const event: TelemetryEvent = {
      traceId: this.traceId,
      spanId,
      event: "token_usage",
      timestamp: Date.now(),
      payloadBytes: input + output,
      attributes: { inputTokens: input, outputTokens: output, estimatedCostUsd },
    };
    this.events.push(event);
    this.tokenUsage.push({ input, output, estimatedCostUsd });
  }

  recordCompaction(before: number, after: number): void {
    const spanId = generateSpanId();
    const compressionRatio = before > 0 ? (before - after) / before : 0;
    const event: TelemetryEvent = {
      traceId: this.traceId,
      spanId,
      event: "compaction",
      timestamp: Date.now(),
      payloadBytes: before + after,
      attributes: { beforeTokens: before, afterTokens: after, compressionRatio },
    };
    this.events.push(event);
    this.compactions.push({ before, after });
  }

  recordEvent(event: TelemetryEvent): void {
    event.traceId = this.traceId;
    this.events.push(event);
  }

  createSpan(name: string, parentId?: string): TraceSpan {
    const spanId = generateSpanId();
    const span: TraceSpan = {
      name,
      spanId,
      parentId,
      traceId: this.traceId,
      startTime: Date.now(),
      attributes: {},
      end: function(this: TraceSpan): void {
        this.endTime = Date.now();
        this.durationMs = this.endTime - this.startTime;
      },
    };
    this.spans.push(span);
    return span;
  }

  getReport(): TelemetryReport {
    const totalToolCalls = this.toolCalls.length;
    const averageToolDuration = totalToolCalls > 0
      ? this.toolCalls.reduce((sum, t) => sum + t.duration, 0) / totalToolCalls
      : 0;

    const averageApiLatency = this.apiLatencies.length > 0
      ? this.apiLatencies.reduce((sum, l) => sum + l.latency, 0) / this.apiLatencies.length
      : 0;

    const totalTokens = this.tokenUsage.reduce((sum, t) => sum + t.input + t.output, 0);

    return {
      totalToolCalls,
      averageToolDuration,
      averageApiLatency,
      totalTokens,
      compactionCount: this.compactions.length,
      sessionDuration: Date.now() - this.sessionStart,
      traceId: this.traceId,
      spans: this.spans,
      events: this.events,
    };
  }
}

export class DefaultPerfettoTracer implements PerfettoTracer {
  private spans: TraceSpan[] = [];
  private activeSpans = new Map<string, TraceSpan>();
  private agents: string[] = [];
  private traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || generateTraceId();
  }

  registerAgent(name: string): void {
    this.agents.push(name);
  }

  startTrace(name: string): TraceSpan {
    return this.createSpan(name);
  }

  createSpan(name: string, parentId?: string): TraceSpan {
    const spanId = generateSpanId();
    const span: TraceSpan = {
      name,
      spanId,
      parentId,
      traceId: this.traceId,
      startTime: Date.now(),
      attributes: {},
      end: function(this: TraceSpan): void {
        this.endTime = Date.now();
        this.durationMs = this.endTime - this.startTime;
      },
    };
    this.spans.push(span);
    this.activeSpans.set(spanId, span);
    return span;
  }

  export(): string {
    const trace = {
      traceEvents: this.spans.map((span) => ({
        name: span.name,
        spanId: span.spanId,
        parentId: span.parentId,
        traceId: span.traceId,
        ph: span.endTime ? "X" : "B",
        ts: span.startTime * 1000,
        dur: span.durationMs ? span.durationMs * 1000 : 0,
        pid: 1,
        tid: 1,
      })),
      agents: this.agents,
      traceId: this.traceId,
    };
    return JSON.stringify(trace, null, 2);
  }
}
