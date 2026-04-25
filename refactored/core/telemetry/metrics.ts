export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  traceId?: string;
}

export interface MetricsCollector {
  record(metric: MetricData): void;
  getMetrics(name?: string): MetricData[];
  getSummary(name: string): { count: number; sum: number; avg: number; min: number; max: number };
  clear(): void;
  getToolExecutionSummary(): Record<string, unknown>;
  getTokenUsageSummary(): Record<string, unknown>;
}

export class DefaultMetricsCollector implements MetricsCollector {
  private metrics: MetricData[] = [];

  record(metric: MetricData): void {
    this.metrics.push({
      ...metric,
      timestamp: metric.timestamp || Date.now(),
    });
  }

  getMetrics(name?: string): MetricData[] {
    if (name) {
      return this.metrics.filter((m) => m.name === name);
    }
    return [...this.metrics];
  }

  getSummary(name: string): { count: number; sum: number; avg: number; min: number; max: number } {
    const values = this.metrics.filter((m) => m.name === name).map((m) => m.value);

    if (values.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  clear(): void {
    this.metrics = [];
  }

  getToolExecutionSummary(): Record<string, unknown> {
    const toolMetrics = this.metrics.filter((m) => m.name === "tool_execution_duration");
    const errorCount = this.metrics.filter((m) => m.name === "tool_error").length;
    const successCount = this.metrics.filter((m) => m.name === "tool_success").length;

    return {
      totalExecutions: toolMetrics.length,
      successRate: toolMetrics.length > 0 ? (successCount / (successCount + errorCount)) * 100 : 0,
      avgDuration: this.getSummary("tool_execution_duration").avg,
      totalErrors: errorCount,
    };
  }

  getTokenUsageSummary(): Record<string, unknown> {
    const inputSummary = this.getSummary("input_tokens");
    const outputSummary = this.getSummary("output_tokens");
    const costSummary = this.getSummary("cost_usd");

    return {
      inputTokens: {
        total: inputSummary.sum,
        avg: inputSummary.avg,
      },
      outputTokens: {
        total: outputSummary.sum,
        avg: outputSummary.avg,
      },
      totalCost: costSummary.sum,
    };
  }
}

export function createMetricsCollector(): MetricsCollector {
  return new DefaultMetricsCollector();
}
