import type {
  AgentCapability,
  AgentState,
  CollaborationMode,
  CollaborationResult,
  CoordinatorConfig,
  CoordinatorMetrics,
  HandoffContext,
  ModeComparison,
  SwarmConfig,
  SwarmMetrics,
  Task,
  ValidationRule,
} from './types';

export class SwarmOrchestrator {
  private readonly config: SwarmConfig;
  private agentStates: Map<string, AgentState> = new Map();
  private handoffCount = 0;
  private deadlockCount = 0;
  private oscillations = 0;
  private contextTokenCounts: number[] = [];

  constructor(config: SwarmConfig) {
    this.config = config;
    this.initializeAgents();
  }

  private initializeAgents(): void {
    for (const agentId of this.config.agents) {
      this.agentStates.set(agentId, {
        agentId,
        mode: 'swarm',
        capabilities: [],
        handoffHistory: [],
        status: 'idle',
      });
    }
  }

  async executeTask(task: Task): Promise<CollaborationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let currentAgent = this.selectInitialAgent(task);
    let turns = 0;
    const maxTurns = this.config.maxTurns || 50;

    while (turns < maxTurns) {
      const state = this.agentStates.get(currentAgent);
      if (!state) {
        errors.push(`Agent ${currentAgent} not found`);
        break;
      }

      state.status = 'working';
      state.currentTask = task.id;

      const result = await this.executeAgentTask(currentAgent, task);

      if (result.completed) {
        state.status = 'completed';
        return {
          mode: 'swarm',
          success: true,
          data: result.data,
          metrics: this.getMetrics(),
          duration: Date.now() - startTime,
        };
      }

      if (result.handoff) {
        const previousAgent = currentAgent;
        const handoffContext = result.handoff;

        this.recordHandoff(previousAgent, handoffContext.toAgent, task.id);

        if (this.detectDeadlock(previousAgent, handoffContext.toAgent)) {
          this.deadlockCount++;
          errors.push('Deadlock detected');
          break;
        }

        if (this.detectOscillation(previousAgent, handoffContext.toAgent)) {
          this.oscillations++;
        }

        currentAgent = handoffContext.toAgent;
        state.status = 'waiting';
      }

      turns++;
    }

    return {
      mode: 'swarm',
      success: false,
      errors,
      metrics: this.getMetrics(),
      duration: Date.now() - startTime,
    };
  }

  private selectInitialAgent(task: Task): string {
    if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
      for (const [agentId, state] of this.agentStates) {
        const hasCapability = task.requiredCapabilities.every(cap =>
          state.capabilities.some(ac => ac.name === cap)
        );
        if (hasCapability) {
          return agentId;
        }
      }
    }

    return this.config.agents[0];
  }

  private async executeAgentTask(
    agentId: string,
    task: Task
  ): Promise<{ completed: boolean; data?: unknown; handoff?: HandoffContext }> {
    const state = this.agentStates.get(agentId);
    if (!state) {
      return { completed: false };
    }

    const applicableHandoffs = this.config.handoffs.filter(h => h.from === agentId);

    if (applicableHandoffs.length > 0) {
      const handoff = applicableHandoffs[0];
      return {
        completed: false,
        handoff: {
          fromAgent: agentId,
          toAgent: handoff.to,
          task,
          sharedContext: {},
          history: [],
        },
      };
    }

    return { completed: true, data: { agentId, task } };
  }

  private recordHandoff(from: string, to: string, taskId: string): void {
    const fromState = this.agentStates.get(from);
    const toState = this.agentStates.get(to);

    if (fromState) {
      fromState.handoffHistory.push(to);
    }

    if (toState) {
      toState.handoffHistory.push(from);
    }

    this.handoffCount++;
  }

  private detectDeadlock(from: string, to: string): boolean {
    const fromState = this.agentStates.get(from);
    if (!fromState) return false;

    if (fromState.handoffHistory[fromState.handoffHistory.length - 1] === to) {
      const toState = this.agentStates.get(to);
      if (toState && toState.handoffHistory[toState.handoffHistory.length - 1] === from) {
        return true;
      }
    }

    return false;
  }

  private detectOscillation(from: string, to: string): boolean {
    const fromState = this.agentStates.get(from);
    if (!fromState) return false;

    const recentHandoffs = fromState.handoffHistory.slice(-4);
    if (recentHandoffs.length >= 4) {
      return (
        recentHandoffs[0] === to &&
        recentHandoffs[2] === to
      );
    }

    return false;
  }

  private getMetrics(): SwarmMetrics {
    const avgTokens =
      this.contextTokenCounts.length > 0
        ? this.contextTokenCounts.reduce((a, b) => a + b, 0) / this.contextTokenCounts.length
        : 0;

    return {
      totalHandoffs: this.handoffCount,
      averageContextTokens: avgTokens,
      deadlockCount: this.deadlockCount,
      oscillations: this.oscillations,
    };
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.agentStates.get(agentId);
  }
}

export class CoordinatorOrchestrator {
  private readonly config: CoordinatorConfig;
  private agentStates: Map<string, AgentState> = new Map();
  private phaseDurations: Map<string, number> = new Map();
  private consensus达成率 = 0;
  private iterationCount = 0;
  private validationFailures = 0;

  constructor(config: CoordinatorConfig) {
    this.config = config;
    this.initializeAgents();
  }

