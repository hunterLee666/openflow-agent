import { createHash } from "node:crypto";
import { z } from "zod";

export const CacheInvalidationEventSchema = z.object({
  timestamp: z.number(),
  layerName: z.string(),
  reason: z.string(),
  oldHash: z.string().nullable(),
  newHash: z.string(),
  contentLength: z.number(),
  severity: z.enum(["info", "warning", "critical"]),
});

export type CacheInvalidationEvent = z.infer<typeof CacheInvalidationEventSchema>;

export const CacheHealthReportSchema = z.object({
  totalInvalidations: z.number(),
  invalidationRate: z.number(),
  averageContentLength: z.number(),
  topInvalidationReasons: z.array(z.object({ reason: z.string(), count: z.number() })),
  layerHealth: z.map(z.string(), z.object({
    invalidations: z.number(),
    lastInvalidation: z.number(),
    stability: z.enum(["stable", "volatile", "critical"]),
  })),
  recommendations: z.array(z.string()),
  contextUsageRatio: z.number().optional(),
  contextWarning: z.string().optional(),
});

export type CacheHealthReport = z.infer<typeof CacheHealthReportSchema>;

export const CacheMonitorConfigSchema = z.object({
  windowMs: z.number().optional(),
  warningThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  maxHistorySize: z.number().optional(),
  contextWarningThreshold: z.number().optional(),
});

export type CacheMonitorConfig = z.infer<typeof CacheMonitorConfigSchema>;

const DEFAULT_CONFIG: Required<CacheMonitorConfig> = {
  windowMs: 300_000,
  warningThreshold: 5,
  criticalThreshold: 15,
  maxHistorySize: 100,
  contextWarningThreshold: 0.60,
};

export class PromptCacheMonitor {
  private config: Required<CacheMonitorConfig>;
  private history: CacheInvalidationEvent[] = [];
  private layerHashes: Map<string, string> = new Map();
  private layerInvalidationCounts: Map<string, number> = new Map();
  private onAlert?: (report: CacheHealthReport, event: CacheInvalidationEvent) => void;

