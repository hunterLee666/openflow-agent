export interface PerfettoTracer {
  startTrace(name: string): TraceSpan;
  registerAgent(name: string): void;
  export(): string;
  createSpan(name: string, parentId?: string): TraceSpan;
}

export interface TraceSpan {
  name: string;
  spanId: string;
  parentId?: string;
  traceId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes?: Record<string, unknown>;
  end(): void;
}

export interface TelemetryEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  event: string;
  timestamp: number;
  durationMs?: number;
  payloadBytes?: number;
  attributes?: Record<string, unknown>;
}

export interface ToolCallEvent extends TelemetryEvent {
  event: "tool_call";
  toolName: string;
  success: boolean;
  error?: string;
}

export interface ApiLatencyEvent extends TelemetryEvent {
  event: "api_latency";
  provider: string;
  model: string;
  latencyMs: number;
  cached?: boolean;
}

export interface TokenUsageEvent extends TelemetryEvent {
  event: "token_usage";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface CompactionEvent extends TelemetryEvent {
  event: "compaction";
  beforeTokens: number;
  afterTokens: number;
  compressionRatio: number;
}

export interface TelemetryCollector {
  recordToolCall(tool: string, duration: number, success: boolean, attributes?: Record<string, unknown>): void;
  recordApiLatency(latency: number, provider?: string, model?: string, cached?: boolean): void;
  recordTokenUsage(input: number, output: number, estimatedCostUsd?: number): void;
  recordCompaction(before: number, after: number): void;
  recordEvent(event: TelemetryEvent): void;
  createSpan(name: string, parentId?: string): TraceSpan;
  getReport(): TelemetryReport;
  getTraceId(): string;
}

export interface TelemetryReport {
  totalToolCalls: number;
  averageToolDuration: number;
  averageApiLatency: number;
  totalTokens: number;
  compactionCount: number;
  sessionDuration: number;
  traceId: string;
  spans: TraceSpan[];
  events: TelemetryEvent[];
}

export interface Telemetry {
  log(event: string, data?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

export function generateTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}`;
}

export function generateSpanId(): string {
  return `span_${Math.random().toString(36).substring(2, 11)}`;
}
