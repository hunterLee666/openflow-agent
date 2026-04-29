import type { TokenBudgetInfo } from './tokenBudget'

export interface ToolOutputEstimate {
  toolName: string
  estimatedTokens: number
  confidence: 'high' | 'medium' | 'low'
  factors: string[]
  shouldWarn: boolean
  recommendation?: string
}

export interface ToolBudgetContext {
  currentBudget: TokenBudgetInfo
  plannedToolCalls: string[]
  reservedTokens: number
}

export interface ToolBudgetResult {
  canProceed: boolean
  estimates: ToolOutputEstimate[]
  totalEstimatedTokens: number
  budgetAfterCalls: TokenBudgetInfo
  warnings: string[]
  recommendations: string[]
}

const TOOL_OUTPUT_ESTIMATES: Record<string, {
  avgTokens: number
  maxTokens: number
  variance: 'low' | 'medium' | 'high'
}> = {
  Read: { avgTokens: 500, maxTokens: 5000, variance: 'medium' },
  Glob: { avgTokens: 200, maxTokens: 2000, variance: 'low' },
  Grep: { avgTokens: 300, maxTokens: 10000, variance: 'high' },
  LS: { avgTokens: 100, maxTokens: 500, variance: 'low' },
  Bash: { avgTokens: 500, maxTokens: 50000, variance: 'high' },
  Write: { avgTokens: 50, maxTokens: 100, variance: 'low' },
  Edit: { avgTokens: 50, maxTokens: 200, variance: 'low' },
  SearchCodebase: { avgTokens: 800, maxTokens: 8000, variance: 'medium' },
  WebFetch: { avgTokens: 1500, maxTokens: 15000, variance: 'high' },
  WebSearch: { avgTokens: 500, maxTokens: 3000, variance: 'medium' },
  Task: { avgTokens: 3000, maxTokens: 30000, variance: 'high' },
  Skill: { avgTokens: 2000, maxTokens: 20000, variance: 'high' },
  default: { avgTokens: 500, maxTokens: 5000, variance: 'medium' },
}

const HIGH_OUTPUT_TOOLS = ['Bash', 'Grep', 'WebFetch', 'Task', 'Read']
const LOW_OUTPUT_TOOLS = ['Write', 'Edit', 'LS', 'Glob']

export function estimateToolOutput(toolName: string, context?: {
  args?: Record<string, unknown>
  previousCalls?: number
}): ToolOutputEstimate {
  const estimate = TOOL_OUTPUT_ESTIMATES[toolName] || TOOL_OUTPUT_ESTIMATES.default
  const factors: string[] = []
  let estimatedTokens = estimate.avgTokens
  let confidence: 'high' | 'medium' | 'low' = estimate.variance === 'low' ? 'high' : 'medium'
  
  if (toolName === 'Read') {
    const limit = context?.args?.limit as number | undefined
    if (limit) {
      estimatedTokens = Math.min(limit * 0.5, estimate.maxTokens)
      factors.push(`Read limit: ${limit} lines`)
      confidence = 'high'
    }
  }
  
  if (toolName === 'Grep') {
    const outputMode = context?.args?.output_mode as string | undefined
    if (outputMode === 'content') {
      estimatedTokens = estimate.avgTokens * 3
      factors.push('Content output mode - higher token usage')
      confidence = 'low'
    } else if (outputMode === 'files_with_matches') {
      estimatedTokens = estimate.avgTokens * 0.5
      factors.push('Files-only output mode - lower token usage')
      confidence = 'high'
    }
  }
  
  if (toolName === 'Bash') {
    const command = context?.args?.command as string | undefined
    if (command) {
      if (command.includes('git log') || command.includes('git diff')) {
        estimatedTokens = estimate.avgTokens * 5
        factors.push('Git history/diff command - potentially large output')
        confidence = 'low'
      } else if (command.includes('ls') || command.includes('cat')) {
        estimatedTokens = estimate.avgTokens * 2
        factors.push('File listing/content command')
        confidence = 'medium'
      }
    }
  }
  
  if (toolName === 'WebFetch') {
    estimatedTokens = estimate.avgTokens * 2
    factors.push('Web content - variable size')
    confidence = 'low'
  }
  
  const previousCalls = context?.previousCalls || 0
  if (previousCalls > 0) {
    estimatedTokens = Math.min(estimatedTokens * (1 + previousCalls * 0.1), estimate.maxTokens)
    factors.push(`Previous calls: ${previousCalls}`)
  }
  
  const shouldWarn = estimatedTokens > 3000 || confidence === 'low'
  let recommendation: string | undefined
  
  if (shouldWarn) {
    if (estimatedTokens > 10000) {
      recommendation = `Consider using --limit or pagination to reduce output size`
    } else if (confidence === 'low') {
      recommendation = `Output size uncertain - monitor token usage`
    }
  }
  
  return {
    toolName,
    estimatedTokens: Math.round(estimatedTokens),
    confidence,
    factors,
    shouldWarn,
    recommendation,
  }
}

