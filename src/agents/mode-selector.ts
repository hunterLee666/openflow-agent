import type { SubAgentTask, SubAgentContext } from "./sub-agent-system.js";

export type AgentMode = "single" | "swarm" | "coordinator";

export interface ModeSelectorConfig {
  singleAgentTokenThreshold: number;
  swarmAgentThreshold: number;
  coordinatorComplexityThreshold: number;
}

export interface TaskComplexity {
  score: number;
  requiresMultipleAgents: boolean;
  recommendedMode: AgentMode;
  factors: TaskComplexityFactors;
}

export interface TaskComplexityFactors {
  hasMultipleSubtasks: boolean;
  requiresSpecialization: boolean;
  hasDependencies: boolean;
  estimatedTokenCount: number;
  requiresParallelism: boolean;
  complexityLevel: "simple" | "moderate" | "complex";
}

export class ModeSelector {
  private config: ModeSelectorConfig;

  constructor(config?: Partial<ModeSelectorConfig>) {
    this.config = {
      singleAgentTokenThreshold: config?.singleAgentTokenThreshold || 4000,
      swarmAgentThreshold: config?.swarmAgentThreshold || 8000,
      coordinatorComplexityThreshold: config?.coordinatorComplexityThreshold || 0.7,
    };
  }

  analyzeTask(task: SubAgentTask): TaskComplexity {
    const factors = this.analyzeComplexityFactors(task);
    const score = this.calculateScore(factors);
    const requiresMultipleAgents = score > 0.3;
    const recommendedMode = this.determineMode(score, factors);

    return {
      score,
      requiresMultipleAgents,
      recommendedMode,
      factors,
    };
  }

  private analyzeComplexityFactors(task: SubAgentTask): TaskComplexityFactors {
    const description = `${task.description} ${task.prompt}`.toLowerCase();

    const hasMultipleSubtasks = this.detectMultipleSubtasks(description);
    const requiresSpecialization = this.detectSpecialization(description);
    const hasDependencies = this.detectDependencies(description);
    const estimatedTokenCount = this.estimateTokenCount(task);
    const requiresParallelism = this.detectParallelism(description);
    const complexityLevel = this.determineComplexityLevel(
      hasMultipleSubtasks,
      requiresSpecialization,
      hasDependencies,
      estimatedTokenCount,
      requiresParallelism
    );

    return {
      hasMultipleSubtasks,
      requiresSpecialization,
      hasDependencies,
      estimatedTokenCount,
      requiresParallelism,
      complexityLevel,
    };
  }

  private detectMultipleSubtasks(description: string): boolean {
    const patterns = [
      /\band\b.*\band\b/i,
      /\bfirst\b.*\bthen\b.*\bfinally\b/i,
      /\bstep\s*\d/i,
      /\b\d+\.\s/,
      /\b(analyze|research|write|test|review|implement)\b.*\b(analyze|research|write|test|review|implement)\b/i,
    ];

    return patterns.some((pattern) => pattern.test(description));
  }

  private detectSpecialization(description: string): boolean {
    const domainKeywords = {
      code: ["code", "function", "class", "api", "database", "query", "algorithm"],
      test: ["test", "unit test", "integration", "coverage", "assertion"],
      docs: ["document", "documentation", "readme", "comment", "explain"],
      security: ["security", "vulnerability", "authentication", "authorization", "encrypt"],
      performance: ["performance", "optimize", "benchmark", "profiling", "memory"],
    };

    let domainCount = 0;

    for (const keywords of Object.values(domainKeywords)) {
      const hasKeyword = keywords.some((kw) => description.includes(kw));
      if (hasKeyword) {
        domainCount++;
      }
    }

    return domainCount >= 2;
  }

  private detectDependencies(description: string): boolean {
    const patterns = [
      /\bdepend.*on\b/i,
      /\bafter\b.*\bcomplete/i,
      /\bbefore\b.*\bstart/i,
      /\brequires?\b/i,
      /\bprerequisite/i,
    ];

    return patterns.some((pattern) => pattern.test(description));
  }

  private detectParallelism(description: string): boolean {
    const patterns = [
      /\bparallel/i,
      /\bsimultaneous/i,
      /\bat the same time/i,
      /\bconcurrent/i,
      /\ball\b.*\bfiles?\b/i,
      /\bsearch\b.*\b(multiple|all|every)\b/i,
    ];

    return patterns.some((pattern) => pattern.test(description));
  }

  private estimateTokenCount(task: SubAgentTask): number {
    const text = `${task.description} ${task.prompt} ${task.systemPrompt || ""}`;
    return Math.ceil(text.length / 4);
  }

  private determineComplexityLevel(
    hasMultipleSubtasks: boolean,
    requiresSpecialization: boolean,
    hasDependencies: boolean,
    estimatedTokenCount: number,
    requiresParallelism: boolean
  ): "simple" | "moderate" | "complex" {
    let score = 0;

    if (hasMultipleSubtasks) score += 2;
    if (requiresSpecialization) score += 2;
    if (hasDependencies) score += 1;
    if (requiresParallelism) score += 2;
    if (estimatedTokenCount > 8000) score += 1;

    if (score >= 5) return "complex";
    if (score >= 3) return "moderate";
    return "simple";
  }

  private calculateScore(factors: TaskComplexityFactors): number {
    let score = 0;
    let maxScore = 0;

    if (factors.hasMultipleSubtasks) {
      score += 0.25;
      maxScore += 0.25;
    } else {
      maxScore += 0.25;
    }

    if (factors.requiresSpecialization) {
      score += 0.25;
      maxScore += 0.25;
    } else {
      maxScore += 0.25;
    }

    if (factors.hasDependencies) {
      score += 0.15;
      maxScore += 0.15;
    } else {
      maxScore += 0.15;
    }

    if (factors.requiresParallelism) {
      score += 0.2;
      maxScore += 0.2;
    } else {
      maxScore += 0.2;
    }

    if (factors.estimatedTokenCount > this.config.singleAgentTokenThreshold) {
      score += 0.15;
      maxScore += 0.15;
    } else {
      maxScore += 0.15;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  private determineMode(score: number, factors: TaskComplexityFactors): AgentMode {
    if (score < 0.3) {
      return "single";
    }

    if (factors.requiresParallelism || factors.complexityLevel === "complex") {
      return "coordinator";
    }

    if (score > 0.6 || factors.hasDependencies) {
      return "coordinator";
    }

    return "swarm";
  }
}
