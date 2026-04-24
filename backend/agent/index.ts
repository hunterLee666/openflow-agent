export {
  TaskAgent,
  TaskAgentRegistry,
  createTaskAgent,
  getTaskAgentDefaults,
  isAgentActive,
  getActiveAgentCount,
  getTaskAgentTools,
  createExploreTool,
  createPlanTool,
  createVerifyTool,
  FORK_PREFIXES,
  getStandardForkPrefix,
  TASK_AGENT_DEFAULTS,
} from './task-agent.js';

export type {
  TaskAgentType,
  TaskAgentConfig,
  TaskResult,
  ExploreTask,
  PlanTask,
  VerifyTask,
} from './task-agent.js';

export { MessageBroker, createMessageBroker } from './routing/broker.js';
export type {
  AgentMessage,
  MessageRoute,
  Subscription,
  RouteConfig,
  MessageBrokerConfig,
  MessagePriority,
  MessageType,
  MessageEnvelope,
  RoutingInfo,
  DeliveryInfo,
  RetryPolicy,
  AgentConnection,
  QueueMetrics,
  BrokerMetrics,
  MessageHandler,
  SendOptions,
  BatchOptions,
} from './routing/types.js';

export {
  SwarmOrchestrator,
  CoordinatorOrchestrator,
  getModeComparison,
  selectOptimalMode,
  createSwarmOrchestrator,
  createCoordinatorOrchestrator,
} from './swarm/orchestrator.js';

export type {
  SwarmConfig,
  CoordinatorConfig,
  HandoffContext,
  CollaborationMode,
  ModeComparison,
  AgentCapability,
  SwarmMetrics,
  CoordinatorMetrics,
  AgentState,
  Task,
  TaskConstraints,
  HandoffHistoryEntry,
  CoordinationPhase,
  ValidationRule,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  CollaborationResult,
} from './swarm/types.js';

export { DefaultCoordinator } from './coordinator/index.js';
export {
  isCoordinatorMode,
  matchSessionMode,
  getWorkerToolsContext,
  getCoordinatorSystemPrompt,
  createWorkerAgent,
  getSubAgentResult,
  getDefaultWorkerTools,
  INTERNAL_TOOLS,
} from './coordinator/index.js';
export type {
  CoordinatorPlan,
  Phase,
  SubAgent,
  SubAgentResult,
  AgentRole,
  TaskContext,
  Coordinator,
  CoordinatorConfig as CoordinatorModeConfig,
  WorkerAgentConfig,
} from './coordinator/index.js';

export { DefaultSubAgentCache, DefaultRecursionGuard, buildForkKey } from './cache/index.js';
export type {
  SubAgentCache,
  SubAgentCacheEntry,
  AgentForkKey,
  RecursionGuard,
} from './cache/index.js';
