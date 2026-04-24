import type {
  Coordinator,
  CoordinatorPlan,
  Phase,
  SubAgent,
  SubAgentResult,
  TaskContext,
} from "./types.js";
import type { QueryContext, StreamEvent } from "../../types/index.js";

export class DefaultCoordinator implements Coordinator {
  async createPlan(goal: string, ctx: QueryContext): Promise<CoordinatorPlan> {
    const phases: Phase[] = [
      {
        name: "explore",
        purpose: "Wide search to identify relevant files and patterns",
        parallel: true,
        agents: [
          {
            id: "explore-1",
            role: "explorer",
            prompt: `Search for files related to: ${goal}. Return paths and brief descriptions.`,
            readonly: true,
            dependencies: [],
            status: "pending",
          },
        ],
      },
      {
        name: "plan",
        purpose: "Analyze findings and create modification plan",
        parallel: false,
        agents: [
          {
            id: "planner-1",
            role: "planner",
            prompt: `Based on exploration results, create a detailed plan for: ${goal}. Identify files to modify and order.`,
            readonly: true,
            dependencies: ["explore-1"],
            status: "pending",
          },
        ],
      },
      {
        name: "execute",
        purpose: "Implement changes",
        parallel: false,
        agents: [
          {
            id: "worker-1",
            role: "worker",
            prompt: `Implement the planned changes for: ${goal}`,
            readonly: false,
            dependencies: ["planner-1"],
            status: "pending",
          },
        ],
      },
      {
        name: "verify",
        purpose: "Independent verification of changes",
        parallel: false,
        agents: [
          {
            id: "verifier-1",
            role: "verification",
            prompt: `Verify the implementation of: ${goal}. Run tests, check for issues. Try to break it.`,
            readonly: true,
            dependencies: ["worker-1"],
            status: "pending",
          },
        ],
      },
    ];

    return { phases, mergeStrategy: "smart" };
  }

  async* executePlan(
    plan: CoordinatorPlan,
    ctx: QueryContext,
  ): AsyncGenerator<StreamEvent, SubAgentResult[], unknown> {
    const results: SubAgentResult[] = [];

    for (const phase of plan.phases) {
      yield {
        kind: "completion",
        text: `\n[Coordinator] Phase: ${phase.name} - ${phase.purpose}`,
      };

      if (phase.parallel) {
        const phaseResults = await Promise.all(
          phase.agents.map((agent) => this.runSubAgent(agent, ctx)),
        );
        for (const result of phaseResults) {
          results.push(result);
          yield {
            kind: "completion",
            text: `[${agentFromResult(result)?.id}] ${result.summary}`,
          };
        }
      } else {
        for (const agent of phase.agents) {
          const result = await this.runSubAgent(agent, ctx);
          results.push(result);
          yield {
            kind: "completion",
            text: `[${agent.id}] ${result.summary}`,
          };
        }
      }
    }

    return results;
  }

  private async runSubAgent(agent: SubAgent, ctx: QueryContext): Promise<SubAgentResult> {
    agent.status = "running";

    try {
      const result: SubAgentResult = {
        summary: `Agent ${agent.id} (${agent.role}) completed task`,
        touchedFiles: [],
        openQuestions: [],
      };

      agent.result = result;
      agent.status = "completed";
      return result;
    } catch (e) {
      agent.status = "failed";
      return {
        summary: `Agent ${agent.id} failed: ${(e as Error).message}`,
        touchedFiles: [],
        openQuestions: [],
        verdict: "FAIL",
      };
    }
  }

  mergeResults(results: SubAgentResult[], strategy: string): SubAgentResult {
    const merged: SubAgentResult = {
      summary: "",
      touchedFiles: [],
      openQuestions: [],
      evidence: [],
    };

    const allFiles = new Set<string>();
    const allQuestions = new Set<string>();
    const summaries: string[] = [];

    for (const r of results) {
      summaries.push(r.summary);
      r.touchedFiles?.forEach((f) => allFiles.add(f));
      r.openQuestions?.forEach((q) => allQuestions.add(q));
      r.evidence?.forEach((e) => merged.evidence?.push(e));
    }

    merged.summary = summaries.join("\n");
    merged.touchedFiles = Array.from(allFiles);
    merged.openQuestions = Array.from(allQuestions);

    const verdicts = results.map((r) => r.verdict).filter(Boolean);
    if (verdicts.includes("FAIL")) {
      merged.verdict = "FAIL";
    } else if (verdicts.includes("PARTIAL")) {
      merged.verdict = "PARTIAL";
    } else if (verdicts.length > 0) {
      merged.verdict = "PASS";
    }

    return merged;
  }
}

function agentFromResult(result: SubAgentResult): SubAgent | undefined {
  return undefined;
}
