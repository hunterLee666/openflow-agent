import type { Tool, ToolUseContext } from '@tool'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface RiskAssessment {
  level: RiskLevel
  score: number
  reasons: string[]
  requiresConfirmation: boolean
  suggestedActions?: string[]
}

export interface PostExecutionVerification {
  success: boolean
  issues: string[]
  warnings: string[]
  suggestions: string[]
}

export interface GovernanceContext {
  tool: Tool
  input: Record<string, unknown>
  context: ToolUseContext
  previousCalls?: Array<{
    toolName: string
    input: Record<string, unknown>
    result: unknown
  }>
}

const HIGH_RISK_PATTERNS = {
  bash: [
    { pattern: /rm\s+-rf/, reason: 'Destructive file deletion' },
    { pattern: /sudo/, reason: 'Elevated privileges required' },
    { pattern: /chmod\s+777/, reason: 'Insecure permissions' },
    { pattern: />\s*\/dev\/sd/, reason: 'Direct disk write' },
    { pattern: /mkfs/, reason: 'Filesystem formatting' },
    { pattern: /dd\s+if=/, reason: 'Disk imaging operation' },
    { pattern: /:()\s*{\s*:\|:&\s*}/, reason: 'Fork bomb detected' },
    { pattern: /curl.*\|\s*bash/, reason: 'Remote code execution' },
    { pattern: /wget.*\|\s*bash/, reason: 'Remote code execution' },
  ],
  filesystem: [
    { pattern: /\.env$/, reason: 'Environment file access' },
    { pattern: /\.pem$/, reason: 'Certificate file access' },
    { pattern: /\.key$/, reason: 'Key file access' },
    { pattern: /id_rsa/, reason: 'SSH private key access' },
    { pattern: /\.gitconfig$/, reason: 'Git configuration access' },
    { pattern: /credentials/, reason: 'Credentials file access' },
    { pattern: /password/, reason: 'Password file access' },
  ],
  network: [
    { pattern: /localhost:\d+/, reason: 'Local service access' },
    { pattern: /127\.0\.0\.1/, reason: 'Localhost access' },
    { pattern: /0\.0\.0\.0/, reason: 'All interfaces binding' },
  ],
}

const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LSP',
  'ToolSearch',
  'ListMcpResources',
])

const CONCURRENCY_SAFE_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LSP',
  'ToolSearch',
])

export async function assessRisk(
  governanceContext: GovernanceContext,
): Promise<RiskAssessment> {
  const { tool, input, context, previousCalls } = governanceContext
  const reasons: string[] = []
  let score = 0
  let level: RiskLevel = 'low'
  const suggestedActions: string[] = []

  if (READ_ONLY_TOOLS.has(tool.name)) {
    score += 0
    reasons.push('Read-only operation')
  } else if (tool.isReadOnly()) {
    score += 5
    reasons.push('Read-only tool with side effects possible')
  } else {
    score += 20
    reasons.push('Write operation')
    level = 'medium'
  }

  if (!CONCURRENCY_SAFE_TOOLS.has(tool.name) && !tool.isConcurrencySafe()) {
    score += 10
    reasons.push('Not concurrency-safe')
  }

  if (tool.name === 'Bash') {
    const command = String(input.command || '')
    for (const { pattern, reason } of HIGH_RISK_PATTERNS.bash) {
      if (pattern.test(command)) {
        score += 30
        reasons.push(reason)
        level = 'high'
      }
    }

    if (command.includes('&&') || command.includes('||')) {
      score += 5
      reasons.push('Compound command')
    }

    if (command.includes('|')) {
      score += 5
      reasons.push('Piped command')
    }

    if (/^\s*$/.test(command)) {
      score += 50
      reasons.push('Empty command')
      level = 'critical'
    }
  }

  if (['Write', 'Edit', 'MultiEdit'].includes(tool.name)) {
    const filePath = String(input.file_path || '')
    for (const { pattern, reason } of HIGH_RISK_PATTERNS.filesystem) {
      if (pattern.test(filePath)) {
        score += 40
        reasons.push(reason)
        level = 'high'
        suggestedActions.push('Consider using environment variables instead of files')
      }
    }

    if (filePath.includes('node_modules')) {
      score += 15
      reasons.push('Modifying node_modules')
      suggestedActions.push('Use package manager instead')
    }

    if (filePath.startsWith('/etc/') || filePath.startsWith('/usr/')) {
      score += 30
      reasons.push('System directory modification')
      level = 'high'
    }
  }

  if (['WebFetch', 'WebSearch'].includes(tool.name)) {
    const url = String(input.url || input.query || '')
    for (const { pattern, reason } of HIGH_RISK_PATTERNS.network) {
      if (pattern.test(url)) {
        score += 20
        reasons.push(reason)
        level = 'medium'
      }
    }
  }

  if (previousCalls && previousCalls.length > 0) {
    const recentWriteOps = previousCalls.filter(
      call => !READ_ONLY_TOOLS.has(call.toolName),
    ).length

    if (recentWriteOps > 5) {
      score += 10
      reasons.push('High frequency of write operations')
    }
  }

  if (context.options?.safeMode) {
    score += 15
    reasons.push('Safe mode enabled')
  }

  if (score >= 60) {
    level = 'critical'
  } else if (score >= 40) {
    level = 'high'
  } else if (score >= 20) {
    level = 'medium'
  } else {
    level = 'low'
  }

  return {
    level,
    score,
    reasons,
    requiresConfirmation: level === 'high' || level === 'critical',
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
  }
}

