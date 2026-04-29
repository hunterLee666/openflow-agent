import type { AgentConfig } from './loader'

export type AgentMode = 'swarm' | 'coordinator'

export interface SwarmConfig {
  maxParallelAgents: number
  preferredAgentTypes: string[]
  convergenceThreshold: number
  timeoutMs: number
}

export interface CoordinatorConfig {
  phases: string[]
  maxWorkersPerPhase: number
  requireVerification: boolean
  sequentialModification: boolean
}

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxParallelAgents: 5,
  preferredAgentTypes: ['Explore', 'worker'],
  convergenceThreshold: 0.8,
  timeoutMs: 120000,
}

export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  phases: ['exploration', 'planning', 'execution', 'verification'],
  maxWorkersPerPhase: 3,
  requireVerification: true,
  sequentialModification: true,
}

export interface AgentDispatch {
  type: string
  description: string
  prompt: string
  readonly: boolean
  parallel: boolean
  dependsOn?: string[]
}

export interface PhasePlan {
  phase: number
  name: string
  agents: AgentDispatch[]
  gateCondition?: string
}

export function determineMode(taskDescription: string): AgentMode {
  const swarmKeywords = [
    'search',
    'find',
    'explore',
    'locate',
    'identify',
    'list',
    'scan',
    'investigate',
  ]

  const coordinatorKeywords = [
    'implement',
    'modify',
    'refactor',
    'fix',
    'update',
    'create',
    'delete',
    'migrate',
    'integrate',
  ]

  const lowerTask = taskDescription.toLowerCase()

  const swarmScore = swarmKeywords.filter(kw => lowerTask.includes(kw)).length
  const coordinatorScore = coordinatorKeywords.filter(kw => lowerTask.includes(kw)).length

  if (swarmScore > coordinatorScore) {
    return 'swarm'
  }

  if (coordinatorScore > 0) {
    return 'coordinator'
  }

  return 'swarm'
}

export function createSwarmPlan(
  taskDescription: string,
  agentTypes: string[],
  config: SwarmConfig = DEFAULT_SWARM_CONFIG,
): AgentDispatch[] {
  const dispatches: AgentDispatch[] = []
  const types = agentTypes.slice(0, config.maxParallelAgents)

  for (const type of types) {
    dispatches.push({
      type,
      description: `Swarm search: ${taskDescription.slice(0, 50)}`,
      prompt: `Search and explore: ${taskDescription}\n\nReport all relevant findings with file paths and line numbers.`,
      readonly: true,
      parallel: true,
    })
  }

  return dispatches
}

export function createCoordinatorPlan(
  taskDescription: string,
  config: CoordinatorConfig = DEFAULT_COORDINATOR_CONFIG,
): PhasePlan[] {
  const phases: PhasePlan[] = []

  phases.push({
    phase: 1,
    name: 'exploration',
    agents: [
      {
        type: 'Explore',
        description: 'Explore codebase for relevant files',
        prompt: `Find all files related to: ${taskDescription}\n\nReturn file paths with brief descriptions.`,
        readonly: true,
        parallel: true,
      },
    ],
    gateCondition: 'At least one relevant file found',
  })

  phases.push({
    phase: 2,
    name: 'planning',
    agents: [
      {
        type: 'Plan',
        description: 'Create implementation plan',
        prompt: `Create a detailed implementation plan for: ${taskDescription}\n\nInclude:\n- Files to modify\n- Line ranges\n- Expected changes\n- Verification steps`,
        readonly: true,
        parallel: false,
      },
    ],
    gateCondition: 'Plan is complete and actionable',
  })

  phases.push({
    phase: 3,
    name: 'execution',
    agents: [
      {
        type: 'worker',
        description: 'Execute implementation',
        prompt: `Implement the planned changes for: ${taskDescription}`,
        readonly: false,
        parallel: !config.sequentialModification,
      },
    ],
    gateCondition: 'All modifications complete',
  })

  if (config.requireVerification) {
    phases.push({
      phase: 4,
      name: 'verification',
      agents: [
        {
          type: 'verification',
          description: 'Verify implementation',
          prompt: `Verify the implementation for: ${taskDescription}\n\nRun Build/Test/Lint and adversarial probes.\nReturn PASS/FAIL/PARTIAL verdict.`,
          readonly: true,
          parallel: false,
        },
      ],
      gateCondition: 'Verification returns PASS or PARTIAL',
    })
  }

  return phases
}

export function selectAgentForTask(
  taskType: 'search' | 'read' | 'write' | 'verify' | 'plan',
  availableAgents: AgentConfig[],
): AgentConfig | null {
  const priorityMap: Record<string, string[]> = {
    search: ['Explore', 'general-purpose'],
    read: ['Explore', 'Plan', 'general-purpose'],
    write: ['worker', 'general-purpose'],
    verify: ['verification', 'general-purpose'],
    plan: ['Plan', 'solution-architect', 'general-purpose'],
  }

  const priorities = priorityMap[taskType] || ['general-purpose']

  for (const agentType of priorities) {
    const agent = availableAgents.find(a => a.agentType === agentType)
    if (agent) return agent
  }

  return availableAgents.find(a => a.agentType === 'general-purpose') || null
}

export function formatPhasePlan(phases: PhasePlan[]): string {
  const lines: string[] = ['# Coordinator Phase Plan', '']

  for (const phase of phases) {
    lines.push(`## Phase ${phase.phase}: ${phase.name}`)
    lines.push('')

    for (const agent of phase.agents) {
      const parallelText = agent.parallel ? '(parallel)' : '(sequential)'
      const readonlyText = agent.readonly ? '[readonly]' : '[read-write]'
      lines.push(`- ${agent.type} ${readonlyText} ${parallelText}: ${agent.description}`)
    }

    if (phase.gateCondition) {
      lines.push('')
      lines.push(`Gate: ${phase.gateCondition}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

export function shouldUseParallelExecution(
  agents: AgentDispatch[],
  touchedFiles: Map<string, string[]>,
): boolean {
  const fileAssignments = new Map<string, string[]>()

  for (const agent of agents) {
    if (!agent.readonly) {
      const files = touchedFiles.get(agent.description) || []
      for (const file of files) {
        const existing = fileAssignments.get(file) || []
        existing.push(agent.description)
        fileAssignments.set(file, existing)
      }
    }
  }

  for (const [, assignees] of fileAssignments) {
    if (assignees.length > 1) {
      return false
    }
  }

  return true
}

export function createExecutionOrder(
  agents: AgentDispatch[],
  dependencies: Map<string, string[]>,
): AgentDispatch[][] {
  const ordered: AgentDispatch[][] = []
  const assigned = new Set<string>()
  const remaining = [...agents]

  while (remaining.length > 0) {
    const parallel: AgentDispatch[] = []

    for (let i = remaining.length - 1; i >= 0; i--) {
      const agent = remaining[i]
      const deps = dependencies.get(agent.description) || []

      const allDepsMet = deps.every(dep => assigned.has(dep))

      if (allDepsMet) {
        parallel.push(agent)
        remaining.splice(i, 1)
        assigned.add(agent.description)
      }
    }

    if (parallel.length === 0) {
      ordered.push([remaining.shift()!])
    } else {
      ordered.push(parallel)
    }
  }

  return ordered
}
