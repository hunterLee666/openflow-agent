export { query } from "./core/query-engine.js";
export { DefaultToolRegistry } from "./tools/registry.js";
export { getDefaultTools } from "./tools/file-tools.js";
export { registerExternalTools } from "./tools/external-tools.js";
export { createAgentTool } from "./tools/agent-tool.js";
export { FileSessionStore } from "./services/session.js";
export { ConsoleTelemetry } from "./services/telemetry.js";
export { loadConfig, saveConfig } from "./services/config.js";
export { McpServer } from "./mcp/server.js";
export { DefaultMemorySystem } from "./memory/index.js";
export {
  ConsolidationManager,
  createConsolidationManager,
  DEFAULT_CONSOLIDATION_POLICY,
  TokenBudgetInjector,
  createTokenBudgetInjector,
  DEFAULT_TOKEN_BUDGET_CONFIG,
  HybridRetriever,
  createHybridRetriever,
  DEFAULT_HYBRID_CONFIG,
  PyramidRetriever,
  createPyramidRetriever,
  DEFAULT_PYRAMID_CONFIG,
  SessionLifecycleManager,
  createSessionLifecycleManager,
  DEFAULT_SESSION_CONFIG,
  KnowledgeGraph,
  createKnowledgeGraph,
  KnowledgeGraphBuilder,
} from "./memory/index.js";
export { DefaultHookRegistry, createBuiltInHooks } from "./hooks/index.js";
export { DefaultCoordinator } from "./coordinator/index.js";
export { DefaultVerificationAgent } from "./verification/index.js";
export { DefaultSystemPromptBuilder } from "./prompts/index.js";
export { DefaultPermissionPipeline } from "./permissions/index.js";
export { SeatbeltExecutor, BubblewrapExecutor, NoSandboxExecutor } from "./sandbox/index.js";
export { GenericLspClient, detectLspForProject } from "./lsp/index.js";
export { DefaultSkillRegistry, parseSkillMarkdown, loadBuiltinSkills } from "./skills/index.js";
export { DefaultCommandRegistry, createBuiltinCommands } from "./commands/index.js";
export { DefaultFeatureFlagRegistry } from "./flags/index.js";
export { JsonRpcBridgeServer, generateBridgeToken } from "./bridge/index.js";
export { createStore, FileMemdir, createHistory, DefaultMigrationManager } from "./state/index.js";
export { DefaultKairosEngine } from "./kairos/index.js";
export { DefaultSubAgentCache, DefaultRecursionGuard, buildForkKey } from "./agent-cache/index.js";
export { DefaultTelemetryCollector, DefaultPerfettoTracer } from "./telemetry/index.js";
export { computeDiff, TerminalDiffRenderer, createDiffRenderer } from "./diff/index.js";
export { DefaultPromptCache } from "./cache/index.js";

export type {
  Message,
  ContentBlock,
  QueryInput,
  QueryContext,
  QueryState,
  StreamEvent,
  QueryResult,
  ToolUseBlock,
  ToolResultBlock,
  UsageCounters,
  AgentConfig,
  SessionStore,
  Telemetry,
  ToolDefinition,
  ToolContext,
  ToolRegistry,
  PermissionMode,
} from "./types/index.js";

export type {
  MemorySystem,
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProjectMemory,
  ConsolidationPolicy,
  ConsolidationResult,
  ConsolidationMetrics,
  MemoryEntry,
  ProvenanceInfo,
  Observation,
  TokenBudgetConfig,
  MemoryPriority,
  ContextBundle,
  ContextSegment,
  TokenEstimate,
  HybridRetrievalConfig,
  RetrievalItem,
  HybridRetrievalResult,
  PyramidConfig,
  RetrievalLevel,
  MemoryUnit,
  MemoryMetadata,
  PyramidRetrievalResult,
  PyramidItem,
  ExpansionRequest,
  SessionStatus,
  Session,
  SessionEvent,
  SessionObservation,
  FinalizationReport,
  DistillationResult as MemoryDistillationResult,
  SessionMetadata as SessionMeta,
  SessionLifecycleConfig,
  SessionHooks,
  KGEntityType,
  KGRelationType,
  KGProperty,
  KGEntity,
  KGRelation,
  KGQueryOptions,
  KGPathResult,
  KGInferenceResult,
  KGGraph,
} from "./memory/types.js";