export async function verifyExecution(
  governanceContext: GovernanceContext,
  result: unknown,
  error?: Error,
): Promise<PostExecutionVerification> {
  const { tool, input } = governanceContext
  const issues: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  if (error) {
    issues.push(`Execution failed: ${error.message}`)

    if (error.message.includes('permission')) {
      suggestions.push('Check file permissions or run with appropriate privileges')
    }

    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      suggestions.push('Verify the path or resource exists')
    }

    if (error.message.includes('timeout')) {
      suggestions.push('Consider increasing timeout or optimizing the operation')
    }

    return {
      success: false,
      issues,
      warnings,
      suggestions,
    }
  }

  if (['Write', 'Edit', 'MultiEdit'].includes(tool.name)) {
    const filePath = String(input.file_path || '')

    if (filePath && !result) {
      warnings.push('File operation completed but no confirmation received')
    }

    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>
      if (resultObj.type === 'update' && !resultObj.structuredPatch) {
        warnings.push('File updated but diff not available for verification')
      }
    }
  }

  if (tool.name === 'Bash') {
    const command = String(input.command || '')

    if (typeof result === 'string') {
      if (result.includes('error') || result.includes('Error')) {
        warnings.push('Command output contains error messages')
      }

      if (result.includes('warning') || result.includes('Warning')) {
        warnings.push('Command output contains warning messages')
      }

      if (result.length === 0 && !command.includes('mkdir') && !command.includes('touch')) {
        warnings.push('Command produced no output')
      }
    }
  }

  if (['WebFetch', 'WebSearch'].includes(tool.name)) {
    if (!result) {
      issues.push('No result returned from network operation')
    }

    if (typeof result === 'string' && result.includes('Error')) {
      issues.push('Network operation returned an error')
    }
  }

  return {
    success: issues.length === 0,
    issues,
    warnings,
    suggestions,
  }
}

export function createGovernancePipeline() {
  const callHistory: Array<{
    toolName: string
    input: Record<string, unknown>
    result: unknown
    timestamp: number
  }> = []

  return {
    async preExecute(
      tool: Tool,
      input: Record<string, unknown>,
      context: ToolUseContext,
    ): Promise<{ allowed: boolean; assessment: RiskAssessment }> {
      const assessment = await assessRisk({
        tool,
        input,
        context,
        previousCalls: callHistory.slice(-10),
      })

      return {
        allowed: assessment.level !== 'critical',
        assessment,
      }
    },

    async postExecute(
      tool: Tool,
      input: Record<string, unknown>,
      context: ToolUseContext,
      result: unknown,
      error?: Error,
    ): Promise<PostExecutionVerification> {
      const verification = await verifyExecution(
        { tool, input, context, previousCalls: callHistory },
        result,
        error,
      )

      callHistory.push({
        toolName: tool.name,
        input,
        result,
        timestamp: Date.now(),
      })

      if (callHistory.length > 100) {
        callHistory.shift()
      }

      return verification
    },

    getCallHistory() {
      return [...callHistory]
    },

    clearHistory() {
      callHistory.length = 0
    },
  }
}

export type GovernancePipeline = ReturnType<typeof createGovernancePipeline>
