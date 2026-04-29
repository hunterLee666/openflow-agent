import { PipelineContext, PipelineResult } from '../types'
import { createDenyResult, createContinueResult } from '../PipelineEngine'

export async function executeToolDeny(context: PipelineContext): Promise<PipelineResult> {
  const { tool, input, toolPermissionContext } = context

  const deniedTools = toolPermissionContext?.alwaysDenyRules || {}
  const allDenied: string[] = []

  for (const source of Object.keys(deniedTools)) {
    const rules = deniedTools[source]
    if (Array.isArray(rules)) {
      allDenied.push(...rules)
    }
  }

  for (const rule of allDenied) {
    if (matchesToolRule(tool.name, rule)) {
      return createDenyResult(1, `Tool '${tool.name}' is denied by rule: ${rule}`, {
        rule,
        toolName: tool.name,
      })
    }

    if (tool.name === 'Bash' && matchesBashRule(input, rule)) {
      return createDenyResult(1, `Bash command is denied by rule: ${rule}`, {
        rule,
        toolName: tool.name,
      })
    }
  }

  const hardcodedDenyPatterns = [
    /^rm\s+-rf\s+\/$/,
    /^rm\s+-rf\s+~$/,
    /^:\(\)\{\s*:\|:\s*&\s*\};\s*:/,
    /^curl\s+.*\|\s*bash$/,
    /^wget\s+.*\|\s*sh$/,
    /^curl\s+.*\|\s*sh$/,
    /^wget\s+.*\|\s*bash$/,
  ]

  if (tool.name === 'Bash') {
    const command = String(input.command || '')
    for (const pattern of hardcodedDenyPatterns) {
      if (pattern.test(command)) {
        return createDenyResult(1, `Bash command matches dangerous pattern`, {
          pattern: pattern.source,
          command: command.substring(0, 100),
        })
      }
    }
  }

  return createContinueResult(1, 'No deny rules matched')
}

function matchesToolRule(toolName: string, rule: string): boolean {
  if (rule === toolName) return true
  if (rule === '*') return true
  if (rule.endsWith('*') && toolName.startsWith(rule.slice(0, -1))) return true
  return false
}

function matchesBashRule(input: Record<string, unknown>, rule: string): boolean {
  const command = String(input.command || '')
  if (command.includes(rule)) return true
  if (command.startsWith(rule)) return true

  const baseCommand = command.trim().split(/\s+/)[0]
  if (baseCommand === rule) return true

  return false
}
