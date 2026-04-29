import {
  PipelineContext,
  PipelineResult,
  PipelineStep,
  PipelineVerdict,
  STEP_NAMES,
} from './types'

export class PipelineEngine {
  private steps: Map<PipelineStep, (context: PipelineContext) => Promise<PipelineResult>> =
    new Map()

  registerStep(
    step: PipelineStep,
    executor: (context: PipelineContext) => Promise<PipelineResult>,
  ): void {
    this.steps.set(step, executor)
  }

  async execute(context: PipelineContext): Promise<PipelineResult> {
    for (let step = 1 as PipelineStep; step <= 7; step++) {
      const executor = this.steps.get(step)
      if (!executor) {
        continue
      }

      const result = await executor(context)

      if (result.verdict !== 'continue') {
        return result
      }
    }

    return {
      step: 7 as PipelineStep,
      verdict: 'allow',
      reason: 'All pipeline steps passed',
    }
  }

  async executeStep(
    step: PipelineStep,
    context: PipelineContext,
  ): Promise<PipelineResult> {
    const executor = this.steps.get(step)
    if (!executor) {
      return {
        step,
        verdict: 'continue',
        reason: `Step ${step} not registered`,
      }
    }

    return executor(context)
  }

  getRegisteredSteps(): PipelineStep[] {
    return Array.from(this.steps.keys()).sort((a, b) => a - b)
  }

  hasStep(step: PipelineStep): boolean {
    return this.steps.has(step)
  }

  clearSteps(): void {
    this.steps.clear()
  }
}

export function createDefaultPipelineResult(
  step: PipelineStep,
  verdict: PipelineVerdict,
  reason: string,
  metadata?: Record<string, unknown>,
): PipelineResult {
  return {
    step,
    verdict,
    reason,
    metadata: {
      stepName: STEP_NAMES[step],
      ...metadata,
    },
  }
}

export function createAllowResult(
  step: PipelineStep,
  reason: string,
  metadata?: Record<string, unknown>,
): PipelineResult {
  return createDefaultPipelineResult(step, 'allow', reason, metadata)
}

export function createAskResult(
  step: PipelineStep,
  reason: string,
  metadata?: Record<string, unknown>,
): PipelineResult {
  return createDefaultPipelineResult(step, 'ask', reason, metadata)
}

export function createDenyResult(
  step: PipelineStep,
  reason: string,
  metadata?: Record<string, unknown>,
): PipelineResult {
  return createDefaultPipelineResult(step, 'deny', reason, metadata)
}

export function createContinueResult(
  step: PipelineStep,
  reason: string,
  metadata?: Record<string, unknown>,
): PipelineResult {
  return createDefaultPipelineResult(step, 'continue', reason, metadata)
}
