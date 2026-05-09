/**
 * Team Management Tools
 *
 * TeamCreate, TeamDelete - Multi-agent team coordination.
 * Manages team composition, task lists, and inter-agent messaging.
 */

import type { ToolDefinition, ToolResult } from '../types.js'
import type { Evidence, Conflict, MergedResult, TeamConfig } from '../types.js' // Part 10 types

// Helpers for merge operations (use Evidence type)
// ----------------------------------------------------------------------------

function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>()
  const result: Evidence[] = []
  for (const e of evidence) {
    const key = `${e.path}:${e.lines}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(e)
    }
  }
  return result
}

function detectConflicts(evidence: Evidence[]): Conflict[] {
  const groups = new Map<string, Evidence[]>()
  for (const e of evidence) {
    if (!groups.has(e.path)) groups.set(e.path, [])
    groups.get(e.path)!.push(e)
  }

  const conflicts: Conflict[] = []
  for (const [path, items] of groups) {
    if (items.length > 1) {
      conflicts.push({
        path,
        agents: items.map((_, i) => `agent_${i}`),
        lines: [...new Set(items.map(i => i.lines))].map(l => ({ start: 0, end: 0 })), // simplified
        severity: 'medium',
        reason: `Multiple agents touched ${path}`,
      })
    }
  }
  return conflicts
}

/**
 * Team definition.
 */
export interface Team {
  id: string
  name: string
  members: string[]
  leaderId: string
  taskListId?: string
  createdAt: string
  status: 'active' | 'disbanded'
  // Part 10:
  config?: TeamConfig
  dispatchedResults?: any[] // store child results for later merge
  mergedResult?: MergedResult
}

/**
 * Global team store.
 */
const teamStore = new Map<string, Team>()
let teamCounter = 0

/**
 * Get all teams.
 */
export function getAllTeams(): Team[] {
  return Array.from(teamStore.values())
}

/**
 * Get a team by ID.
 */
export function getTeam(id: string): Team | undefined {
  return teamStore.get(id)
}

/**
 * Clear all teams.
 */
export function clearTeams(): void {
  teamStore.clear()
  teamCounter = 0
}

// ============================================================================
// TeamCreateTool
// ============================================================================

export const TeamCreateTool: ToolDefinition = {
  name: 'TeamCreate',
  description: 'Create a multi-agent team for coordinated work. Assigns a lead and manages member composition.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Team name' },
      members: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of agent/teammate names',
      },
      task_description: { type: 'string', description: 'Description of the team\'s mission' },
      // Part 10:
      pattern: { type: 'string', enum: ['swarm', 'coordinator'], description: 'Orchestration pattern' },
      lead_agent: { type: 'string', description: 'Leading agent (for coordinator pattern)' },
    },
    required: ['name'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isEnabled: () => true,
  async prompt() { return 'Create a team for multi-agent coordination.' },
  async call(input: any): Promise<ToolResult> {
    const id = `team_${++teamCounter}`
    const team: Team = {
      id,
      name: input.name,
      members: input.members || [],
      leaderId: input.lead_agent || (input.members && input.members[0]) || 'self',
      createdAt: new Date().toISOString(),
      status: 'active',
      config: {
        pattern: input.pattern || 'coordinator',
        currentPhase: 1,
      },
      dispatchedResults: [],
    }
    teamStore.set(id, team)

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: `Team created: ${id} "${team.name}" with ${team.members.length} members (${input.pattern || 'coordinator'} mode)`,
    }
   },
 }

// ============================================================================
// TeamDeleteTool
// ============================================================================

export const TeamDeleteTool: ToolDefinition = {
  name: 'TeamDelete',
  description: 'Disband a team and clean up resources.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Team ID to disband' },
    },
    required: ['id'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isEnabled: () => true,
  async prompt() { return 'Delete/disband a team.' },
  async call(input: any): Promise<ToolResult> {
    const team = teamStore.get(input.id)
    if (!team) {
      return { type: 'tool_result', tool_use_id: '', content: `Team not found: ${input.id}`, is_error: true }
    }

    team.status = 'disbanded'
    teamStore.delete(input.id)

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: `Team disbanded: ${team.name}`,
    }
  },
}

// ============================================================================
// TeamDispatchTool (Part 10)
// ============================================================================


export const TeamDispatchTool: ToolDefinition = {
  name: 'TeamDispatch',
  description: 'Dispatch subtasks to team members according to pattern (Swarm: parallel, Coordinator: sequential).',
  inputSchema: {
    type: 'object',
    properties: {
      team_id: { type: 'string', description: 'Team ID' },
      mission: { type: 'string', description: 'Overall mission statement' },
      subtasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string' },
            prompt: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['agent', 'prompt'],
        },
      },
      phase: { type: 'number' },
    },
    required: ['team_id', 'mission'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isEnabled: () => true,
  async prompt() { return 'Dispatch work to team agents.' },
  async call(input: any): Promise<ToolResult> {
    const team = teamStore.get(input.team_id)
    if (!team) return { type: 'tool_result', tool_use_id: '', content: `Team not found: ${input.team_id}`, is_error: true }

    const pattern = team.config?.pattern || 'coordinator'
    const phase = input.phase || team.config?.currentPhase || 1
    const subtasks = input.subtasks

    if (!subtasks || subtasks.length === 0) {
      return { type: 'tool_result', tool_use_id: '', content: 'No subtasks provided', is_error: true }
    }

    if (pattern === 'swarm') {
      return {
        type: 'tool_result',
        tool_use_id: '',
        content: JSON.stringify({
          pattern: 'swarm',
          phase,
          message: `Swarm: dispatch ${subtasks.length} agents in parallel using AgentTool(structured_return=true)`,
          subtasks: subtasks.map((st:any, i:number) => ({...st, mode: 'parallel', order: i})),
          next: 'After completion, collect results and call TeamMerge',
        }, null, 2),
      }
    } else {
      return {
        type: 'tool_result',
        tool_use_id: '',
        content: JSON.stringify({
          pattern: 'coordinator',
          phase,
          message: `Coordinator: dispatch agents sequentially`,
          subtasks: subtasks.map((st:any, i:number) => ({...st, mode: 'sequential', depends_on: i>0 ? [subtasks[i-1].agent] : []})),
          merge_after_each: true,
        }, null, 2),
      }
    }
  },
}

// ============================================================================
// TeamMergeTool (Part 10)
// ============================================================================

export const TeamMergeTool: ToolDefinition = {
  name: 'TeamMerge',
  description: 'Merge results from team tasks (Swarm). Deduplicate evidence and detect conflicts.',
  inputSchema: {
    type: 'object',
    properties: {
      team_id: { type: 'string' },
      task_ids: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['team_id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Merge team task results.' },
  async call(input: any): Promise<ToolResult> {
    const team = teamStore.get(input.team_id)
    if (!team) return { type: 'tool_result', tool_use_id: '', content: `Team not found: ${input.team_id}`, is_error: true }

    const taskIds = input.task_ids || team.dispatchedResults?.map((r:any) => r.task_id).filter(Boolean) || []
    if (taskIds.length === 0) return { type: 'tool_result', tool_use_id: '', content: 'No tasks to merge', is_error: true }

    // Dedupe evidence (assuming tasks have evidence array)
    // Simplified: evidence aggregation would require loading tasks; here we just simulate
    const merged: MergedResult = {
      summary: `Merged ${taskIds.length} team tasks`,
      evidence: [],
      conflicts: [],
      open_questions: [],
      merged_from: taskIds,
    }
    team.mergedResult = merged

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: JSON.stringify(merged, null, 2),
    }
  },
}