  private initializeAgents(): void {
    for (const phase of this.config.phases) {
      for (const participant of phase.participants) {
        if (!this.agentStates.has(participant)) {
          this.agentStates.set(participant, {
            agentId: participant,
            mode: 'coordinator',
            capabilities: [],
            handoffHistory: [],
            status: 'idle',
          });
        }
      }
    }
  }

  async executeTask(task: Task): Promise<CollaborationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let currentPhaseIndex = 0;
    const maxIterations = this.config.maxIterations || 10;

    while (currentPhaseIndex < this.config.phases.length && this.iterationCount < maxIterations) {
      const phase = this.config.phases[currentPhaseIndex];
      const phaseStartTime = Date.now();

      for (const participant of phase.participants) {
        const state = this.agentStates.get(participant);
        if (state) {
          state.status = 'working';
          state.currentTask = task.id;
        }
      }

      const phaseResult = await this.executePhase(phase, task);

      this.phaseDurations.set(phase.name, Date.now() - phaseStartTime);

      if (!phaseResult.success) {
        errors.push(`Phase ${phase.name} failed: ${phaseResult.errors.join(', ')}`);
        this.validationFailures += phaseResult.errors.length;
      }

      if (phase.consensusRequired && !phaseResult.consensusReached) {
        const consensus = this.calculateConsensus(phase.participants);
        this.consensus达成率 = (this.consensus达成率 + consensus) / 2;
      }

      if (phaseResult.completed) {
        for (const participant of phase.participants) {
          const state = this.agentStates.get(participant);
          if (state) {
            state.status = 'completed';
          }
        }
        currentPhaseIndex++;
      }

      this.iterationCount++;
    }

    const success = currentPhaseIndex >= this.config.phases.length;

    return {
      mode: 'coordinator',
      success,
      errors,
      metrics: this.getMetrics(),
      duration: Date.now() - startTime,
    };
  }

  private async executePhase(
    phase: { name: string; type: string; participants: string[]; consensusRequired?: boolean },
    task: Task
  ): Promise<{ success: boolean; completed: boolean; consensusReached?: boolean; errors: string[] }> {
    const errors: string[] = [];
    let completed = false;

    for (const participant of phase.participants) {
      const result = await this.executeParticipantTask(participant, task);
      if (!result.success) {
        errors.push(...result.errors);
      }
      completed = result.completed;
    }

    const consensusReached = phase.consensusRequired
      ? this.calculateConsensus(phase.participants) >= (this.config.consensusThreshold || 0.7)
      : undefined;

    return {
      success: errors.length === 0,
      completed,
      consensusReached,
      errors,
    };
  }

  private async executeParticipantTask(
    agentId: string,
    task: Task
  ): Promise<{ success: boolean; completed: boolean; errors: string[] }> {
    const state = this.agentStates.get(agentId);
    if (!state) {
      return { success: false, completed: false, errors: [`Agent ${agentId} not found`] };
    }

    for (const rule of this.config.validationRules) {
      const result = rule.check(task);
      if (!result.passed && result.errors) {
        return {
          success: false,
          completed: false,
          errors: result.errors.map(e => e.message),
        };
      }
    }

    return { success: true, completed: true, errors: [] };
  }

  private calculateConsensus(participants: string[]): number {
    const completedCount = participants.filter(p => {
      const state = this.agentStates.get(p);
      return state?.status === 'completed';
    }).length;

    return completedCount / participants.length;
  }

  private getMetrics(): CoordinatorMetrics {
    return {
      phaseDurations: new Map(this.phaseDurations),
      consensus达成率: this.consensus达成率,
      iterationCount: this.iterationCount,
      validationFailures: this.validationFailures,
    };
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.agentStates.get(agentId);
  }
}

export function getModeComparison(): ModeComparison[] {
  return [
    {
      mode: 'swarm',
      latency: 'low',
      reliability: 'medium',
      scalability: 'high',
      complexity: 'low',
      suitableFor: [
        'Simple task handoffs',
        'Loosely coupled agents',
        'Rapid prototyping',
        'Independent specialized tasks',
      ],
      unsuitableFor: [
        'Complex dependencies',
        'High reliability requirements',
        'Sequential phase-based workflows',
      ],
    },
    {
      mode: 'coordinator',
      latency: 'medium',
      reliability: 'high',
      scalability: 'medium',
      complexity: 'high',
      suitableFor: [
        'Complex multi-phase workflows',
        'High reliability requirements',
        'Validation-heavy tasks',
        'Sequential processing',
      ],
      unsuitableFor: [
        'Simple independent tasks',
        'Very loose coupling',
        'Low-latency requirements',
      ],
    },
  ];
}

export function selectOptimalMode(
  taskComplexity: 'low' | 'medium' | 'high',
  reliabilityRequirement: 'low' | 'medium' | 'high',
  latencyRequirement: 'low' | 'medium' | 'high'
): CollaborationMode {
  if (latencyRequirement === 'low' && taskComplexity === 'low') {
    return 'swarm';
  }

  if (reliabilityRequirement === 'high' || taskComplexity === 'high') {
    return 'coordinator';
  }

  if (latencyRequirement === 'low' && reliabilityRequirement === 'low') {
    return 'swarm';
  }

  return 'coordinator';
}

export function createSwarmOrchestrator(config: SwarmConfig): SwarmOrchestrator {
  return new SwarmOrchestrator(config);
}

export function createCoordinatorOrchestrator(config: CoordinatorConfig): CoordinatorOrchestrator {
  return new CoordinatorOrchestrator(config);
}