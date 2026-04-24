export interface MemoryEntry {
  id: string;
  type: "working" | "episodic" | "semantic";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TruncationResult {
  content: string;
  lineCount: number;
  byteCount: number;
  wasLineTruncated: boolean;
  wasByteTruncated: boolean;
  truncationWarnings: string[];
}

export interface MemoryLimits {
  maxEntryPointLines: number;
  maxEntryPointBytes: number;
  maxWorkingMemoryBytes: number;
  maxEpisodicMemoryItems: number;
  maxSemanticMemoryItems: number;
  retentionDays: number;
}

export const DEFAULT_MEMORY_LIMITS: MemoryLimits = {
  maxEntryPointLines: 200,
  maxEntryPointBytes: 25_000,
  maxWorkingMemoryBytes: 10 * 1024 * 1024,
  maxEpisodicMemoryItems: 1000,
  maxSemanticMemoryItems: 5000,
  retentionDays: 30,
};

export class MemoryTruncator {
  private limits: MemoryLimits;

  constructor(limits: Partial<MemoryLimits> = {}) {
    this.limits = { ...DEFAULT_MEMORY_LIMITS, ...limits };
  }

  truncateEntrypoint(raw: string): TruncationResult {
    const trimmed = raw.trim();
    const contentLines = trimmed.split("\n");
    const lineCount = contentLines.length;
    const byteCount = trimmed.length;

    const wasLineTruncated = lineCount > this.limits.maxEntryPointLines;
    const wasByteTruncated = byteCount > this.limits.maxEntryPointBytes;

    const truncationWarnings: string[] = [];

    if (wasLineTruncated) {
      truncationWarnings.push(`Line limit exceeded: ${lineCount} > ${this.limits.maxEntryPointLines}`);
    }

    if (wasByteTruncated) {
      truncationWarnings.push(`Byte limit exceeded: ${byteCount} > ${this.limits.maxEntryPointBytes}`);
    }

    if (!wasLineTruncated && !wasByteTruncated) {
      return {
        content: trimmed,
        lineCount,
        byteCount,
        wasLineTruncated: false,
        wasByteTruncated: false,
        truncationWarnings: [],
      };
    }

    let truncated = trimmed;

    if (wasLineTruncated) {
      truncated = contentLines.slice(0, this.limits.maxEntryPointLines).join("\n");
    }

    if (wasByteTruncated) {
      const byteTruncationIndex = this.findByteTruncationIndex(truncated, this.limits.maxEntryPointBytes);
      truncated = truncated.slice(0, byteTruncationIndex);

      const lastNewlineIndex = truncated.lastIndexOf("\n");
      if (lastNewlineIndex > this.limits.maxEntryPointBytes * 0.9) {
        truncated = truncated.slice(0, lastNewlineIndex);
      }
    }

    const warnings: string[] = [];
    if (wasLineTruncated) warnings.push("line limit");
    if (wasByteTruncated) warnings.push("byte limit");
    const truncationNotice = `\n\n[Content truncated due to ${warnings.join(" and ")} limits]`;

    return {
      content: truncated + truncationNotice,
      lineCount: truncated.split("\n").length,
      byteCount: truncated.length,
      wasLineTruncated,
      wasByteTruncated,
      truncationWarnings,
    };
  }

  private findByteTruncationIndex(str: string, maxBytes: number): number {
    if (str.length <= maxBytes) {
      return str.length;
    }

    let low = 0;
    let high = str.length;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const sliced = str.slice(0, mid);

      if (new Blob([sliced]).size <= maxBytes) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low;
  }

  truncateWorkingMemory(memory: MemoryEntry[]): MemoryEntry[] {
    let totalBytes = 0;
    const result: MemoryEntry[] = [];

    for (const entry of memory) {
      const entryBytes = new Blob([entry.content]).size;

      if (totalBytes + entryBytes > this.limits.maxWorkingMemoryBytes) {
        break;
      }

      result.push(entry);
      totalBytes += entryBytes;
    }

    return result;
  }

  filterExpiredEntries(memory: MemoryEntry[]): MemoryEntry[] {
    const cutoffTime = Date.now() - this.limits.retentionDays * 24 * 60 * 60 * 1000;

    return memory.filter(entry => entry.timestamp > cutoffTime);
  }

  enforceEpisodicLimit(memory: MemoryEntry[]): { kept: MemoryEntry[]; removed: number } {
    if (memory.length <= this.limits.maxEpisodicMemoryItems) {
      return { kept: memory, removed: 0 };
    }

    const sorted = [...memory].sort((a, b) => b.timestamp - a.timestamp);
    const kept = sorted.slice(0, this.limits.maxEpisodicMemoryItems);

    return {
      kept,
      removed: memory.length - this.limits.maxEpisodicMemoryItems,
    };
  }

  getMemoryStats(memory: MemoryEntry[]): {
    totalItems: number;
    byType: Record<string, number>;
    totalBytes: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    const byType: Record<string, number> = {};
    let totalBytes = 0;
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const entry of memory) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      totalBytes += new Blob([entry.content]).size;

      if (entry.timestamp) {
        if (!oldestTimestamp || entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
        }
        if (!newestTimestamp || entry.timestamp > newestTimestamp) {
          newestTimestamp = entry.timestamp;
        }
      }
    }

    return {
      totalItems: memory.length,
      byType,
      totalBytes,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  suggestTruncation(memory: MemoryEntry[]): {
    shouldTruncate: boolean;
    reason: string;
    suggestedMaxAge?: number;
    suggestedMaxItems?: number;
  } {
    const stats = this.getMemoryStats(memory);

    if (stats.totalBytes > this.limits.maxWorkingMemoryBytes) {
      const ratio = stats.totalBytes / this.limits.maxWorkingMemoryBytes;
      return {
        shouldTruncate: true,
        reason: `Memory size ${stats.totalBytes} exceeds limit ${this.limits.maxWorkingMemoryBytes} by ${(ratio - 1) * 100}%`,
        suggestedMaxAge: Math.floor(this.limits.retentionDays * 0.5),
      };
    }

    if (memory.filter(e => e.type === "episodic").length > this.limits.maxEpisodicMemoryItems) {
      return {
        shouldTruncate: true,
        reason: `Episodic memory items ${memory.filter(e => e.type === "episodic").length} exceeds limit ${this.limits.maxEpisodicMemoryItems}`,
        suggestedMaxItems: Math.floor(this.limits.maxEpisodicMemoryItems * 0.8),
      };
    }

    return {
      shouldTruncate: false,
      reason: "Memory is within limits",
    };
  }
}

export function createDefaultTruncator(): MemoryTruncator {
  return new MemoryTruncator();
}