export function estimateBatchToolOutputs(
  toolCalls: Array<{ name: string; args?: Record<string, unknown> }>,
): ToolOutputEstimate[] {
  const callCounts: Record<string, number> = {}
  
  return toolCalls.map(call => {
    const previousCalls = callCounts[call.name] || 0
    callCounts[call.name] = previousCalls + 1
    
    return estimateToolOutput(call.name, {
      args: call.args,
      previousCalls,
    })
  })
}

export function checkToolBudget(context: ToolBudgetContext): ToolBudgetResult {
  const estimates = estimateBatchToolOutputs(
    context.plannedToolCalls.map(name => ({ name })),
  )
  
  const totalEstimatedTokens = estimates.reduce(
    (sum, e) => sum + e.estimatedTokens,
    context.reservedTokens,
  )
  
  const budgetAfterCalls: TokenBudgetInfo = {
    ...context.currentBudget,
    used: context.currentBudget.used + totalEstimatedTokens,
    remaining: Math.max(0, context.currentBudget.remaining - totalEstimatedTokens),
    percentage: Math.round(
      ((context.currentBudget.remaining - totalEstimatedTokens) / context.currentBudget.total) * 100,
    ),
    usedPercentage: Math.round(
      ((context.currentBudget.used + totalEstimatedTokens) / context.currentBudget.total) * 100,
    ),
  }
  
  const warnings: string[] = []
  const recommendations: string[] = []
  
  for (const estimate of estimates) {
    if (estimate.shouldWarn && estimate.recommendation) {
      warnings.push(`${estimate.toolName}: ${estimate.recommendation}`)
    }
  }
  
  if (budgetAfterCalls.percentage < 10) {
    warnings.push('CRITICAL: Tool calls would leave less than 10% context remaining')
    recommendations.push('Use /compact before making these tool calls')
  } else if (budgetAfterCalls.percentage < 25) {
    warnings.push('WARNING: Tool calls would leave less than 25% context remaining')
    recommendations.push('Consider reducing tool call scope or using /compact')
  }
  
  const canProceed = budgetAfterCalls.percentage >= 10
  
  if (!canProceed) {
    recommendations.push('Cannot proceed - insufficient context budget')
  }
  
  return {
    canProceed,
    estimates,
    totalEstimatedTokens,
    budgetAfterCalls,
    warnings,
    recommendations,
  }
}

export function getToolBudgetAdvice(toolName: string, currentBudget: TokenBudgetInfo): {
  shouldProceed: boolean
  advice: string
} {
  const estimate = estimateToolOutput(toolName)
  const remainingAfter = currentBudget.remaining - estimate.estimatedTokens
  const percentageAfter = Math.round((remainingAfter / currentBudget.total) * 100)
  
  if (percentageAfter < 10) {
    return {
      shouldProceed: false,
      advice: `Cannot proceed with ${toolName}. Would leave only ${percentageAfter}% context. Use /compact first.`,
    }
  }
  
  if (percentageAfter < 25) {
    return {
      shouldProceed: true,
      advice: `Warning: ${toolName} will leave ${percentageAfter}% context. Consider using /compact after this call.`,
    }
  }
  
  if (estimate.shouldWarn) {
    return {
      shouldProceed: true,
      advice: `${toolName} may use ~${estimate.estimatedTokens} tokens. ${estimate.recommendation || ''}`,
    }
  }
  
  return {
    shouldProceed: true,
    advice: `${toolName} estimated to use ~${estimate.estimatedTokens} tokens`,
  }
}

export function prioritizeToolCalls(
  toolCalls: Array<{ name: string; args?: Record<string, unknown>; priority?: number }>,
  budget: TokenBudgetInfo,
): Array<{ name: string; args?: Record<string, unknown>; included: boolean; reason: string }> {
  const sorted = [...toolCalls].sort((a, b) => {
    const priorityDiff = (b.priority || 0) - (a.priority || 0)
    if (priorityDiff !== 0) return priorityDiff
    
    const aEstimate = TOOL_OUTPUT_ESTIMATES[a.name] || TOOL_OUTPUT_ESTIMATES.default
    const bEstimate = TOOL_OUTPUT_ESTIMATES[b.name] || TOOL_OUTPUT_ESTIMATES.default
    return aEstimate.avgTokens - bEstimate.avgTokens
  })
  
  let remainingBudget = budget.remaining * 0.8
  const result: Array<{ name: string; args?: Record<string, unknown>; included: boolean; reason: string }> = []
  
  for (const call of sorted) {
    const estimate = estimateToolOutput(call.name, { args: call.args })
    
    if (estimate.estimatedTokens <= remainingBudget) {
      remainingBudget -= estimate.estimatedTokens
      result.push({ ...call, included: true, reason: 'Within budget' })
    } else {
      result.push({ 
        ...call, 
        included: false, 
        reason: `Would exceed budget (${estimate.estimatedTokens} tokens needed, ${Math.round(remainingBudget)} available)`,
      })
    }
  }
  
  return result
}
