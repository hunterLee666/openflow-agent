import type { QueryContext, QueryResult, StreamEvent } from "../types/index.js";

export type AgentRole = "coordinator" | "explorer" | "planner" | "worker" | "verification";

export interface SubAgent {
  id: string;
  role: AgentRole;
  prompt: string;
  readonly: boolean;
  dependencies: string[];
  result?: SubAgentResult;
  status: "pending" | "running" | "completed" | "failed";
}

export interface SubAgentResult {
  summary: string;
  touchedFiles: string[];
  openQuestions: string[];
  artifacts?: Record<string, string>;
  verdict?: "PASS" | "FAIL" | "PARTIAL";
  evidence?: string[];
}

export interface Phase {
  name: string;
  purpose: string;
  parallel: boolean;
  agents: SubAgent[];
}

export interface CoordinatorPlan {
  phases: Phase[];
  mergeStrategy: "concat" | "dedup" | "smart";
}

export interface Coordinator {
  createPlan(goal: string, ctx: QueryContext): Promise<CoordinatorPlan>;
  executePlan(plan: CoordinatorPlan, ctx: QueryContext): AsyncGenerator<StreamEvent, SubAgentResult[], unknown>;
  mergeResults(results: SubAgentResult[], strategy: string): SubAgentResult;
}

export interface TaskContext {
  parentId: string;
  depth: number;
  maxDepth: number;
  sharedState: Map<string, unknown>;
}
