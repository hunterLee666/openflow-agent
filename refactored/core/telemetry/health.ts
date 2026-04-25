export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, { status: "ok" | "warn" | "error"; message?: string; latency?: number }>;
  timestamp: number;
  uptime: number;
}

export interface HealthChecker {
  registerCheck(name: string, check: () => Promise<{ status: "ok" | "warn" | "error"; message?: string; latency?: number }>): void;
  check(): Promise<HealthCheckResult>;
}

export class DefaultHealthChecker implements HealthChecker {
  private checks: Map<string, () => Promise<{ status: "ok" | "warn" | "error"; message?: string; latency?: number }>> = new Map();
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  registerCheck(name: string, check: () => Promise<{ status: "ok" | "warn" | "error"; message?: string; latency?: number }>): void {
    this.checks.set(name, check);
  }

  async check(): Promise<HealthCheckResult> {
    const results: Record<string, { status: "ok" | "warn" | "error"; message?: string; latency?: number }> = {};
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

    for (const [name, checkFn] of this.checks.entries()) {
      const start = Date.now();
      try {
        const result = await checkFn();
        results[name] = {
          ...result,
          latency: Date.now() - start,
        };

        if (result.status === "error") {
          overallStatus = "unhealthy";
        } else if (result.status === "warn" && overallStatus !== "unhealthy") {
          overallStatus = "degraded";
        }
      } catch (error) {
        results[name] = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          latency: Date.now() - start,
        };
        overallStatus = "unhealthy";
      }
    }

    return {
      status: overallStatus,
      checks: results,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    };
  }
}

export function createHealthChecker(): HealthChecker {
  return new DefaultHealthChecker();
}
