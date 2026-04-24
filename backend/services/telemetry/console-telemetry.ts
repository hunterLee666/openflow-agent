import type { Telemetry } from "./types.js";

export class ConsoleTelemetry implements Telemetry {
  private events: Array<{ event: string; data?: Record<string, unknown>; time: number }> = [];

  log(event: string, data?: Record<string, unknown>): void {
    this.events.push({ event, data, time: Date.now() });
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) return;
    this.events = [];
  }
}
