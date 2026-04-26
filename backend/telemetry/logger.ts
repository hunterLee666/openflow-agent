import { z } from "zod";

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogEntrySchema = z.object({
  timestamp: z.number(),
  level: LogLevelSchema,
  module: z.string(),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LoggerConfigSchema = z.object({
  minLevel: LogLevelSchema,
  enableConsole: z.boolean(),
  enableFile: z.boolean(),
  filePath: z.string().optional(),
  enableTelemetry: z.boolean(),
});

export type LoggerConfig = z.infer<typeof LoggerConfigSchema>;

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  child(module: string): Logger;
  getEntries(): LogEntry[];
  clear(): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class DefaultLogger implements Logger {
  private config: LoggerConfig;
  private module: string;
  private entries: LogEntry[] = [];
  private traceId?: string;
  private spanId?: string;

  constructor(config: Partial<LoggerConfig> = {}, module = "root", traceId?: string, spanId?: string) {
    this.config = {
      minLevel: config.minLevel ?? "info",
      enableConsole: config.enableConsole ?? true,
      enableFile: config.enableFile ?? false,
      filePath: config.filePath,
      enableTelemetry: config.enableTelemetry ?? false,
    };
    this.module = module;
    this.traceId = traceId;
    this.spanId = spanId;
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  child(module: string): Logger {
    return new DefaultLogger(this.config, module, this.traceId, this.spanId);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      module: this.module,
      message,
      metadata,
      traceId: this.traceId,
      spanId: this.spanId,
    };

    this.entries.push(entry);

    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }

    if (this.config.enableFile && this.config.filePath) {
      this.writeToFile(entry);
    }

    if (this.config.enableTelemetry) {
      this.sendToTelemetry(entry);
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const levelColors: Record<LogLevel, string> = {
      debug: "\x1b[36m",
      info: "\x1b[32m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    const color = levelColors[entry.level];
    const time = new Date(entry.timestamp).toISOString();
    const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : "";
    console.log(`${color}[${time}] [${entry.level.toUpperCase()}] [${entry.module}]${reset} ${entry.message}${meta}`);
  }

  private writeToFile(_entry: LogEntry): void {
    // File writing would require fs module
    // Implementation depends on runtime environment
  }

  private sendToTelemetry(_entry: LogEntry): void {
    // Telemetry sending would require network calls
    // Implementation depends on telemetry backend
  }
}

export function createLogger(config: Partial<LoggerConfig> = {}, module = "root"): Logger {
  return new DefaultLogger(config, module);
}

export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateSpanId(): string {
  return `span_${Math.random().toString(36).slice(2, 10)}`;
}
