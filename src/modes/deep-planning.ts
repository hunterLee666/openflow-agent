export interface DeepPlanConfig {
  maxDepth: number;
  maxBranches: number;
  maxIterations: number;
  explorationRatio: number;
  exploitationRatio: number;
  enableReflection: boolean;
  enableSelfCorrection: boolean;
  enableMetaCognition: boolean;
  confidenceThreshold: number;
  timeLimit?: number;
}

export interface PlanNode {
  id: string;
  description: string;
  parentId: string | null;
  children: string[];
  depth: number;
  score: number;
  confidence: number;
  status: 'pending' | 'explored' | 'expanded' | 'pruned' | 'executed';
  metadata: Record<string, unknown>;
  createdAt: number;
  visitedAt?: number;
  executedAt?: number;
}

export interface PlanBranch {
  id: string;
  nodes: PlanNode[];
  totalScore: number;
  confidence: number;
  isViable: boolean;
  prunedReason?: string;
}

export interface PlanStep {
  order: number;
  nodeId: string;
  action: string;
  expectedOutcome: string;
  actualOutcome?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'failed' | 'skipped';
}

export interface ExecutionTrace {
  planId: string;
  steps: PlanStep[];
  startTime: number;
  endTime?: number;
  totalIterations: number;
  nodesExplored: number;
  branchesPruned: number;
  finalScore: number;
  success: boolean;
  failureReason?: string;
}

export interface Reflection {
  type: 'progress' | 'mistake' | 'opportunity' | 'strategy';
  content: string;
  confidence: number;
  suggestions: string[];
  timestamp: number;
}

export interface MetaCognition {
  currentStrategy: string;
  effectivenessScore: number;
  adjustmentNeeded: boolean;
  adjustmentReason?: string;
  history: string[];
}

export class DeepPlanner {
  private config: DeepPlanConfig;
  private rootNode: PlanNode | null = null;
  private nodes: Map<string, PlanNode> = new Map();
  private branches: PlanBranch[] = [];
  private currentBranchIndex: number = 0;
  private iterations: number = 0;
  private executionTrace: ExecutionTrace | null = null;
  private reflections: Reflection[] = [];
  private metaCognition: MetaCognition | null = null;

  constructor(config: Partial<DeepPlanConfig> = {}) {
    this.config = {
      maxDepth: config.maxDepth ?? 10,
      maxBranches: config.maxBranches ?? 5,
      maxIterations: config.maxIterations ?? 100,
      explorationRatio: config.explorationRatio ?? 0.3,
      exploitationRatio: config.exploitationRatio ?? 0.7,
      enableReflection: config.enableReflection ?? true,
      enableSelfCorrection: config.enableSelfCorrection ?? true,
      enableMetaCognition: config.enableMetaCognition ?? true,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      timeLimit: config.timeLimit,
    };
  }

  initialize(goal: string, initialContext?: Record<string, unknown>): void {
    this.rootNode = this.createNode({
      id: this.generateNodeId(),
      description: goal,
      parentId: null,
      depth: 0,
      score: 1.0,
      confidence: 1.0,
      status: 'pending',
      metadata: initialContext || {},
    });

    this.nodes.clear();
    if (this.rootNode) {
      this.nodes.set(this.rootNode.id, this.rootNode);
    }

    this.branches = [{
      id: this.generateBranchId(),
      nodes: this.rootNode ? [this.rootNode] : [],
      totalScore: 1.0,
      confidence: 1.0,
      isViable: true,
    }];

    this.currentBranchIndex = 0;
    this.iterations = 0;
    this.executionTrace = {
      planId: this.generatePlanId(),
      steps: [],
      startTime: Date.now(),
      totalIterations: 0,
      nodesExplored: 0,
      branchesPruned: 0,
      finalScore: 0,
      success: false,
    };
    this.reflections = [];
    this.metaCognition = {
      currentStrategy: 'initial',
      effectivenessScore: 0.5,
      adjustmentNeeded: false,
      history: ['initialized'],
    };
  }

