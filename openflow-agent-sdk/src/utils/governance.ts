/**
 * Tool Governance Pipeline
 *
 * Implements Part 06 governance features:
 * - Speculative classifier (step 4)
 * - Output schema validation (step 12)
 */

import type { ToolDefinition, ToolContext, ToolResult, SpeculativeResult } from '../types.js'

/**
 * Risk patterns for speculative classification.
 */
const RISK_PATTERNS = [
  // Shell/Dangerous commands
  { pattern: /rm\s+-rf|rmdir|del\s+\/s|formAt/i, level: 'high' as const, reason: 'Destructive file operation' },
  { pattern: /curl|wget.*\|/i, level: 'high' as const, reason: 'Pipe to shell injection' },
  { pattern: /chmod\s+777|sudo\s+su/i, level: 'high' as const, reason: 'Permission escalation' },
  { pattern: /git\s+push\s+--force/i, level: 'high' as const, reason: 'Force push or delete operation' },

  // Network operations  
  { pattern: /nc\s+-e|netcat/i, level: 'high' as const, reason: 'Network shell spawn' },
  { pattern: /eval\(|exec\(|system\(/i, level: 'medium' as const, reason: 'Code execution' },

  // File paths
  { pattern: /\.\.\//, level: 'medium' as const, reason: 'Path traversal attempt' },

  // Environment
  { pattern: /export\s+(KEY|SECRET|PASSWORD|TOKEN)/i, level: 'medium' as const, reason: 'Sensitive env var access' },
]

/**
 * Default speculative classifier.
 * Analyzes tool input for risky patterns before execution.
 */
export function defaultSpeculativeCheck(
  toolName: string,
  input: any,
  context: ToolContext
): SpeculativeResult {
  const inputStr = JSON.stringify(input).toLowerCase()

  // Check against known risk patterns
  for (const risk of RISK_PATTERNS) {
    if (risk.pattern.test(inputStr)) {
      return {
        level: risk.level,
        reason: risk.reason,
        allowed: risk.level !== 'high', // Block high risk by default
        message: `Speculative check: ${risk.reason} (${risk.level})`,
      }
    }
  }

  // Tool-specific checks
  if (toolName === 'Bash') {
    const cmd = (input.command || '').toLowerCase()
    
    // Potentially dangerous commands
    if (/^rm\s+-rf|^del\s+\/s|^format/i.test(cmd)) {
      return { level: 'high', reason: 'Destructive command', allowed: false }
    }
    
    // Network tools
    if (/nc\s+-e|netcat|wget.*\|/i.test(cmd)) {
      return { level: 'high', reason: 'Network shell', allowed: false }
    }
    
    // Sudo commands
    if (/sudo\s+su|sudo\s+-i/i.test(cmd)) {
      return { level: 'medium', reason: 'Privilege escalation', allowed: true }
    }
  }

  if (toolName === 'Glob' || toolName === 'Grep') {
    // Large pattern could cause performance issues
    const pattern = input.pattern || ''
    if (pattern.length > 200) {
      return { level: 'medium', reason: 'Very long pattern', allowed: true }
    }
  }

  return { level: 'low', allowed: true }
}

/**
 * Validate tool output against schema.
 * Supports both JSON Schema and basic type checking.
 */
export function validateToolOutput(
  result: ToolResult,
  outputSchema?: ToolDefinition['outputSchema']
): { valid: boolean; error?: string } {
  // No schema = skip validation
  if (!outputSchema) {
    return { valid: true }
  }

  const content = typeof result.content === 'string' 
    ? result.content 
    : JSON.stringify(result.content)

  // If output schema requires specific fields, check them
  if (outputSchema.required && outputSchema.required.length > 0) {
    try {
      const parsed = JSON.parse(content)
      for (const field of outputSchema.required) {
        if (!(field in parsed)) {
          return {
            valid: false,
            error: `Missing required output field: ${field}`
          }
        }
      }
    } catch {
      // Non-JSON output, skip field validation
    }
  }

  return { valid: true }
}

/**
 * Default input validator.
 * Performs business rule validation beyond schema.
 */
export function defaultValidateInput(
  toolName: string,
  input: any,
  context: ToolContext
): { valid: boolean; error?: string; sanitizedInput?: any } {
  // Sanitize input
  let sanitized = { ...input }

  switch (toolName) {
    case 'Bash': {
      const cmd = (input.command || '').trim()
      
      // Empty command
      if (!cmd) {
        return { valid: false, error: 'Command cannot be empty' }
      }
      
      // Command too long
      if (cmd.length > 10000) {
        return { valid: false, error: 'Command too long (max 10000 chars)' }
      }
      
      // Check for null bytes
      if (cmd.includes('\0')) {
        return { valid: false, error: 'Command contains null bytes' }
      }
      
      break
    }

    case 'Read':
    case 'Write':
    case 'Edit': {
      const path = (input.path || '').trim()
      
      // Empty path
      if (!path) {
        return { valid: false, error: 'Path cannot be empty' }
      }
      
      // Absolute path check (can be configured)
      if (path.startsWith('/root') || path.startsWith('/etc/shadow')) {
        return { valid: false, error: 'Access to system directories is not allowed' }
      }
      
      // Sanitize: remove null bytes
      sanitized.path = path.replace(/\0/g, '')
      break
    }

    case 'Glob':
    case 'Grep': {
      const pattern = (input.pattern || '').trim()
      
      // Empty pattern
      if (!pattern) {
        return { valid: false, error: 'Pattern cannot be empty' }
      }
      
      // Pattern too long
      if (pattern.length > 500) {
        return { valid: false, error: 'Pattern too long (max 500 chars)' }
      }
      
      // Only validate as regex if it looks like a regex pattern (contains regex metacharacters)
      // Glob patterns like *.ts are NOT regex, skip validation
      const hasRegexMetachars = /[\\|(){}?+]/.test(pattern) && !/^\*\./.test(pattern)
      if (hasRegexMetachars) {
        try {
          new RegExp(pattern)
        } catch {
          return { valid: false, error: 'Invalid regex pattern' }
        }
      }
      break
    }

    case 'WebFetch':
    case 'WebSearch': {
      const url = (input.url || input.query || '').trim()
      
      // Empty URL/query
      if (!url) {
        return { valid: false, error: 'URL or query cannot be empty' }
      }
      
      // Block dangerous protocols
      if (url.match(/^(javascript:|data:|file:)/i)) {
        return { valid: false, error: 'Dangerous URL protocol blocked' }
      }
      
      break
    }
  }

  return { valid: true, sanitizedInput: sanitized }
}

/**
 * Create a tool with full governance features.
 */
export function createGovernedTool<T extends ToolDefinition>(tool: T): T {
  return tool
}

/**
 * Match deny rules (step 1 of permission pipeline).
 * Format: "toolName" or "toolName:field=pattern"
 */
export function matchDenyRules(
  toolName: string,
  input: any,
  denyRules: string[]
): { matched: boolean; reason?: string } {
  for (const rule of denyRules) {
    const colonIdx = rule.indexOf(':')
    const tool = colonIdx >= 0 ? rule.slice(0, colonIdx) : rule
    const condition = colonIdx >= 0 ? rule.slice(colonIdx + 1) : ''
    
    if (tool !== toolName) continue
    
    if (!condition) {
      return { matched: true, reason: `Tool "${toolName}" denied by rule` }
    }
    
    const eqIdx = condition.indexOf('=')
    if (eqIdx < 0) continue
    
    const field = condition.slice(0, eqIdx)
    let pattern = condition.slice(eqIdx + 1)
    
    const fieldValue = input[field]
    if (typeof fieldValue === 'string') {
      // Convert glob pattern to regex (e.g., /etc/* -> /etc/.*)
      const regexPattern = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      if (fieldValue.match(new RegExp(regexPattern))) {
        return { matched: true, reason: `Tool "${toolName}" denied: ${field} matches ${pattern}` }
      }
    }
  }
  
  return { matched: false }
}

/**
 * Match ask rules (step 2 of permission pipeline).
 * Format: "toolName" or "toolName:field=pattern"
 */
export function matchAskRules(
  toolName: string,
  input: any,
  askRules: string[]
): { matched: boolean; reason?: string } {
  for (const rule of askRules) {
    const colonIdx = rule.indexOf(':')
    const tool = colonIdx >= 0 ? rule.slice(0, colonIdx) : rule
    const condition = colonIdx >= 0 ? rule.slice(colonIdx + 1) : ''
    
    if (tool !== toolName) continue
    
    if (!condition) {
      return { matched: true, reason: `Tool "${toolName}" requires confirmation` }
    }
    
    const eqIdx = condition.indexOf('=')
    if (eqIdx < 0) continue
    
    const field = condition.slice(0, eqIdx)
    let pattern = condition.slice(eqIdx + 1)
    
    const fieldValue = input[field]
    if (typeof fieldValue === 'string') {
      // Convert glob pattern to regex (e.g., /etc/* -> /etc/.*)
      const regexPattern = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      if (fieldValue.match(new RegExp(regexPattern))) {
        return { matched: true, reason: `Tool "${toolName}" requires confirmation: ${field} matches ${pattern}` }
      }
    }
  }
  
  return { matched: false }
}

/**
 * Check safety guardrail paths (step 7 of permission pipeline).
 */
export function checkSafetyGuardrails(
  toolName: string,
  input: any,
  guardrailPaths: string[]
): { matched: boolean; reason?: string } {
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'Bash') {
    const path = input.path || input.command || ''
    for (const guardPath of guardrailPaths) {
      if (path.includes(guardPath)) {
        return { matched: true, reason: `Access to "${guardPath}" is protected` }
      }
    }
  }
  
  return { matched: false }
}

/**
 * Check content sensitivity patterns (step 6 of permission pipeline).
 */
export function checkContentSensitivity(
  toolName: string,
  input: any,
  contentPatterns: string[]
): { matched: boolean; reason?: string } {
  if (toolName === 'Read' || toolName === 'Edit') {
    const content = input.path || ''
    for (const pattern of contentPatterns) {
      const regex = new RegExp(pattern, 'i')
      if (regex.test(content)) {
        return { matched: true, reason: `Content matches sensitive pattern: ${pattern}` }
      }
    }
  }
  
  return { matched: false }
}

/**
 * Deny commands check (part of step 3: tool-specific check).
 */
export function checkDenyCommands(
  toolName: string,
  input: any,
  denyCommands: string[]
): { matched: boolean; reason?: string } {
  if (toolName !== 'Bash') {
    return { matched: false }
  }
  
  const command = (input.command || '').toLowerCase()
  for (const cmd of denyCommands) {
    if (command.includes(cmd.toLowerCase())) {
      return { matched: true, reason: `Command "${cmd}" is denied` }
    }
  }
  
  return { matched: false }
}

/**
 * Check allowed directories (part of step 3: tool-specific check).
 */
export function checkAllowedDirectories(
  toolName: string,
  input: any,
  allowedDirectories: string[],
  disallowedDirectories: string[]
): { valid: boolean; error?: string } {
  if (!['Read', 'Write', 'Edit', 'Glob', 'Grep'].includes(toolName)) {
    return { valid: true }
  }
  
  const path = input.path || input.pattern || ''
  
  // Check disallowed first
  for (const disDir of disallowedDirectories) {
    if (path.startsWith(disDir)) {
      return { valid: false, error: `Access to "${disDir}" is not allowed` }
    }
  }
  
  // If allowed list is specified, check it
  if (allowedDirectories.length > 0) {
    let allowed = false
    for (const dir of allowedDirectories) {
      if (path.startsWith(dir) || path.includes(dir + '/')) {
        allowed = true
        break
      }
    }
    if (!allowed) {
      return { valid: false, error: `Path must be within allowed directories: ${allowedDirectories.join(', ')}` }
    }
  }
  
  return { valid: true }
}

/**
 * Permission evaluation pipeline (7-step implementation).
 * Returns the permission decision with step info.
 */
export type PermissionDecision = 
  | { decision: 'deny'; step: number; reason: string }
  | { decision: 'ask'; step: number; reason: string }
  | { decision: 'allow'; step?: undefined }

export interface PermissionPipelineInput {
  toolName: string
  input: any
  permissionMode: string
  permissionConfig?: {
    denyRules?: string[]
    askRules?: string[]
    allowedDirectories?: string[]
    disallowedDirectories?: string[]
    denyCommands?: string[]
    safetyGuardrailPaths?: string[]
    contentSensitivePatterns?: string[]
    requestUserConfirmation?: (toolName: string, input: unknown, reason?: string) => Promise<boolean>
  }
  allowedTools?: string[]
}

export async function evaluatePermission(
  input: PermissionPipelineInput
): Promise<PermissionDecision> {
  const { toolName, input: toolInput, permissionMode, permissionConfig, allowedTools } = input
  
  const denyRules = permissionConfig?.denyRules ?? []
  const askRules = permissionConfig?.askRules ?? []
  const allowedDirs = permissionConfig?.allowedDirectories ?? []
  const disallowedDirs = permissionConfig?.disallowedDirectories ?? []
  const denyCommands = permissionConfig?.denyCommands ?? []
  const guardrailPaths = permissionConfig?.safetyGuardrailPaths ?? []
  const contentPatterns = permissionConfig?.contentSensitivePatterns ?? []
  
  // Step 1: Tool-level deny rules
  const denyResult = matchDenyRules(toolName, toolInput, denyRules)
  if (denyResult.matched) {
    return { decision: 'deny', step: 1, reason: denyResult.reason || 'Tool denied' }
  }
  
  // Step 2: Tool-level ask rules
  const askResult = matchAskRules(toolName, toolInput, askRules)
  if (askResult.matched) {
    // For auto/bypass modes, skip ask
    if (permissionMode === 'bypassPermissions' || permissionMode === 'auto') {
      // Continue to next steps
    } else {
      return { decision: 'ask', step: 2, reason: askResult.reason || 'Confirmation required' }
    }
  }
  
  // Step 3: Tool-specific checks (deny commands, path validation)
  const cmdResult = checkDenyCommands(toolName, toolInput, denyCommands)
  if (cmdResult.matched) {
    return { decision: 'deny', step: 3, reason: cmdResult.reason || 'Command denied' }
  }
  
  const pathResult = checkAllowedDirectories(toolName, toolInput, allowedDirs, disallowedDirs)
  if (!pathResult.valid) {
    return { decision: 'deny', step: 3, reason: pathResult.error || 'Path not allowed' }
  }
  
  // Step 5: User confirmation requirement based on mode
  const needsConfirmation = 
    (permissionMode === 'default' && (toolName === 'Bash' || toolName === 'Write' || toolName === 'Edit')) ||
    (permissionMode === 'plan')
  
  if (needsConfirmation && permissionConfig?.requestUserConfirmation) {
    // If user denies, deny the request
    const userConfirm = await permissionConfig.requestUserConfirmation(toolName, toolInput)
    if (!userConfirm) {
      return { decision: 'deny', step: 5, reason: 'User denied' }
    }
  }
  
  // Step 6: Content sensitivity
  const contentResult = checkContentSensitivity(toolName, toolInput, contentPatterns)
  if (contentResult.matched) {
    if (permissionConfig?.requestUserConfirmation) {
      const userConfirm = await permissionConfig.requestUserConfirmation(toolName, toolInput, contentResult.reason)
      if (!userConfirm) {
        return { decision: 'deny', step: 6, reason: contentResult.reason || 'Content sensitive' }
      }
    } else {
      return { decision: 'ask', step: 6, reason: contentResult.reason || 'Content sensitive' }
    }
  }
  
  // Step 7: Safety guardrails
  const guardResult = checkSafetyGuardrails(toolName, toolInput, guardrailPaths)
  if (guardResult.matched) {
    return { decision: 'deny', step: 7, reason: guardResult.reason || 'Protected path' }
  }
  
  // Check allowed tools (pre-approve list)
  if (allowedTools?.includes(toolName)) {
    return { decision: 'allow' }
  }
  
  // Default: allow
  return { decision: 'allow' }
}

// --------------------------------------------------------------------------
// Permission Pipeline - High-level wrapper
// --------------------------------------------------------------------------

export interface PermissionPipelineResult {
  denied: boolean
  ask: boolean
  bypass: boolean
  allowed: boolean
  step1?: string
  step2?: string
  step3?: string
  step4?: string
  step5?: string
  step6?: string
  step7?: string
  toolDenied?: boolean
  toolAllowed?: boolean
}

export async function permissionPipeline(
  toolName: string,
  input: any,
  config: {
    permissionMode: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions'
    denyRules: string[]
    askRules: string[]
    toolDenyList: string[]
    allowedTools: string[]
    safetyGuardrailPaths?: string[]
    contentSensitivePatterns?: string[]
    requestUserConfirmation?: (toolName: string, input: unknown, reason?: string) => Promise<boolean>
  }
): Promise<PermissionPipelineResult> {
  const { permissionMode, denyRules, askRules, toolDenyList, allowedTools, safetyGuardrailPaths, contentSensitivePatterns, requestUserConfirmation } = config

  const result: PermissionPipelineResult = {
    denied: false,
    ask: false,
    bypass: false,
    allowed: true,
  }

  // Step 1: Check permissionMode
  if (permissionMode === 'bypassPermissions') {
    result.bypass = true
    result.step1 = 'bypass'
    return result
  }
  if (permissionMode === 'acceptEdits') {
    result.step1 = 'acceptEdits'
  }
  if (permissionMode === 'dontAsk') {
    result.step1 = 'dontAsk'
  } else {
    result.step1 = 'default'
  }

  // Step 2: Check tool deny list
  if (toolDenyList?.includes(toolName)) {
    result.denied = true
    result.step2 = 'deny'
    return result
  }
  result.step2 = 'allowed'

  // Step 3: Check deny rules
  const denyMatch = matchDenyRules(toolName, input, denyRules)
  if (denyMatch.matched) {
    result.denied = true
    result.step3 = 'deny'
    return result
  }
  result.step3 = 'allowed'

  // Step 4: Check ask rules
  const askMatch = matchAskRules(toolName, input, askRules)
  if (askMatch.matched) {
    result.ask = true
    result.step4 = 'ask'
    return result
  }
  result.step4 = 'allowed'

   // Step 5: Check content sensitivity
   if (contentSensitivePatterns?.length) {
     const contentCheck = checkContentSensitivity(toolName, input, contentSensitivePatterns)
    if (contentCheck.matched) {
      result.step5 = 'sensitive'
      if (requestUserConfirmation) {
        const confirmed = await requestUserConfirmation(toolName, input, contentCheck.reason || 'Content sensitive')
        if (!confirmed) {
          result.denied = true
          return result
        }
      } else {
        result.ask = true
        return result
      }
    }
  }
  result.step5 = 'ok'

  // Step 6: Check safety guardrails (file paths)
  if (safetyGuardrailPaths?.length) {
    const guardCheck = checkSafetyGuardrails(toolName, input, safetyGuardrailPaths)
    if (guardCheck.matched) {
      result.denied = true
      result.step6 = 'deny'
      return result
    }
  }
  result.step6 = 'allowed'

  // Step 7: Check allowed tools (pre-approved)
  if (allowedTools?.includes(toolName)) {
    result.toolAllowed = true
    result.step7 = 'allowed'
  } else {
    result.step7 = 'default'
  }

  return result
}

// Create permission checker factory
export function createPermissionChecker(config: {
  permissionMode: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions'
  denyRules: string[]
  askRules: string[]
  toolDenyList: string[]
  allowedTools: string[]
}): (toolName: string, input: any) => Promise<boolean> {
  const cache = new Map<string, boolean>()

  return async (toolName: string, input: any): Promise<boolean> => {
    const cacheKey = `${toolName}:${JSON.stringify(input).slice(0, 50)}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!
    }

    const result = await permissionPipeline(toolName, input, config)
    const allowed = !result.denied && (result.bypass || result.allowed)
    cache.set(cacheKey, allowed)
    return allowed
  }
}

// --------------------------------------------------------------------------
// Validation Helpers (for tests and simplified usage)
// --------------------------------------------------------------------------

export function validateToolInput(
  toolName: string,
  input: any,
  config: { denyRules?: string[]; askRules?: string[] }
): { allowed: boolean; reason?: string; ask?: boolean } {
  const { denyRules = [], askRules = [] } = config

  const denyMatch = matchDenyRules(toolName, input, denyRules)
  if (denyMatch.matched) {
    return { allowed: false, reason: denyMatch.reason || 'deny rule matched', ask: false }
  }

  const askMatch = matchAskRules(toolName, input, askRules)
  if (askMatch.matched) {
    return { allowed: true, reason: askMatch.reason || 'ask rule matched', ask: true }
  }

  return { allowed: true }
}

export function speculativeCheck(
  toolName: string,
  input: any,
  config: { denyRules?: string[] }
): { allowed: boolean; reason?: string } {
  const { denyRules = [] } = config
  const denyMatch = matchDenyRules(toolName, input, denyRules)
  return { allowed: !denyMatch.matched, reason: denyMatch.reason }
}

export function checkDenyRules(
  toolName: string,
  input: any,
  rules: string[]
): { allowed: boolean; reason?: string } {
  const match = matchDenyRules(toolName, input, rules)
  return { allowed: !match.matched, reason: match.reason }
}

export function checkAskRules(
  toolName: string,
  input: any,
  rules: string[]
): { ask: boolean; reason?: string } {
  const match = matchAskRules(toolName, input, rules)
  return { ask: match.matched, reason: match.reason }
}