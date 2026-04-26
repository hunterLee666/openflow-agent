import { z } from "zod";

export const ForkPrefixConfigSchema = z.object({
  prefix: z.string(),
  enableCompletionPrefix: z.boolean(),
  completionPrefix: z.string(),
});

export type ForkPrefixConfig = z.infer<typeof ForkPrefixConfigSchema>;

const DEFAULT_CONFIG: ForkPrefixConfig = {
  prefix: "Fork started — processing in background",
  enableCompletionPrefix: true,
  completionPrefix: "Summary —",
};

export class ForkPrefixOptimizer {
  private config: ForkPrefixConfig;
  private prefixCache: Map<string, number> = new Map();

  constructor(config?: Partial<ForkPrefixConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  formatDescription(taskDescription: string): string {
    return `${this.config.prefix}: ${taskDescription}`;
  }

  formatPrompt(taskDescription: string, body: string): string {
    return `${this.config.prefix}: ${taskDescription}\n\n${body}`;
  }

  formatCompletion(summary: string): string {
    if (!this.config.enableCompletionPrefix) {
      return summary;
    }
    return `${this.config.completionPrefix} ${summary}`;
  }

  trackPrefix(description: string): void {
    const hasPrefix = description.startsWith(this.config.prefix);
    if (hasPrefix) {
      const count = this.prefixCache.get(this.config.prefix) || 0;
      this.prefixCache.set(this.config.prefix, count + 1);
    }
  }

  getHitRate(): number {
    const total = this.getTotalTasks();
    if (total === 0) return 0;
    const withPrefix = this.prefixCache.get(this.config.prefix) || 0;
    return withPrefix / total;
  }

  getTotalTasks(): number {
    let total = 0;
    for (const count of this.prefixCache.values()) {
      total += count;
    }
    return total;
  }

  getStats(): { prefix: string; count: number; hitRate: number } {
    const count = this.prefixCache.get(this.config.prefix) || 0;
    const total = this.getTotalTasks();
    return {
      prefix: this.config.prefix,
      count,
      hitRate: total > 0 ? count / total : 0,
    };
  }

  reset(): void {
    this.prefixCache.clear();
  }

  getPrefix(): string {
    return this.config.prefix;
  }

  getCompletionPrefix(): string {
    return this.config.completionPrefix;
  }
}

export function createForkPrefixOptimizer(config?: Partial<ForkPrefixConfig>): ForkPrefixOptimizer {
  return new ForkPrefixOptimizer(config);
}
