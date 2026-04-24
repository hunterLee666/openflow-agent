export type CollaborationMode = 'swarm' | 'coordinator';

export interface AgentCapability {
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  weight?: number;
}

export interface SwarmConfig {
  enabled: boolean;
  agents: string[];
  handoffs: HandoffRule[];
  contextWindow?: number;
  maxTurns?: number;
}

export interface HandoffRule {
  from: string;
  to: string;
  condition: string;
  priority?: number;
}

export interface CoordinatorConfig {
  enabled: boolean;
  coordinatorId: string;
  phases: CoordinationPhase[];
  validationRules: ValidationRule[];
  consensusThreshold?: number;
  maxIterations?: number;
}

export interface CoordinationPhase {
  name: string;
  type: 'explore' | 'plan' | 'execute' | 'verify';
  participants: string[];
  timeout?: number;
  consensusRequired?: boolean;
}

export interface ValidationRule {
  name: string;
  type: 'syntax' | 'semantic' | 'security' | 'business';
  severity: 'error' | 'warning' | 'info';
  check: (input: unknown) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  location?: { line: number; column: number };
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

export interface SwarmMetrics {
  totalHandoffs: number;
  averageContextTokens: number;
  deadlockCount: number;
  oscillations: number;
}

export interface CoordinatorMetrics {
  phaseDurations: Map<string, number>;
  consensus达成率: number;
  iterationCount: number;
  validationFailures: number;
}

export interface ModeComparison {
  mode: CollaborationMode;
  latency: 'low' | 'medium' | 'high';
  reliability: 'low' | 'medium' | 'high';
  scalability: 'low' | 'medium' | 'high';
  complexity: 'low' | 'medium' | 'high';
  suitableFor: string[];
  unsuitableFor: string[];
}

export interface CollaborationResult<T = unknown> {
  mode: CollaborationMode;
  success: boolean;
  data?: T;
  errors?: string[];
  metrics: SwarmMetrics | CoordinatorMetrics;
  duration: number;
}

export interface AgentState {
  agentId: string;
  mode: CollaborationMode;
  currentTask?: string;
  capabilities: AgentCapability[];
  handoffHistory: string[];
  status: 'idle' | 'working' | 'waiting' | 'completed' | 'failed';
}

export interface Task {
  id: string;
  type: string;
  description: string;
  priority?: number;
  constraints?: TaskConstraints;
  requiredCapabilities?: string[];
  parentTaskId?: string;
}

export interface TaskConstraints {
  maxTokens?: number;
  timeout?: number;
  retries?: number;
  dependencies?: string[];
}

export interface HandoffContext {
  fromAgent: string;
  toAgent: string;
  task: Task;
  sharedContext: Record<string, unknown>;
  history: HandoffHistoryEntry[];
}

export interface HandoffHistoryEntry {
  timestamp: Date;
  fromAgent: string;
  toAgent: string;
  taskId: string;
  success: boolean;
  notes?: string;
}