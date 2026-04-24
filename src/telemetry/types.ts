export interface PerfettoTracer {
  startTrace(name: string): TraceSpan;
  registerAgent(name: string): void;
  export(): string;
}

export interface TraceSpan {
  name: string;
  startTime: number;
  end(): void;
}

export interface TelemetryCollector {
  recordToolCall(tool: string, duration: number, success: boolean): void;
  recordApiLatency(latency: number): void;
  recordTokenUsage(input: number, output: number): void;
  recordCompaction(before: number, after: number): void;
  getReport(): TelemetryReport;
}

export interface TelemetryReport {
  totalToolCalls: number;
  averageToolDuration: number;
  averageApiLatency: number;
  totalTokens: number;
  compactionCount: number;
  sessionDuration: number;
}
