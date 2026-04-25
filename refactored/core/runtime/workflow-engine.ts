import { EventEmitter } from "node:events";

export enum WorkflowStepType {
  TEXT = "text",
  SCRIPT = "script",
  AGENT = "agent",
  CONDITION = "condition",
  LOOP = "loop",
  PARALLEL = "parallel",
  VARIABLE = "variable",
  VISUALIZATION = "visualization",
}

export enum WorkflowMode {
  SEQUENTIAL = "sequential",
  PARALLEL = "parallel",
  DAG = "dag",
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  description?: string;
  prompt?: string;
  script?: string;
  agent?: string;
  condition?: string;
  loop?: {
    items: string;
    variable: string;
  };
  visualization?: {
    type: "html" | "chart" | "animation";
    title?: string;
    config?: Record<string, unknown>;
    content?: string;
  };
  needs?: string[];
  timeout?: number;
  retry?: number;
  onError?: "abort" | "continue" | "skip_dependent";
  variables?: Record<string, string>;
  output?: string;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  mode: WorkflowMode;
  steps: WorkflowStep[];
  variables?: Record<string, string>;
  timeout?: number;
  maxConcurrency?: number;
  onError?: "abort" | "continue";
}

export enum WorkflowStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum StepStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  SKIPPED = "skipped",
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: string;
  error?: string;
  duration: number;
  variables: Record<string, unknown>;
}

export interface WorkflowResult {
  workflowId: string;
  status: WorkflowStatus;
  stepResults: StepResult[];
  variables: Record<string, unknown>;
  duration: number;
  error?: string;
}

export class WorkflowEngine extends EventEmitter {
  private context: Record<string, unknown> = {};
  private runningWorkflows: Map<string, WorkflowResult> = new Map();
  private maxConcurrency: number;
  private defaultTimeout: number;

  constructor(options?: { maxConcurrency?: number; defaultTimeout?: number }) {
    super();
    this.maxConcurrency = options?.maxConcurrency || 5;
    this.defaultTimeout = options?.defaultTimeout || 300000;
  }

