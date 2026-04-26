export { SubAgentSystem, BUILTIN_AGENT_TYPES, TOOL_GROUPS } from "./sub-agent-system.js";
export type {
  SubAgentContext,
  SubAgentMessage,
  SubAgentToolCall,
  SubAgentTask,
  SubAgentResult,
  SubAgentConfig,
  SubAgentStatus,
} from "./sub-agent-system.js";

export { SwarmMode } from "./swarm-mode.js";
export type {
  SwarmConfig,
  SwarmContext,
} from "./swarm-mode.js";
export type { SwarmAgent } from "./agent-types.js";

export { CoordinatorMode } from "./coordinator-mode.js";
export type {
  WorkerAgent,
  CoordinatorConfig,
  TaskDecomposition,
} from "./coordinator-mode.js";

export { ModeSelector } from "./mode-selector.js";
export type {
  AgentMode,
  ModeSelectorConfig,
  TaskComplexity,
  TaskComplexityFactors,
} from "./mode-selector.js";

export { ExploreAgent, createExploreAgent } from "./explore-agent.js";
export type {
  ExploreAgentConfig,
  ExploreResult,
  ExploreSymbol,
} from "./explore-agent.js";

export { PlanAgent, createPlanAgent } from "./plan-agent.js";
export type {
  PlanAgentConfig,
  PlanPhase,
  PlanResult,
} from "./plan-agent.js";

export { VerificationAgent, createVerificationAgent, VerificationVerdict } from "./verification-agent.js";
export type {
  VerificationAgentConfig,
  VerificationCheck,
  AdversarialProbe,
  VerificationResult,
} from "./verification-agent.js";

export { AntiRecursionGuard, createAntiRecursionGuard } from "./anti-recursion.js";
export type {
  AntiRecursionConfig,
  RecursionViolation,
  DepthTracker,
} from "./anti-recursion.js";

export { ForkPrefixOptimizer, createForkPrefixOptimizer } from "./fork-prefix.js";
export type {
  ForkPrefixConfig,
} from "./fork-prefix.js";

export { MessageRouter, createMessageRouter } from "./message-router.js";
export type {
  StructuredMessage,
  MessageRouteConfig,
} from "./message-router.js";

export { WorkerConsciousnessInjector, createWorkerConsciousness } from "./worker-consciousness.js";
export type {
  WorkerConsciousnessConfig,
} from "./worker-consciousness.js";
