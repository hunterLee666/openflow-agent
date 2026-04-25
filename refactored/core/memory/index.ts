export { EnhancedMemoryCore, createEnhancedMemoryCore } from "./enhanced-memory-core.js";
export type { EnhancedMemoryConfig, MemoryAddResult, MemorySearchResult, SkillDocument, MemoryNudgeConfig, TaskResult } from "./enhanced-memory-core.js";

export { ProceduralMemory } from "./procedural-memory.js";
export type { ProceduralMemoryEntry, ProceduralStep, SkillExecutionRecord } from "./procedural-memory.js";

export { SemanticCompressor, createSemanticCompressor } from "./semantic-compressor.js";
export type { DialogueTurn, DialogueWindow, MemoryUnit, CompressionConfig } from "./semantic-compressor.js";

export { TripleIndex, VectorIndex, BM25Index, MetadataIndex, createTripleIndex } from "./triple-index.js";
export type { VectorIndexEntry, BM25IndexEntry, MetadataFilter, SearchResult, VectorStorageBackend, VectorIndexConfig } from "./triple-index.js";

export { SemanticSynthesizer, createSemanticSynthesizer } from "./semantic-synthesizer.js";
export type { SynthesisConfig } from "./semantic-synthesizer.js";

export { QueryPlanner, createQueryPlanner } from "./query-planner.js";
export type { QueryComplexity, RetrievalPlan, QueryAnalysis, RetrievalConfig } from "./query-planner.js";

export { SessionManager, createSessionManager } from "./session-manager.js";
export type { SessionEvent, SessionObservation, SessionRecord, ContextBundle, SessionReport, SessionManagerConfig } from "./session-manager.js";

export { SQLiteStorage, createSQLiteStorage } from "./sqlite-storage.js";

export { HNSWVectorIndex, createHNSWVectorIndex } from "./hnsw-vector-index.js";
export type { HNSWConfig, HNSWEntry, HNSWSearchResult, HNSWMetric, HNSWStats } from "./hnsw-vector-index.js";

export { KnowledgeGraph, createKnowledgeGraph } from "./knowledge-graph.js";
export type {
  GraphEntity,
  GraphRelation,
  GraphQuery,
  GraphSearchResult,
  KnowledgeGraphStats,
  EntityType,
  RelationType,
} from "./knowledge-graph.js";

export { ConfidenceScorer, createConfidenceScorer } from "./confidence-scorer.js";
export type {
  ConfidenceConfig,
  ConfidenceScore,
  ConfidenceFeedback,
} from "./confidence-scorer.js";

export { ConsolidationScheduler, createConsolidationScheduler } from "./consolidation-scheduler.js";
export type {
  ConsolidationConfig,
  ConsolidationStats,
  ConsolidationResult,
} from "./consolidation-scheduler.js";

export { TokenOptimizer, createTokenOptimizer } from "./token-optimizer.js";
export type { TokenCount, CompressionStats, TokenBudget, OptimizedMemory, TokenOptimizerConfig } from "./token-optimizer.js";

export { IntentRecognizer, createIntentRecognizer } from "./intent-recognizer.js";
export type {
  IntentRecognitionResult,
  IntentType,
  SubIntent,
  SafetyLevel,
  SafetyFlag,
  IntentMetadata,
  Entity,
  EntityType,
  TimeReference,
  OutputType,
  IntentComplexity,
  SentimentType,
  ConversationContext,
  GoalEntry,
  ConversationMessage,
  IntentRecognitionConfig,
} from "./intent-recognizer.js";

export { GoalTracker, createGoalTracker } from "./goal-tracker.js";
export type { GoalTrackerConfig, GoalUpdateResult } from "./goal-tracker.js";

export { SafetyChecker, createSafetyChecker } from "./safety-checker.js";
export type { SafetyCheckResult, SafetyPolicy } from "./safety-checker.js";
