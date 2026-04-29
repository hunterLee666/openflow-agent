export const FORK_PREFIX = 'Fork started — processing in background:'

export interface StructuredAgentResult {
  summary: string
  evidence: string[]
  touched_files?: string[]
  commands_run?: string[]
  open_questions?: string[]
  verdict?: 'PASS' | 'FAIL' | 'PARTIAL'
}

export interface AgentDispatchFormat {
  description: string
  subagent_type: string
  prompt: string
  readonly?: boolean
  run_in_background?: boolean
}

export function formatForkDescription(taskDescription: string): string {
  const words = taskDescription.trim().split(/\s+/).slice(0, 5).join(' ')
  return `${FORK_PREFIX} ${words}`
}

export function parseStructuredResult(text: string): StructuredAgentResult {
  const result: StructuredAgentResult = {
    summary: '',
    evidence: [],
  }

  const summaryMatch = text.match(/##\s*Summary\s*([\s\S]*?)(?=##|$)/i)
  if (summaryMatch) {
    result.summary = summaryMatch[1]?.trim() ?? ''
  }

  const evidenceMatch = text.match(/##\s*Evidence\s*([\s\S]*?)(?=##|$)/i)
  if (evidenceMatch) {
    const evidenceText = evidenceMatch[1]?.trim() ?? ''
    result.evidence = evidenceText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*'))
      .map(line => line.replace(/^[-*]\s*/, ''))
  }

  const filesMatch = text.match(/##\s*Files Changed\s*([\s\S]*?)(?=##|$)/i)
  if (filesMatch) {
    const filesText = filesMatch[1]?.trim() ?? ''
    result.touched_files = filesText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*'))
      .map(line => line.replace(/^[-*]\s*/, '').split(' ')[0] ?? '')
      .filter(Boolean)
  }

  const commandsMatch = text.match(/##\s*Commands Run\s*([\s\S]*?)(?=##|$)/i)
  if (commandsMatch) {
    const commandsText = commandsMatch[1]?.trim() ?? ''
    result.commands_run = commandsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*') || line.startsWith('`'))
      .map(line => line.replace(/^[-*]\s*/, '').replace(/`/g, ''))
  }

  const questionsMatch = text.match(/##\s*Open Questions\s*([\s\S]*?)(?=##|$)/i)
  if (questionsMatch) {
    const questionsText = questionsMatch[1]?.trim() ?? ''
    result.open_questions = questionsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*') || line.endsWith('?'))
      .map(line => line.replace(/^[-*]\s*/, ''))
  }

  const verdictMatch = text.match(/###?\s*VERDICT:\s*(PASS|FAIL|PARTIAL)/i)
  if (verdictMatch) {
    result.verdict = verdictMatch[1] as 'PASS' | 'FAIL' | 'PARTIAL'
  }

  return result
}

export function formatWorkerDispatch(options: {
  filePath: string
  lineRange?: string
  issue: string
  expected: string
  verifyCommand?: string
  forbidden?: string[]
}): string {
  const parts: string[] = []

  parts.push(`File: ${options.filePath}`)
  
  if (options.lineRange) {
    parts.push(`Lines: ${options.lineRange}`)
  }
  
  parts.push(`Issue: ${options.issue}`)
  parts.push(`Expected: ${options.expected}`)
  
  if (options.verifyCommand) {
    parts.push(`Verify: ${options.verifyCommand}`)
  }
  
  if (options.forbidden && options.forbidden.length > 0) {
    parts.push(`Forbidden: ${options.forbidden.join(', ')}`)
  }

  return parts.join('\n')
}

export function formatCoordinatorPhase(phase: number, description: string): string {
  return `## Phase ${phase}: ${description}`
}

export function formatAgentDispatchList(agents: Array<{
  type: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
}>): string {
  return agents
    .map((agent, index) => {
      const statusIcon = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
      }[agent.status]
      return `- Agent ${index + 1}: ${agent.type} - ${agent.description} - ${statusIcon}`
    })
    .join('\n')
}

export const ADVERSARIAL_PROBES = {
  api: [
    { name: 'empty_body', description: 'Send request with empty body' },
    { name: 'missing_headers', description: 'Send request without required headers' },
    { name: 'invalid_json', description: 'Send malformed JSON body' },
    { name: 'oversized_payload', description: 'Send payload > 1MB' },
    { name: 'special_chars', description: 'Inject special characters in inputs' },
    { name: 'sql_injection', description: 'Attempt SQL injection in parameters' },
    { name: 'xss_payload', description: 'Attempt XSS in input fields' },
  ],
  function: [
    { name: 'null_input', description: 'Pass null/undefined as input' },
    { name: 'empty_collection', description: 'Pass empty array/object' },
    { name: 'negative_number', description: 'Pass negative where positive expected' },
    { name: 'special_string', description: 'Pass string with special characters' },
    { name: 'boundary_values', description: 'Test with 0, MAX_INT, -1' },
  ],
  file: [
    { name: 'nonexistent_path', description: 'Access non-existent file path' },
    { name: 'permission_denied', description: 'Access path without permissions' },
    { name: 'symlink_attack', description: 'Follow malicious symlink' },
    { name: 'path_traversal', description: 'Attempt path traversal with ../' },
  ],
}

export function generateAdversarialProbeCommands(
  type: 'api' | 'function' | 'file',
  target: string,
): string[] {
  const probes = ADVERSARIAL_PROBES[type]
  return probes.map(probe => `# ${probe.name}: ${probe.description}`)
}

export const SWARM_MODE_CONFIG = {
  maxParallelAgents: 5,
  preferredAgentTypes: ['Explore', 'worker'],
  convergenceThreshold: 0.8,
}

export const COORDINATOR_MODE_CONFIG = {
  phases: ['exploration', 'planning', 'execution', 'verification'],
  maxWorkersPerPhase: 3,
  requireVerification: true,
}