  constructor(config?: CacheMonitorConfig, onAlert?: (report: CacheHealthReport, event: CacheInvalidationEvent) => void) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onAlert = onAlert;
  }

  trackLayerUpdate(layerName: string, content: string, reason?: string): CacheInvalidationEvent | null {
    const newHash = this.hashContent(content);
    const oldHash = this.layerHashes.get(layerName) || null;

    if (oldHash === newHash) {
      return null;
    }

    const event: CacheInvalidationEvent = {
      timestamp: Date.now(),
      layerName,
      reason: reason || this.detectInvalidationReason(layerName, content),
      oldHash,
      newHash,
      contentLength: content.length,
      severity: this.calculateSeverity(layerName, content),
    };

    this.layerHashes.set(layerName, newHash);
    this.history.push(event);

    const currentCount = this.layerInvalidationCounts.get(layerName) || 0;
    this.layerInvalidationCounts.set(layerName, currentCount + 1);

    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }

    this.checkAndAlert(event);

    return event;
  }

  getHealthReport(contextTokens?: number, maxTokens?: number): CacheHealthReport {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const recentEvents = this.history.filter((e) => e.timestamp >= windowStart);
    const totalInvalidations = recentEvents.length;
    const invalidationRate = totalInvalidations / (this.config.windowMs / 60_000);

    const averageContentLength = recentEvents.length > 0
      ? recentEvents.reduce((sum, e) => sum + e.contentLength, 0) / recentEvents.length
      : 0;

    const reasonCounts = new Map<string, number>();
    for (const event of recentEvents) {
      const count = reasonCounts.get(event.reason) || 0;
      reasonCounts.set(event.reason, count + 1);
    }

    const topInvalidationReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const layerHealth = new Map<string, { invalidations: number; lastInvalidation: number; stability: "stable" | "volatile" | "critical" }>();

    for (const [layerName, count] of this.layerInvalidationCounts) {
      const lastEvent = recentEvents.filter((e) => e.layerName === layerName).pop();
      const lastInvalidation = lastEvent?.timestamp || 0;

      let stability: "stable" | "volatile" | "critical";
      if (count <= 2) {
        stability = "stable";
      } else if (count <= this.config.warningThreshold) {
        stability = "volatile";
      } else {
        stability = "critical";
      }

      layerHealth.set(layerName, { invalidations: count, lastInvalidation, stability });
    }

    const recommendations = this.generateRecommendations(
      totalInvalidations,
      invalidationRate,
      layerHealth,
      topInvalidationReasons,
    );

    let contextUsageRatio: number | undefined;
    let contextWarning: string | undefined;

    if (contextTokens !== undefined && maxTokens !== undefined && maxTokens > 0) {
      contextUsageRatio = contextTokens / maxTokens;

      if (contextUsageRatio >= this.config.contextWarningThreshold) {
        contextWarning = `⚠️ 上下文使用率已达 ${(contextUsageRatio * 100).toFixed(1)}%，建议执行 /compact 或拆分任务`;
        recommendations.push(contextWarning);
      }

      if (contextUsageRatio >= 0.87) {
        contextWarning = `🔴 上下文使用率已达 ${(contextUsageRatio * 100).toFixed(1)}%，即将触发自动压缩`;
        recommendations.push(contextWarning);
      }
    }

    return {
      totalInvalidations,
      invalidationRate,
      averageContentLength,
      topInvalidationReasons,
      layerHealth,
      recommendations,
      contextUsageRatio,
      contextWarning,
    };
  }

  private checkAndAlert(event: CacheInvalidationEvent): void {
    if (!this.onAlert) return;

    const report = this.getHealthReport();

    if (event.severity === "critical" || report.totalInvalidations >= this.config.criticalThreshold) {
      this.onAlert(report, event);
    } else if (event.severity === "warning" || report.totalInvalidations >= this.config.warningThreshold) {
      this.onAlert(report, event);
    }
  }

  private detectInvalidationReason(layerName: string, content: string): string {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("timestamp") || lowerContent.includes("date.now()") || /\d{4}-\d{2}-\d{2}/.test(content)) {
      return "timestamp_or_date_change";
    }

    if (lowerContent.includes("session") || lowerContent.includes("turn") || lowerContent.includes("user")) {
      return "session_context_change";
    }

    if (lowerContent.includes("memory") || lowerContent.includes("inject")) {
      return "memory_injection_change";
    }

    if (lowerContent.includes("environment") || lowerContent.includes("process.")) {
      return "environment_change";
    }

    if (lowerContent.includes("tool") || lowerContent.includes("available")) {
      return "tool_list_change";
    }

    return "content_modified";
  }

  private calculateSeverity(layerName: string, content: string): "info" | "warning" | "critical" {
    const count = this.layerInvalidationCounts.get(layerName) || 0;

    if (count >= this.config.criticalThreshold) {
      return "critical";
    }

    if (count >= this.config.warningThreshold) {
      return "warning";
    }

    if (content.length > 10_000) {
      return "warning";
    }

    return "info";
  }

  private generateRecommendations(
    totalInvalidations: number,
    invalidationRate: number,
    layerHealth: Map<string, { invalidations: number; lastInvalidation: number; stability: string }>,
    topReasons: Array<{ reason: string; count: number }>,
  ): string[] {
    const recommendations: string[] = [];

    if (invalidationRate > this.config.criticalThreshold / 5) {
      recommendations.push(
        "CRITICAL: Cache invalidation rate is extremely high. Review static/dynamic boundary placement.",
      );
    } else if (invalidationRate > this.config.warningThreshold / 5) {
      recommendations.push(
        "WARNING: Cache invalidation rate is elevated. Consider moving volatile content to dynamic layers.",
      );
    }

    for (const [layerName, health] of layerHealth) {
      if (health.stability === "critical") {
        recommendations.push(
          `Layer "${layerName}" is critically unstable (${health.invalidations} invalidations). Consider refactoring or moving to dynamic section.`,
        );
      } else if (health.stability === "volatile") {
        recommendations.push(
          `Layer "${layerName}" is volatile (${health.invalidations} invalidations). Monitor closely.`,
        );
      }
    }

    const timestampReasons = topReasons.find((r) => r.reason === "timestamp_or_date_change");
    if (timestampReasons && timestampReasons.count > 3) {
      recommendations.push(
        "Frequent timestamp changes detected. Ensure timestamps are only in dynamic layers, not static prefix.",
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Cache health is good. No immediate action required.");
    }

    return recommendations;
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  reset(): void {
    this.history = [];
    this.layerHashes.clear();
    this.layerInvalidationCounts.clear();
  }

  getHistory(): CacheInvalidationEvent[] {
    return [...this.history];
  }
}

export const promptCacheMonitor = new PromptCacheMonitor();
