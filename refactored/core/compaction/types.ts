export type MemoryPriority = "critical" | "high" | "medium" | "low";
export type MemorySource = "episodic" | "semantic" | "working" | "project" | "observation";

export interface TokenBudgetConfig {
  maxTokens: number;
  reservedTokens: number;
  priorityWeights: Record<MemoryPriority, number>;
  enableCompression: boolean;
  compressionRatio: number;
  fallbackToSummary: boolean;
}

export interface ContextSegment {
  id: string;
  content: string;
  tokens: number;
  priority: MemoryPriority;
  importance: number;
  source: MemorySource;
  canExpand: boolean;
  summary?: string;
}

export interface ContextBundle {
  query: string;
  segments: ContextSegment[];
  totalTokens: number;
  maxTokens: number;
  hitRate: number;
  renderedContent: string;
}

export interface TokenEstimate {
  text: string;
  tokens: number;
  charCount: number;
}

export interface BudgetAllocationStats {
  bySource: Record<string, { count: number; tokens: number; percent: number }>;
  byPriority: Record<MemoryPriority, { count: number; tokens: number; percent: number }>;
  totalTokens: number;
  maxTokens: number;
  utilization: number;
}