  async executeWorkflow(
    definition: WorkflowDefinition,
    initialContext?: Record<string, unknown>
  ): Promise<WorkflowResult> {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.context = { ...initialContext };

    if (definition.variables) {
      for (const [key, value] of Object.entries(definition.variables)) {
        this.context[key] = this.resolveVariables(value);
      }
    }

    const result: WorkflowResult = {
      workflowId,
      status: WorkflowStatus.RUNNING,
      stepResults: [],
      variables: { ...this.context },
      duration: 0,
    };

    this.runningWorkflows.set(workflowId, result);
    this.emit("workflow:start", { workflowId, definition });

    try {
      const timeout = definition.timeout || this.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Workflow timeout after ${timeout}ms`)), timeout);
      });

      const executionPromise = this.executeSteps(definition);
      const stepResults = await Promise.race([executionPromise, timeoutPromise]);

      result.stepResults = stepResults;
      result.status = this.determineWorkflowStatus(stepResults, definition.onError);
      result.variables = { ...this.context };
      result.duration = Date.now() - startTime;

      this.emit("workflow:complete", result);
    } catch (error) {
      result.status = WorkflowStatus.FAILED;
      result.error = (error as Error).message;
      result.duration = Date.now() - startTime;

      this.emit("workflow:error", result);
    }

    return result;
  }

  cancelWorkflow(workflowId: string): boolean {
    const workflow = this.runningWorkflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = WorkflowStatus.CANCELLED;
    this.emit("workflow:cancel", { workflowId });
    return true;
  }

  getWorkflowStatus(workflowId: string): WorkflowResult | undefined {
    return this.runningWorkflows.get(workflowId);
  }

  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  private async executeSteps(definition: WorkflowDefinition): Promise<StepResult[]> {
    const results: StepResult[] = [];
    const completedSteps = new Set<string>();
    const failedSteps = new Set<string>();

    switch (definition.mode) {
      case WorkflowMode.SEQUENTIAL:
        for (const step of definition.steps) {
          const result = await this.executeSingleStep(step, completedSteps, failedSteps);
          results.push(result);

          if (result.status === StepStatus.COMPLETED) {
            completedSteps.add(step.id);
          } else if (result.status === StepStatus.FAILED) {
            failedSteps.add(step.id);

            if (definition.onError === "abort" || step.onError === "abort") {
              this.skipRemainingSteps(definition.steps, completedSteps, results);
              break;
            }
          }
        }
        break;

      case WorkflowMode.PARALLEL:
        const parallelResults = await Promise.allSettled(
          definition.steps.map((step) => this.executeSingleStep(step, completedSteps, failedSteps))
        );

        for (const settled of parallelResults) {
          if (settled.status === "fulfilled") {
            results.push(settled.value);
            if (settled.value.status === StepStatus.COMPLETED) {
              completedSteps.add(settled.value.stepId);
            }
          }
        }
        break;

      case WorkflowMode.DAG:
        await this.executeDAG(definition.steps, results, completedSteps, failedSteps, definition.onError);
        break;
    }

    return results;
  }

  private async executeDAG(
    steps: WorkflowStep[],
    results: StepResult[],
    completedSteps: Set<string>,
    failedSteps: Set<string>,
    onError?: "abort" | "continue"
  ): Promise<void> {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const pendingSteps = new Set(steps.map((s) => s.id));
    const runningSteps = new Set<string>();

    while (pendingSteps.size > 0 || runningSteps.size > 0) {
      const readySteps = this.findReadySteps(steps, pendingSteps, completedSteps, failedSteps, runningSteps);

      if (readySteps.length === 0 && runningSteps.size === 0) {
        this.skipRemainingSteps(steps, completedSteps, results);
        break;
      }

      const batch = readySteps.slice(0, this.maxConcurrency);

      const promises = batch.map(async (stepId) => {
        const step = stepMap.get(stepId)!;
        pendingSteps.delete(stepId);
        runningSteps.add(stepId);

        try {
          const result = await this.executeSingleStep(step, completedSteps, failedSteps);
          results.push(result);

          if (result.status === StepStatus.COMPLETED) {
            completedSteps.add(stepId);
          } else if (result.status === StepStatus.FAILED) {
            failedSteps.add(stepId);

            if (step.onError === "skip_dependent") {
              this.skipDependentSteps(steps, stepId, pendingSteps, results);
            }
          }
        } finally {
          runningSteps.delete(stepId);
        }
      });

      await Promise.allSettled(promises);
    }
  }

  private findReadySteps(
    steps: WorkflowStep[],
    pendingSteps: Set<string>,
    completedSteps: Set<string>,
    failedSteps: Set<string>,
    runningSteps: Set<string>
  ): string[] {
    const ready: string[] = [];

    for (const stepId of pendingSteps) {
      if (runningSteps.has(stepId)) continue;

      const step = steps.find((s) => s.id === stepId);
      if (!step) continue;

      const needs = step.needs || [];
      const allDepsMet = needs.every((dep) => completedSteps.has(dep));
      const noFailedDeps = !needs.some((dep) => failedSteps.has(dep));

      if (allDepsMet && noFailedDeps) {
        ready.push(stepId);
      } else if (needs.some((dep) => failedSteps.has(dep))) {
        pendingSteps.delete(stepId);
        const result: StepResult = {
          stepId,
          status: StepStatus.SKIPPED,
          output: undefined,
          error: `Skipped due to failed dependency`,
          duration: 0,
          variables: {},
        };
      }
    }

    return ready;
  }

  private async executeSingleStep(
    step: WorkflowStep,
    completedSteps: Set<string>,
    failedSteps: Set<string>
  ): Promise<StepResult> {
    const startTime = Date.now();

    if (step.condition) {
      const conditionMet = this.evaluateCondition(step.condition);
      if (!conditionMet) {
        return {
          stepId: step.id,
          status: StepStatus.SKIPPED,
          output: `Condition not met: ${step.condition}`,
          duration: Date.now() - startTime,
          variables: {},
        };
      }
    }

    const maxRetries = step.retry || 0;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let output: string;

        switch (step.type) {
          case WorkflowStepType.TEXT:
            output = await this.executeTextStep(step);
            break;
          case WorkflowStepType.SCRIPT:
            output = await this.executeScriptStep(step);
            break;
          case WorkflowStepType.AGENT:
            output = await this.executeAgentStep(step);
            break;
          case WorkflowStepType.VARIABLE:
            output = await this.executeVariableStep(step);
            break;
          case WorkflowStepType.LOOP:
            output = await this.executeLoopStep(step, completedSteps, failedSteps);
            break;
          case WorkflowStepType.VISUALIZATION:
            output = await this.executeVisualizationStep(step);
            break;
          default:
            throw new Error(`Unknown step type: ${step.type}`);
        }

        if (step.output) {
          this.context[step.output] = output;
        }

        if (step.variables) {
          for (const [key, value] of Object.entries(step.variables)) {
            this.context[key] = this.resolveVariables(value);
          }
        }

        this.emit("step:complete", {
          stepId: step.id,
          status: StepStatus.COMPLETED,
          duration: Date.now() - startTime,
        });

        return {
          stepId: step.id,
          status: StepStatus.COMPLETED,
          output,
          duration: Date.now() - startTime,
          variables: { ...this.context },
        };
      } catch (error) {
        lastError = error as Error;

        this.emit("step:error", {
          stepId: step.id,
          error: (error as Error).message,
          attempt: attempt + 1,
        });

        if (attempt < maxRetries) {
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    return {
      stepId: step.id,
      status: StepStatus.FAILED,
      error: lastError?.message || "Unknown error",
      duration: Date.now() - startTime,
      variables: { ...this.context },
    };
  }

  private async executeTextStep(step: WorkflowStep): Promise<string> {
    if (!step.prompt) {
      throw new Error(`Text step ${step.id} requires a prompt`);
    }

    const resolvedPrompt = this.resolveVariables(step.prompt);

    this.emit("step:prompt", {
      stepId: step.id,
      prompt: resolvedPrompt,
      agent: step.agent,
    });

    return `[Text step executed - prompt sent to LLM: ${resolvedPrompt.slice(0, 100)}...]`;
  }

  private async executeScriptStep(step: WorkflowStep): Promise<string> {
    if (!step.script) {
      throw new Error(`Script step ${step.id} requires a script path`);
    }

    this.emit("step:script", {
      stepId: step.id,
      script: step.script,
      context: { ...this.context },
    });

    return `[Script executed: ${step.script}]`;
  }

  private async executeAgentStep(step: WorkflowStep): Promise<string> {
    if (!step.prompt) {
      throw new Error(`Agent step ${step.id} requires a prompt`);
    }

    const resolvedPrompt = this.resolveVariables(step.prompt);
    const agentType = step.agent || "general-purpose";

    this.emit("step:agent", {
      stepId: step.id,
      agent: agentType,
      prompt: resolvedPrompt,
    });

    return `[Agent ${agentType} executed: ${resolvedPrompt.slice(0, 100)}...]`;
  }

  private async executeVariableStep(step: WorkflowStep): Promise<string> {
    if (!step.variables) {
      throw new Error(`Variable step ${step.id} requires variables`);
    }

    for (const [key, value] of Object.entries(step.variables)) {
      this.context[key] = this.resolveVariables(value);
    }

    return `Variables set: ${Object.keys(step.variables).join(", ")}`;
  }

  private async executeLoopStep(
    step: WorkflowStep,
    completedSteps: Set<string>,
    failedSteps: Set<string>
  ): Promise<string> {
    if (!step.loop) {
      throw new Error(`Loop step ${step.id} requires loop configuration`);
    }

    const items = this.resolveVariables(step.loop.items);
    let itemsArray: unknown[];

    try {
      itemsArray = JSON.parse(items);
    } catch {
      itemsArray = items.split(",").map((s) => s.trim());
    }

    if (!Array.isArray(itemsArray)) {
      throw new Error(`Loop items must be an array or comma-separated list`);
    }

    const results: string[] = [];

    for (let i = 0; i < itemsArray.length; i++) {
      const item = itemsArray[i];
      this.context[step.loop.variable] = item;
      this.context["loop_index"] = i;
      this.context["loop_total"] = itemsArray.length;

      if (step.prompt) {
        const resolvedPrompt = this.resolveVariables(step.prompt);
        results.push(`[Iteration ${i + 1}/${itemsArray.length}: ${resolvedPrompt.slice(0, 50)}...]`);
      }
    }

    return results.join("\n");
  }

  private async executeVisualizationStep(step: WorkflowStep): Promise<string> {
    if (!step.visualization) {
      throw new Error(`Visualization step ${step.id} requires visualization configuration`);
    }

    const vizConfig = step.visualization;
    let resolvedContent = vizConfig.content || "";

    if (resolvedContent) {
      resolvedContent = this.resolveVariables(resolvedContent);
    }

    let configCopy: Record<string, unknown> = {};
    if (vizConfig.config) {
      configCopy = JSON.parse(JSON.stringify(vizConfig.config));

      for (const [key, value] of Object.entries(configCopy)) {
        if (typeof value === "string") {
          configCopy[key] = this.resolveVariables(value);
        }
      }

      if (configCopy.data && Array.isArray(configCopy.data)) {
        configCopy.data = configCopy.data.map((item: Record<string, unknown>) => {
          const newItem: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(item)) {
            newItem[k] = typeof v === "string" ? this.resolveVariables(v) : v;
          }
          return newItem;
        });
      }
    }

    this.emit("step:visualization", {
      stepId: step.id,
      type: vizConfig.type,
      title: vizConfig.title,
      config: configCopy,
    });

    return `[Visualization ${vizConfig.type} ready: ${vizConfig.title || "untitled"}]`;
  }

  private evaluateCondition(condition: string): boolean {
    const resolved = this.resolveVariables(condition);

    if (resolved.startsWith("{{") && resolved.endsWith("}}")) {
      const varName = resolved.slice(2, -2).trim();
      return !!this.context[varName];
    }

    if (resolved.includes("==")) {
      const [left, right] = resolved.split("==").map((s) => s.trim());
      return this.resolveVariables(left) === this.resolveVariables(right);
    }

    if (resolved.includes("!=")) {
      const [left, right] = resolved.split("!=").map((s) => s.trim());
      return this.resolveVariables(left) !== this.resolveVariables(right);
    }

    if (resolved.includes(">=")) {
      const [left, right] = resolved.split(">=").map((s) => s.trim());
      return Number(this.resolveVariables(left)) >= Number(this.resolveVariables(right));
    }

    if (resolved.includes("<=")) {
      const [left, right] = resolved.split("<=").map((s) => s.trim());
      return Number(this.resolveVariables(left)) <= Number(this.resolveVariables(right));
    }

    if (resolved.includes(">")) {
      const [left, right] = resolved.split(">").map((s) => s.trim());
      return Number(this.resolveVariables(left)) > Number(this.resolveVariables(right));
    }

    if (resolved.includes("<")) {
      const [left, right] = resolved.split("<").map((s) => s.trim());
      return Number(this.resolveVariables(left)) < Number(this.resolveVariables(right));
    }

    return !!resolved;
  }

  private resolveVariables(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      const value = this.context[varName];
      return value !== undefined ? String(value) : _match;
    });
  }

  private skipRemainingSteps(
    steps: WorkflowStep[],
    completedSteps: Set<string>,
    results: StepResult[]
  ): void {
    for (const step of steps) {
      if (!completedSteps.has(step.id)) {
        results.push({
          stepId: step.id,
          status: StepStatus.SKIPPED,
          output: "Skipped due to workflow abort",
          duration: 0,
          variables: {},
        });
      }
    }
  }

  private skipDependentSteps(
    steps: WorkflowStep[],
    failedStepId: string,
    pendingSteps: Set<string>,
    results: StepResult[]
  ): void {
    const toSkip = new Set<string>();

    const collectDependents = (stepId: string) => {
      for (const step of steps) {
        if (step.needs?.includes(stepId) && !toSkip.has(step.id)) {
          toSkip.add(step.id);
          collectDependents(step.id);
        }
      }
    };

    collectDependents(failedStepId);

    for (const stepId of toSkip) {
      pendingSteps.delete(stepId);
      results.push({
        stepId,
        status: StepStatus.SKIPPED,
        output: `Skipped due to failed dependency: ${failedStepId}`,
        duration: 0,
        variables: {},
      });
    }
  }

  private determineWorkflowStatus(
    stepResults: StepResult[],
    onError?: "abort" | "continue"
  ): WorkflowStatus {
    const hasFailed = stepResults.some((r) => r.status === StepStatus.FAILED);

    if (hasFailed && onError === "abort") {
      return WorkflowStatus.FAILED;
    }

    const allCompleteOrSkipped = stepResults.every(
      (r) => r.status === StepStatus.COMPLETED || r.status === StepStatus.SKIPPED
    );

    return allCompleteOrSkipped ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
