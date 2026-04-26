import { z } from "zod";

export const MemoryPrioritySchema = z.enum(["critical", "high", "medium", "low"]);

export type MemoryPriority = z.infer<typeof MemoryPrioritySchema>;

export const MemorySourceSchema = z.enum(["episodic", "semantic", "working", "project", "observation"]);

export type MemorySource = z.infer<typeof MemorySourceSchema>;

export const TokenBudgetConfigSchema = z.object({
  maxTokens: z.number(),
  reservedTokens: z.number(),
  priorityWeights: z.record(MemoryPrioritySchema, z.number()),
  enableCompression: z.boolean(),
  compressionRatio: z.number(),
  fallbackToSummary: z.boolean(),
});

export type TokenBudgetConfig = z.infer<typeof TokenBudgetConfigSchema>;

export const ContextSegmentSchema = z.object({
  id: z.string(),
  content: z.string(),
  tokens: z.number(),
  priority: MemoryPrioritySchema,
  importance: z.number(),
  source: MemorySourceSchema,
  canExpand: z.boolean(),
  summary: z.string().optional(),
});

export type ContextSegment = z.infer<typeof ContextSegmentSchema>;

export const ContextBundleSchema = z.object({
  query: z.string(),
  segments: z.array(ContextSegmentSchema),
  totalTokens: z.number(),
  maxTokens: z.number(),
  hitRate: z.number(),
  renderedContent: z.string(),
});

export type ContextBundle = z.infer<typeof ContextBundleSchema>;

export const TokenEstimateSchema = z.object({
  text: z.string(),
  tokens: z.number(),
  charCount: z.number(),
});

export type TokenEstimate = z.infer<typeof TokenEstimateSchema>;

export const BudgetAllocationStatsSchema = z.object({
  bySource: z.record(z.object({
    count: z.number(),
    tokens: z.number(),
    percent: z.number(),
  })),
  byPriority: z.record(MemoryPrioritySchema, z.object({
    count: z.number(),
    tokens: z.number(),
    percent: z.number(),
  })),
  totalTokens: z.number(),
  maxTokens: z.number(),
  utilization: z.number(),
});

export type BudgetAllocationStats = z.infer<typeof BudgetAllocationStatsSchema>;
