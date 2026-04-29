export interface InjectionPattern {
  name: string
  pattern: RegExp
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  action: 'sanitize' | 'block' | 'warn'
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'prompt_injection',
    pattern: /\b(ignore|disregard|skip|bypass)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|constraints?)/gi,
    severity: 'critical',
    description: 'Attempt to override system instructions',
    action: 'block',
  },
  {
    name: 'role_manipulation',
    pattern: /\b(you\s+are|act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(now|a|an)\s+(developer|admin|root|system|assistant)/gi,
    severity: 'high',
    description: 'Attempt to manipulate agent role',
    action: 'warn',
  },
  {
    name: 'system_override',
    pattern: /\b(system|admin|root|sudo)\s*(prompt|instruction|command|mode)\b/gi,
    severity: 'high',
    description: 'Attempt to access system mode',
    action: 'warn',
  },
  {
    name: 'data_exfiltration',
    pattern: /\b(send|transmit|exfiltrate|upload|post)\s+(all\s+)?(data|files?|secrets?|credentials?|keys?)/gi,
    severity: 'critical',
    description: 'Potential data exfiltration attempt',
    action: 'block',
  },
  {
    name: 'code_execution_bypass',
    pattern: /\b(exec|eval|Function|constructor)\s*\(/gi,
    severity: 'critical',
    description: 'JavaScript code execution attempt',
    action: 'block',
  },
  {
    name: 'shell_injection',
    pattern: /[`$]\([^)]+\)|\$\{[^}]+\}|`[^`]+`/g,
    severity: 'high',
    description: 'Shell command injection pattern',
    action: 'sanitize',
  },
  {
    name: 'path_traversal',
    pattern: /\.\.[\/\\]/g,
    severity: 'high',
    description: 'Path traversal attempt',
    action: 'sanitize',
  },
  {
    name: 'credential_pattern',
    pattern: /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*[=:]\s*['"]?[^'"\s]+['"]?/gi,
    severity: 'medium',
    description: 'Credential pattern detected',
    action: 'warn',
  },
  {
    name: 'base64_encoded',
    pattern: /\b(?:[A-Za-z0-9+/]{40,}={0,2})\b/g,
    severity: 'low',
    description: 'Potential base64 encoded content',
    action: 'warn',
  },
  {
    name: 'unicode_obfuscation',
    pattern: /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u202A-\u202E]/g,
    severity: 'medium',
    description: 'Unicode obfuscation detected',
    action: 'sanitize',
  },
]

export interface SanitizationResult {
  original: string
  sanitized: string
  wasModified: boolean
  detections: Array<{
    pattern: InjectionPattern
    matches: string[]
  }>
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  blocked: boolean
  warnings: string[]
}

export function sanitizeMcpInput(input: string): SanitizationResult {
  const detections: Array<{ pattern: InjectionPattern; matches: string[] }> = []
  let sanitized = input
  const warnings: string[] = []
  let blocked = false
  let maxSeverity: 'safe' | 'low' | 'medium' | 'high' | 'critical' = 'safe'

  for (const pattern of INJECTION_PATTERNS) {
    const matches = input.match(pattern.pattern)
    if (matches && matches.length > 0) {
      detections.push({ pattern, matches })

      if (pattern.severity === 'critical') {
        maxSeverity = 'critical'
      } else if (pattern.severity === 'high' && maxSeverity !== 'critical') {
        maxSeverity = 'high'
      } else if (pattern.severity === 'medium' && maxSeverity !== 'critical' && maxSeverity !== 'high') {
        maxSeverity = 'medium'
      } else if (pattern.severity === 'low' && maxSeverity === 'safe') {
        maxSeverity = 'low'
      }

      if (pattern.action === 'block') {
        blocked = true
        warnings.push(`Blocked: ${pattern.description}`)
      } else if (pattern.action === 'sanitize') {
        sanitized = sanitized.replace(pattern.pattern, (match) => {
          return '[SANITIZED]'
        })
        warnings.push(`Sanitized: ${pattern.description}`)
      } else if (pattern.action === 'warn') {
        warnings.push(`Warning: ${pattern.description}`)
      }
    }
  }

  return {
    original: input,
    sanitized,
    wasModified: sanitized !== input,
    detections,
    riskLevel: maxSeverity,
    blocked,
    warnings,
  }
}

export function sanitizeMcpOutput(output: string): SanitizationResult {
  const detections: Array<{ pattern: InjectionPattern; matches: string[] }> = []
  let sanitized = output
  const warnings: string[] = []
  let maxSeverity: 'safe' | 'low' | 'medium' | 'high' | 'critical' = 'safe'

  const outputPatterns = INJECTION_PATTERNS.filter(p =>
    ['credential_pattern', 'base64_encoded', 'unicode_obfuscation'].includes(p.name)
  )

  for (const pattern of outputPatterns) {
    const matches = output.match(pattern.pattern)
    if (matches && matches.length > 0) {
      detections.push({ pattern, matches })

      if (pattern.action === 'sanitize') {
        sanitized = sanitized.replace(pattern.pattern, (match) => {
          return '[REDACTED]'
        })
        warnings.push(`Redacted: ${pattern.description}`)
      }
    }
  }

  return {
    original: output,
    sanitized,
    wasModified: sanitized !== output,
    detections,
    riskLevel: detections.length > 0 ? 'medium' : 'safe',
    blocked: false,
    warnings,
  }
}

export function validateMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const result = sanitizeMcpInput(value)
      if (result.blocked) {
        errors.push(`Parameter "${key}" contains blocked content: ${result.warnings.join(', ')}`)
      } else if (result.warnings.length > 0) {
        warnings.push(`Parameter "${key}": ${result.warnings.join(', ')}`)
      }
    }
  }

  const dangerousToolPatterns = [
    { pattern: /exec|eval|run|invoke/i, severity: 'warning' },
    { pattern: /delete|remove|destroy|wipe/i, severity: 'warning' },
    { pattern: /write|update|modify|change/i, severity: 'info' },
  ]

  for (const { pattern, severity } of dangerousToolPatterns) {
    if (pattern.test(toolName)) {
      if (severity === 'warning') {
        warnings.push(`Tool "${toolName}" may have destructive effects`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export function createMcpSecurityMiddleware() {
  return {
    async interceptInput(
      toolName: string,
      args: Record<string, unknown>,
    ): Promise<{ proceed: boolean; modifiedArgs?: Record<string, unknown>; warnings: string[] }> {
      const validation = validateMcpToolCall(toolName, args)

      if (!validation.valid) {
        return {
          proceed: false,
          warnings: validation.errors,
        }
      }

      const modifiedArgs: Record<string, unknown> = {}
      let wasModified = false

      for (const [key, value] of Object.entries(args)) {
        if (typeof value === 'string') {
          const result = sanitizeMcpInput(value)
          if (result.wasModified) {
            modifiedArgs[key] = result.sanitized
            wasModified = true
          } else {
            modifiedArgs[key] = value
          }
        } else {
          modifiedArgs[key] = value
        }
      }

      return {
        proceed: true,
        modifiedArgs: wasModified ? modifiedArgs : undefined,
        warnings: validation.warnings,
      }
    },

    async interceptOutput(
      toolName: string,
      output: unknown,
    ): Promise<{ output: unknown; warnings: string[] }> {
      if (typeof output === 'string') {
        const result = sanitizeMcpOutput(output)
        return {
          output: result.sanitized,
          warnings: result.warnings,
        }
      }

      if (typeof output === 'object' && output !== null) {
        const sanitized: Record<string, unknown> = {}
        const warnings: string[] = []

        for (const [key, value] of Object.entries(output as Record<string, unknown>)) {
          if (typeof value === 'string') {
            const result = sanitizeMcpOutput(value)
            sanitized[key] = result.sanitized
            warnings.push(...result.warnings)
          } else {
            sanitized[key] = value
          }
        }

        return { output: sanitized, warnings }
      }

      return { output, warnings: [] }
    },
  }
}

export type McpSecurityMiddleware = ReturnType<typeof createMcpSecurityMiddleware>