export type {
  HookRegistry,
  HookEvent,
  HookPayload,
  HookDecision,
  HookMatcher,
  RegisteredHook,
  RiskAssessment,
} from "./hooks/types.js";

export type {
  Coordinator,
  CoordinatorPlan,
  Phase,
  SubAgent,
  SubAgentResult,
  TaskContext,
  AgentRole,
} from "./coordinator/types.js";

export type {
  VerificationAgent,
  VerificationTask,
  VerificationResult,
  VerificationCheck,
  CheckResult,
} from "./verification/types.js";

export type {
  SystemPromptBuilder,
  PromptLayer,
  PromptContext,
} from "./prompts/system-prompt.js";

export type {
  PermissionContext,
  PermissionDecision,
  PermissionRule,
  PermissionPipeline,
  CommandBlacklist,
  GitSafetyRules,
  RiskLevel,
} from "./permissions/types.js";

export type {
  SandboxProfile,
  SandboxExecutor,
  SandboxResult,
  SandboxType,
} from "./sandbox/types.js";

export type {
  LspClient,
  Location,
  Range,
  Position,
  DocumentSymbol,
  SymbolInformation,
  Hover,
  CompletionItem,
  SymbolKind,
  CompletionItemKind,
} from "./lsp/types.js";

export type {
  Skill,
  SkillStep,
  SkillRegistry,
  SkillContext,
  SkillExecutor,
  SkillEvent,
  SkillResult,
} from "./skills/types.js";

export type {
  SlashCommand,
  CommandContext,
  CommandRegistry,
} from "./commands/types.js";

export type {
  FeatureFlag,
  FlagCategory,
  FeatureFlagRegistry,
} from "./flags/types.js";

export type {
  BridgeServer,
  BridgeClient,
  BridgeMessage,
  IdeCapabilities,
  IdeState,
} from "./bridge/types.js";

export type {
  Store,
  Memdir,
  History,
  Migration,
  MigrationManager,
} from "./state/types.js";

export type {
  KairosEngine,
  KairosContext,
  DistillationResult,
  DreamSchedule,
} from "./kairos/types.js";

export type {
  SubAgentCache,
  SubAgentCacheEntry,
  AgentForkKey,
  RecursionGuard,
} from "./agent-cache/types.js";

export type {
  PerfettoTracer,
  TraceSpan,
  TelemetryCollector,
  TelemetryReport,
} from "./telemetry/types.js";

export type {
  DiffBlock,
  DiffResult,
  DiffRenderer,
} from "./diff/types.js";

export type {
  PromptCache,
  CacheEconomics,
} from "./cache/types.js";

export { AnthropicApiClient, createApiClient } from "./services/api/client.js";
export { ApiError, RateLimitError, AuthenticationError, NetworkError, ValidationError, categorizeError } from "./services/api/errors.js";
export type { AnthropicMessage, AnthropicContentBlock, AnthropicTool, AnthropicRequest, AnthropicResponse, AnthropicStreamEvent, ApiClientConfig, StreamHandler, TokenUsage } from "./services/api/types.js";

export { OAuthTokenManager, createOAuthManager, generatePKCEChallenge, buildAuthorizationUrl, generateState } from "./services/auth/oauth.js";
export { MemoryStorage, FileStorage, SecureStorage, createPersistentStorage, createSessionStorage } from "./services/auth/storage.js";
export type { OAuthConfig, TokenResponse, PKCEChallenge, AuthState, TokenManagerConfig } from "./services/auth/types.js";