  async plan(goal: string, generateSubgoals: (node: PlanNode) => Promise<PlanNode[]>): Promise<PlanBranch | null> {
    this.initialize(goal);

    while (this.iterations < this.config.maxIterations) {
      if (this.config.timeLimit && Date.now() - this.executionTrace!.startTime > this.config.timeLimit) {
        this.reflections.push({
          type: 'opportunity',
          content: 'Time limit reached',
          confidence: 1.0,
          suggestions: ['Consider reducing planning depth'],
          timestamp: Date.now(),
        });
        break;
      }

      const shouldExplore = Math.random() < this.config.explorationRatio;
      const currentNode = this.selectNode(shouldExplore);

      if (!currentNode) {
        break;
      }

      this.iterations++;
      this.executionTrace!.totalIterations++;

      if (currentNode.depth >= this.config.maxDepth) {
        this.pruneNode(currentNode.id, 'max_depth_reached');
        continue;
      }

      const subgoals = await generateSubgoals(currentNode);

      if (subgoals.length === 0) {
        currentNode.status = 'expanded';
        this.executionTrace!.nodesExplored++;
        continue;
      }

      for (const subgoal of subgoals.slice(0, this.config.maxBranches)) {
        const childNode = this.createNode({
          ...subgoal,
          parentId: currentNode.id,
          depth: currentNode.depth + 1,
        });

        if (childNode) {
          currentNode.children.push(childNode.id);
          this.nodes.set(childNode.id, childNode);
          this.updateBranchScores(childNode);
        }
      }

      currentNode.status = 'expanded';
      this.executionTrace!.nodesExplored++;

      if (this.config.enableReflection) {
        this.performReflection();
      }

      if (this.config.enableMetaCognition) {
        this.updateMetaCognition();
      }
    }

    return this.selectBestBranch();
  }

  async execute(plan: PlanBranch, executor: (node: PlanNode) => Promise<boolean>): Promise<ExecutionTrace> {
    if (!this.executionTrace) {
      throw new Error('No active plan. Call plan() first.');
    }

    const stepOrder = this.buildExecutionOrder(plan);

    for (let i = 0; i < stepOrder.length; i++) {
      const node = this.nodes.get(stepOrder[i]);
      if (!node) continue;

      const step: PlanStep = {
        order: i + 1,
        nodeId: node.id,
        action: node.description,
        expectedOutcome: node.metadata.expectedOutcome as string || 'success',
        status: 'in_progress',
      };

      this.executionTrace.steps.push(step);

      try {
        const success = await executor(node);
        step.status = success ? 'completed' : 'failed';
        step.actualOutcome = success ? 'executed' : 'failed';
        node.status = success ? 'executed' : 'pruned';
        node.executedAt = Date.now();

        if (!success && this.config.enableSelfCorrection) {
          await this.selfCorrect(node, step);
        }
      } catch (error) {
        step.status = 'failed';
        step.actualOutcome = error instanceof Error ? error.message : 'unknown error';
        node.status = 'pruned';
      }

      if (step.status === 'failed') {
        this.executionTrace.failureReason = `Step ${i + 1} failed: ${step.actualOutcome}`;
        break;
      }
    }

    this.executionTrace.endTime = Date.now();
    this.executionTrace.success = this.executionTrace.steps.every(s => s.status === 'completed');
    this.executionTrace.finalScore = this.calculateFinalScore();
    return this.executionTrace;
  }

  private async selfCorrect(failedNode: PlanNode, failedStep: PlanStep): Promise<void> {
    this.reflections.push({
      type: 'mistake',
      content: `Failed at: ${failedNode.description}`,
      confidence: 0.9,
      suggestions: [
        'Consider alternative approach',
        'Break down into smaller steps',
        'Request more context',
      ],
      timestamp: Date.now(),
    });

    const alternatives = this.findAlternativePaths(failedNode);

    if (alternatives.length > 0) {
      const altNode = alternatives[0];
      const recoveryStep: PlanStep = {
        order: this.executionTrace!.steps.length + 1,
        nodeId: altNode.id,
        action: `Recovery: ${altNode.description}`,
        expectedOutcome: altNode.metadata.expectedOutcome as string || 'success',
        status: 'planned',
      };
      this.executionTrace!.steps.push(recoveryStep);
    }
  }

