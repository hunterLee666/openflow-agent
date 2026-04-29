import { PipelineContext, PipelineResult } from '../types'
import { createAskResult, createContinueResult } from '../PipelineEngine'

const SENSITIVE_PATTERNS = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/,
    family: 'aws_access_key',
  },
  {
    name: 'AWS Secret Key',
    pattern: /aws_secret_access_key\s*=\s*['"][^'"]+['"]/i,
    family: 'aws_secret_key',
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
    family: 'private_key',
  },
  {
    name: 'API Key Generic',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{20,}['"]/i,
    family: 'api_key',
  },
  {
    name: 'Database URL',
    pattern: /(?:mysql|postgres|mongodb|redis):\/\/[^:]+:[^@]+@/i,
    family: 'database_url',
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/,
    family: 'jwt_token',
  },
  {
    name: 'Password Field',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i,
    family: 'password',
  },
  {
    name: 'Stripe Key',
    pattern: /sk_live_[0-9a-zA-Z]{24}/,
    family: 'stripe_key',
  },
  {
    name: 'GitHub Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/,
    family: 'github_token',
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/,
    family: 'slack_token',
  },
]

export async function executeContentAsk(context: PipelineContext): Promise<PipelineResult> {
  const { tool, input } = context

  if (['Read', 'Grep', 'Glob'].includes(tool.name)) {
    const content = extractContentFromInput(input)
    if (content) {
      const result = scanForSensitiveContent(content)
      if (result) {
        return createAskResult(
          6,
          `Sensitive content detected: ${result.name}. This operation requires confirmation.`,
          {
            sensitiveType: result.family,
            toolName: tool.name,
          },
        )
      }
    }
  }

  if (['Write', 'Edit', 'MultiEdit'].includes(tool.name)) {
    const content = String(input.content || input.new_string || '')
    const result = scanForSensitiveContent(content)
    if (result) {
      return createAskResult(
        6,
        `Attempting to write sensitive content: ${result.name}. This operation requires confirmation.`,
        {
          sensitiveType: result.family,
          toolName: tool.name,
        },
      )
    }
  }

  if (tool.name === 'Bash') {
    const command = String(input.command || '')
    const result = scanForSensitiveContent(command)
    if (result) {
      return createAskResult(
        6,
        `Bash command contains sensitive content: ${result.name}. This operation requires confirmation.`,
        {
          sensitiveType: result.family,
          toolName: tool.name,
        },
      )
    }
  }

  return createContinueResult(6, 'No sensitive content detected')
}

function extractContentFromInput(input: Record<string, unknown>): string | null {
  if (typeof input.file_path === 'string') {
    return input.file_path
  }

  if (typeof input.pattern === 'string') {
    return input.pattern
  }

  if (typeof input.glob === 'string') {
    return input.glob
  }

  return null
}

function scanForSensitiveContent(content: string): { name: string; family: string } | null {
  for (const { name, pattern, family } of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      return { name, family }
    }
  }

  return null
}

export function redactSensitiveContent(content: string): string {
  let redacted = content

  for (const { pattern } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      if (match.length <= 8) {
        return '[REDACTED]'
      }
      return match.substring(0, 4) + '...' + '[REDACTED]'
    })
  }

  return redacted
}

export function hasSensitiveContent(content: string): boolean {
  for (const { pattern } of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      return true
    }
  }
  return false
}