export { MessageBroker, createMessageBroker } from "./agent/routing/broker.js";
export type { AgentMessage, MessageRoute, Subscription, RouteConfig, MessageBrokerConfig } from "./agent/routing/types.js";

export { SwarmOrchestrator, CoordinatorOrchestrator, getModeComparison, selectOptimalMode, createSwarmOrchestrator, createCoordinatorOrchestrator } from "./agent/swarm/orchestrator.js";
export type { SwarmConfig, CoordinatorConfig, HandoffContext, CollaborationMode, ModeComparison } from "./agent/swarm/types.js";

export { AppState, createAppState, GLOBAL_STATE, createAgentState, createTaskState } from "./state/app-state/store.js";
export type { StateKey, StateChange, StateListener, StateSnapshot, StateMigration } from "./state/app-state/types.js";

export { SideEffectSynchronizer, EffectQueueImpl, createSynchronizer } from "./state/side-effect/sync.js";
export type { SideEffect, EffectHandler, EffectPolicy, SyncConfig, SyncResult } from "./state/side-effect/types.js";

export { PersistenceManager, FileStorageBackend, MemoryStorageBackend, createPersistenceManager, DEFAULT_STRATEGIES } from "./state/persistence/manager.js";
export type { PersistenceStrategy, PersistenceConfig, PersistedEntry, StorageBackend } from "./state/persistence/types.js";

export { CircuitBreaker, ExponentialBackoff, LinearBackoff, FibonacciBackoff, createBackoff, retry, ErrorRecoveryManager, createErrorRecoveryManager } from "./resilience/recovery.js";
export type { CircuitBreakerConfig, RetryConfig, BackoffConfig, FallbackHandler, ErrorRecoveryPolicy } from "./resilience/types.js";

export { BaseTransport, StdioTransport, WebSocketTransport, TcpTransport, createTransport } from "./transport/transport.js";
export type { TransportConfig, TransportMessage, TransportHandler } from "./transport/types.js";

export { BaseIDEClient, VSCodeClient, CursorClient, JetBrainsClient, createIDEClient, detectIDE, createAutoDetectClient } from "./ide/client.js";
export type { IDEClient, IDEConfig, IDEType, OpenFileOptions, TextEditorEvent, Diagnostic, HoverInfo } from "./ide/types.js";

export { UndercoverMode, createUndercoverMode, DEFAULT_UNDERCOVER_CONFIG } from "./modes/undercover.js";
export type { UndercoverConfig, StealthSession, HiddenOperation, MaskedResult } from "./modes/undercover.js";

export { Buddy, createBuddy, BUDDY_SPECIES, BUDDY_ACTIONS } from "./modes/buddy.js";
export type { BuddyConfig, BuddyMood, BuddyAction, BuddyEmotion, BuddyMemory } from "./modes/buddy.js";

export { DeepPlanner, createDeepPlanner, DEFAULT_DEEP_PLAN_CONFIG } from "./modes/deep-planning.js";
export type { DeepPlanConfig, PlanNode, PlanBranch, PlanStep, ExecutionTrace, Reflection, MetaCognition } from "./modes/deep-planning.js";

export { EasterEggManager, createEasterEggManager, easterEggMessages } from "./modes/easter-eggs.js";
export type { EasterEgg, EasterEggTrigger, EasterEggReward, EggCollection, Badge, EggStats } from "./modes/easter-eggs.js";

export { ParallelPrefetcher, PrefetchCache, DependencyGraph, createPrefetcher, createDependencyGraph, DEFAULT_PREFETCH_CONFIG } from "./modes/prefetch.js";
export type { PrefetchConfig, PrefetchRequest, PrefetchResult, CacheEntry, QueueMetrics, PrefetchStrategy, PredictionContext } from "./modes/prefetch.js";