  private findAlternativePaths(node: PlanNode): PlanNode[] {
    const alternatives: PlanNode[] = [];

    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        for (const childId of parent.children) {
          if (childId !== node.id) {
            const sibling = this.nodes.get(childId);
            if (sibling && sibling.status === 'pending') {
              alternatives.push(sibling);
            }
          }
        }
      }
    }

    const ancestor = this.findViableAncestor(node);
    if (ancestor) {
      for (const childId of ancestor.children) {
        const child = this.nodes.get(childId);
        if (child && child.status === 'pending') {
          alternatives.push(child);
        }
      }
    }

    return alternatives.slice(0, 3);
  }

  private findViableAncestor(node: PlanNode): PlanNode | null {
    let current = node.parentId ? this.nodes.get(node.parentId) : null;

    while (current) {
      if (current.children.length > 1) {
        return current;
      }
      current = current.parentId ? this.nodes.get(current.parentId) : null;
    }

    return null;
  }

  private performReflection(): void {
    if (this.iterations % 10 !== 0) return;

    const recentNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'expanded')
      .slice(-5);

    const avgScore = recentNodes.length > 0
      ? recentNodes.reduce((sum, n) => sum + n.score, 0) / recentNodes.length
      : 0;

    if (avgScore < this.config.confidenceThreshold) {
      this.reflections.push({
        type: 'progress',
        content: `Recent performance below threshold: ${avgScore.toFixed(2)}`,
        confidence: 0.8,
        suggestions: [
          'Consider backtracking to higher confidence nodes',
          'Explore alternative branches',
        ],
        timestamp: Date.now(),
      });
    }
  }

  private updateMetaCognition(): void {
    if (!this.metaCognition) return;

    const explorationCount = Array.from(this.nodes.values())
      .filter(n => n.status === 'expanded').length;

    const successRate = explorationCount / Math.max(1, this.iterations);

    this.metaCognition.effectivenessScore = successRate;
    this.metaCognition.adjustmentNeeded = successRate < 0.3 || successRate > 0.9;

    if (this.metaCognition.adjustmentNeeded) {
      if (successRate < 0.3) {
        this.metaCognition.adjustmentReason = 'Too much exploration, not enough exploitation';
        this.metaCognition.currentStrategy = 'exploit';
        this.config.explorationRatio = Math.max(0.1, this.config.explorationRatio - 0.1);
      } else if (successRate > 0.9) {
        this.metaCognition.adjustmentReason = 'Too much exploitation, might be missing better solutions';
        this.metaCognition.currentStrategy = 'explore';
        this.config.explorationRatio = Math.min(0.5, this.config.explorationRatio + 0.1);
      }

      this.metaCognition.history.push(
        `Strategy: ${this.metaCognition.currentStrategy}, Ratio: ${this.config.explorationRatio.toFixed(2)}`
      );
    }
  }

  private selectNode(shouldExplore: boolean): PlanNode | null {
    const pendingNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'pending');

    if (pendingNodes.length === 0) return null;

    if (shouldExplore) {
      return this.selectExplorationNode(pendingNodes);
    }

    return this.selectExploitationNode(pendingNodes);
  }

  private selectExplorationNode(nodes: PlanNode[]): PlanNode {
    const shuffled = [...nodes].sort(() => Math.random() - 0.5);
    return shuffled[0];
  }

  private selectExploitationNode(nodes: PlanNode[]): PlanNode {
    return nodes.reduce((best, node) => {
      const explorationBonus = node.depth * 0.05;
      const effectiveScore = node.score + explorationBonus;
      const bestEffectiveScore = best.score + best.depth * 0.05;
      return effectiveScore > bestEffectiveScore ? node : best;
    });
  }

  private createNode(data: Partial<PlanNode> & { id: string; description: string; parentId: string | null; depth: number }): PlanNode {
    return {
      id: data.id,
      description: data.description,
      parentId: data.parentId,
      children: data.children || [],
      depth: data.depth,
      score: data.score ?? 1.0,
      confidence: data.confidence ?? 0.5,
      status: data.status || 'pending',
      metadata: data.metadata || {},
      createdAt: Date.now(),
      visitedAt: data.visitedAt,
      executedAt: data.executedAt,
    };
  }

  private pruneNode(nodeId: string, reason: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.status = 'pruned';
    this.executionTrace!.branchesPruned++;

    const branch = this.branches.find(b => b.nodes.some(n => n.id === nodeId));
    if (branch) {
      branch.isViable = false;
      branch.prunedReason = reason;
    }

    for (const childId of node.children) {
      this.pruneNode(childId, `parent_pruned: ${reason}`);
    }
  }

  private updateBranchScores(node: PlanNode): void {
    for (const branch of this.branches) {
      if (branch.nodes.some(n => n.id === node.parentId)) {
        branch.totalScore += node.score * Math.pow(0.9, node.depth);
        branch.confidence *= node.confidence;
        branch.nodes.push(node);
      }
    }
  }

  private selectBestBranch(): PlanBranch | null {
    const viableBranches = this.branches.filter(b => b.isViable);

    if (viableBranches.length === 0) {
      return null;
    }

    return viableBranches.reduce((best, branch) => {
      const adjustedScore = branch.totalScore * branch.confidence;
      const bestAdjustedScore = best.totalScore * best.confidence;
      return adjustedScore > bestAdjustedScore ? branch : best;
    });
  }

  private buildExecutionOrder(branch: PlanBranch): string[] {
    const order: string[] = [];
    const nodeMap = new Map(branch.nodes.map(n => [n.id, n]));

    const root = branch.nodes.find(n => n.parentId === null);
    if (root) {
      this.buildOrderRecursive(root.id, order, nodeMap);
    }

    return order;
  }

  private buildOrderRecursive(nodeId: string, order: string[], nodeMap: Map<string, PlanNode>): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    order.push(nodeId);

    const sortedChildren = node.children
      .map(id => nodeMap.get(id))
      .filter((n): n is PlanNode => n !== undefined)
      .sort((a, b) => b.score - a.score);

    for (const child of sortedChildren) {
      this.buildOrderRecursive(child.id, order, nodeMap);
    }
  }

  private calculateFinalScore(): number {
    const completedSteps = this.executionTrace!.steps.filter(s => s.status === 'completed');
    const depthBonus = Math.max(...this.executionTrace!.steps.map(s => s.order)) * 0.1;
    return (completedSteps.length / Math.max(1, this.executionTrace!.steps.length)) * (1 + depthBonus);
  }

  private generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateBranchId(): string {
    return `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  getNodes(): PlanNode[] {
    return Array.from(this.nodes.values());
  }

  getBranches(): PlanBranch[] {
    return [...this.branches];
  }

  getReflections(): Reflection[] {
    return [...this.reflections];
  }

  getMetaCognition(): MetaCognition | null {
    return this.metaCognition ? { ...this.metaCognition } : null;
  }

  getExecutionTrace(): ExecutionTrace | null {
    return this.executionTrace ? { ...this.executionTrace } : null;
  }
}

export function createDeepPlanner(config?: Partial<DeepPlanConfig>): DeepPlanner {
  return new DeepPlanner(config);
}

export const DEFAULT_DEEP_PLAN_CONFIG: DeepPlanConfig = {
  maxDepth: 10,
  maxBranches: 5,
  maxIterations: 100,
  explorationRatio: 0.3,
  exploitationRatio: 0.7,
  enableReflection: true,
  enableSelfCorrection: true,
  enableMetaCognition: true,
  confidenceThreshold: 0.7,
};
