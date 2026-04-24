import type { TelemetryCollector, TelemetryReport, PerfettoTracer, TraceSpan } from "./types.js";

export class DefaultTelemetryCollector implements TelemetryCollector {
  private toolCalls: { tool: string; duration: number; success: boolean }[] = [];
  private apiLatencies: number[] = [];
  private tokenUsage: { input: number; output: number }[] = [];
  private compactions: { before: number; after: number }[] = [];
  private sessionStart: number;

  constructor() {
    this.sessionStart = Date.now();
  }

  recordToolCall(tool: string, duration: number, success: boolean): void {
    this.toolCalls.push({ tool, duration, success });
  }

  recordApiLatency(latency: number): void {
    this.apiLatencies.push(latency);
  }

  recordTokenUsage(input: number, output: number): void {
    this.tokenUsage.push({ input, output });
  }

  recordCompaction(before: number, after: number): void {
    this.compactions.push({ before, after });
  }

  getReport(): TelemetryReport {
    const totalToolCalls = this.toolCalls.length;
    const averageToolDuration = totalToolCalls > 0
      ? this.toolCalls.reduce((sum, t) => sum + t.duration, 0) / totalToolCalls
      : 0;

    const averageApiLatency = this.apiLatencies.length > 0
      ? this.apiLatencies.reduce((sum, l) => sum + l, 0) / this.apiLatencies.length
      : 0;

    const totalTokens = this.tokenUsage.reduce((sum, t) => sum + t.input + t.output, 0);

    return {
      totalToolCalls,
      averageToolDuration,
      averageApiLatency,
      totalTokens,
      compactionCount: this.compactions.length,
      sessionDuration: Date.now() - this.sessionStart,
    };
  }
}

export class DefaultPerfettoTracer implements PerfettoTracer {
  private spans: { name: string; startTime: number; endTime?: number }[] = [];
  private activeSpans = new Map<string, { name: string; startTime: number }>();
  private agents: string[] = [];

  registerAgent(name: string): void {
    this.agents.push(name);
  }

  startTrace(name: string): TraceSpan {
    const span: { name: string; startTime: number; endTime?: number } = {
      name,
      startTime: Date.now(),
    };
    this.spans.push(span);

    return {
      name,
      startTime: span.startTime,
      end: () => {
        span.endTime = Date.now();
      },
    };
  }

  export(): string {
    // Simple JSON format compatible with Perfetto
    const trace = {
      traceEvents: this.spans.map((span, i) => ({
        name: span.name,
        ph: span.endTime ? "X" : "B",
        ts: span.startTime * 1000, // microseconds
        dur: span.endTime ? (span.endTime - span.startTime) * 1000 : 0,
        pid: 1,
        tid: i + 1,
      })),
      agents: this.agents,
    };
    return JSON.stringify(trace);
  }
}
