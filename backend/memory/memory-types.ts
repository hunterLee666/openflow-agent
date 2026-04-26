import { z } from "zod";

export const MemoryEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  importance: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  sessionId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemoryQuerySchema = z.object({
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minImportance: z.number().optional(),
  sessionId: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

export const IntentTypeSchema = z.enum([
  "code_generation",
  "code_review",
  "debugging",
  "refactoring",
  "exploration",
  "documentation",
  "deployment",
  "testing",
  "configuration",
  "memory_query",
  "memory_write",
  "task_planning",
  "conversation",
  "file_operation",
  "system_operation",
  "custom",
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

export const SafetyLevelSchema = z.enum(["safe", "caution", "dangerous", "blocked"]);

export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export const SafetyFlagSchema = z.enum([
  "none",
  "destructive_operation",
  "sensitive_data_access",
  "external_communication",
  "privilege_escalation",
  "mass_deletion",
  "system_modification",
  "credential_manipulation",
]);

export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;

export const EntityTypeSchema = z.enum([
  "file",
  "directory",
  "function",
  "class",
  "variable",
  "project",
  "tool",
  "person",
  "concept",
  "url",
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const OutputTypeSchema = z.enum([
  "code",
  "text",
  "file",
  "command",
  "analysis",
  "summary",
  "list",
  "none",
]);

export type OutputType = z.infer<typeof OutputTypeSchema>;

export const IntentComplexitySchema = z.enum([
  "simple",
  "moderate",
  "complex",
  "multi_step",
]);

export type IntentComplexity = z.infer<typeof IntentComplexitySchema>;

export const SentimentTypeSchema = z.enum([
  "neutral",
  "urgent",
  "frustrated",
  "exploratory",
  "confirming",
]);

export type SentimentType = z.infer<typeof SentimentTypeSchema>;

export const EntitySchema = z.object({
  name: z.string(),
  type: EntityTypeSchema,
  confidence: z.number(),
});

export type Entity = z.infer<typeof EntitySchema>;

export const TimeReferenceSchema = z.object({
  expression: z.string(),
  resolved: z.string().optional(),
  type: z.enum(["absolute", "relative"]),
});

export type TimeReference = z.infer<typeof TimeReferenceSchema>;

export const IntentMetadataSchema = z.object({
  entities: z.array(EntitySchema),
  timeReferences: z.array(TimeReferenceSchema),
  contextRequirements: z.array(z.string()),
  expectedOutputType: OutputTypeSchema,
  complexity: IntentComplexitySchema,
  language: z.string(),
  sentiment: SentimentTypeSchema,
});

export type IntentMetadata = z.infer<typeof IntentMetadataSchema>;

export const SubIntentSchema = z.object({
  type: z.string(),
  confidence: z.number(),
  description: z.string(),
});

export type SubIntent = z.infer<typeof SubIntentSchema>;

export const ToolGapSchema = z.object({
  missingTool: z.string(),
  purpose: z.string(),
  alternative: z.string(),
  searchQuery: z.string(),
});

export type ToolGap = z.infer<typeof ToolGapSchema>;

export const WorkflowStepSchema = z.object({
  order: z.number(),
  action: z.string(),
  tool: z.string(),
  description: z.string(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowPlanSchema = z.object({
  recommendedWorkflow: z.string(),
  recommendedTools: z.array(z.string()),
  toolGapAnalysis: z.array(ToolGapSchema),
  needsWebSearch: z.boolean(),
  webSearchQueries: z.array(z.string()),
  steps: z.array(WorkflowStepSchema),
  reasoning: z.string(),
});

export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;

export const TaskNormsSchema = z.object({
  mustDo: z.array(z.string()),
  mustNotDo: z.array(z.string()),
  bestPractices: z.array(z.string()),
  isExploratory: z.boolean(),
});

export type TaskNorms = z.infer<typeof TaskNormsSchema>;

export const IntentRecognitionResultSchema = z.object({
  primaryIntent: IntentTypeSchema,
  confidence: z.number(),
  subIntents: z.array(SubIntentSchema),
  goalDescription: z.string(),
  safetyLevel: SafetyLevelSchema,
  safetyFlags: z.array(SafetyFlagSchema),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().optional(),
  metadata: IntentMetadataSchema,
  workflowPlan: WorkflowPlanSchema.optional(),
  taskNorms: TaskNormsSchema.optional(),
});

export type IntentRecognitionResult = z.infer<typeof IntentRecognitionResultSchema>;

export const GoalEntrySchema = z.object({
  goal: z.string(),
  timestamp: z.number(),
  confidence: z.number(),
  isActive: z.boolean(),
});

export type GoalEntry = z.infer<typeof GoalEntrySchema>;

export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.number(),
});

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationContextSchema = z.object({
  sessionId: z.string(),
  currentGoal: z.string(),
  goalHistory: z.array(GoalEntrySchema),
  recentMessages: z.array(ConversationMessageSchema),
  turnCount: z.number(),
  lastIntent: IntentRecognitionResultSchema.optional(),
});

export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const IntentRecognitionConfigSchema = z.object({
  enableLLM: z.boolean(),
  enableSafetyCheck: z.boolean(),
  enableGoalTracking: z.boolean(),
  enableWorkflowPlanning: z.boolean(),
  enableEnvironmentContext: z.boolean(),
  goalPersistenceWeight: z.number(),
  maxGoalHistory: z.number(),
  safetyThreshold: SafetyLevelSchema,
  language: z.string(),
});

export type IntentRecognitionConfig = z.infer<typeof IntentRecognitionConfigSchema>;

export const EnhancedMemoryConfigSchema = z.object({
  memoryDir: z.string(),
  enableVectorSearch: z.boolean(),
  vectorDimensions: z.number(),
  vectorBackend: z.enum(["memory", "hnsw"]),
  enableSemanticCompression: z.boolean(),
  enableTokenOptimization: z.boolean(),
  maxContextTokens: z.number(),
  maxMemoryTokens: z.number(),
  nudgeInterval: z.number(),
  enableKnowledgeGraph: z.boolean(),
  enableConfidenceScoring: z.boolean(),
  enableConsolidationScheduler: z.boolean(),
  consolidationIntervalMs: z.number(),
});

export type EnhancedMemoryConfig = z.infer<typeof EnhancedMemoryConfigSchema>;

export const MemoryAddResultSchema = z.object({
  id: z.string(),
  tokenCount: z.number(),
  compressionStats: z.object({
    originalTokens: z.number(),
    compressedTokens: z.number(),
    compressionRatio: z.number(),
  }).optional(),
});

export type MemoryAddResult = z.infer<typeof MemoryAddResultSchema>;

export const MemorySearchResultSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    content: z.string(),
    score: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })),
  tokenBudget: z.object({
    used: z.number(),
    max: z.number(),
    remaining: z.number(),
  }),
  retrievalPlan: z.object({
    strategy: z.string(),
    steps: z.array(z.string()),
  }),
});

export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

export const SkillDocumentSchema = z.object({
  frontmatter: z.object({
    name: z.string(),
    description: z.string(),
    triggers: z.array(z.string()),
    allowedTools: z.array(z.string()),
    version: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    usageCount: z.number(),
  }),
  overview: z.string(),
  body: z.string(),
  references: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })),
});

export type SkillDocument = z.infer<typeof SkillDocumentSchema>;

export const TaskResultSchema = z.object({
  goal: z.string(),
  success: z.boolean(),
  trace: z.record(z.string(), z.unknown()),
  feedback: z.string().optional(),
  timestamp: z.string().optional(),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

export const MemoryNudgeConfigSchema = z.object({
  interval: z.number(),
  threshold: z.number(),
  maxItemsPerNudge: z.number(),
});

export type MemoryNudgeConfig = z.infer<typeof MemoryNudgeConfigSchema>;
