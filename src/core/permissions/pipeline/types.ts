import type { Tool } from '../../tools/tool'

export type PipelineStep = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type PipelineVerdict = 'allow' | 'ask' | 'deny' | 'continue'

export interface PipelineContext {
  tool: Tool
  input: Record<string, unknown>
  mode: string
  workingDirectory: string
  toolPermissionContext: any
  previousCalls?: PipelineCallRecord[]
}

export interface PipelineResult {
  step: PipelineStep
  verdict: PipelineVerdict
  reason: string
  metadata?: Record<string, unknown>
}

export interface PipelineCallRecord {
  timestamp: string
  toolName: string
  input: Record<string, unknown>
  result: PipelineResult
  duration: number
}

export interface StepExecutor {
  execute(context: PipelineContext): Promise<PipelineResult>
}

export const STEP_NAMES: Record<PipelineStep, string> = {
  1: 'Tool-level deny rules',
  2: 'Tool-level ask rules',
  3: 'Tool-specific checks',
  4: 'Tool implementation rejection',
  5: 'User interaction requirement',
  6: 'Content-specific ask',
  7: 'Safety guardrails',
}

export const STEP_DESCRIPTIONS: Record<PipelineStep, string> = {
  1: 'Hard deny with no override. Immediate rejection if matched.',
  2: 'Ask rules with sandbox exception support.',
  3: 'Bash AST analysis, Edit path validation.',
  4: 'Runtime-level rejection from tool implementation.',
  5: 'Mode-driven user confirmation requirements.',
  6: 'Sensitive content pattern detection.',
  7: 'Global safety guardrails for .git, .claude, shell configs.',
}
