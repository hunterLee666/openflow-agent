/**
 * Task Management Tools
 *
 * TaskCreate, TaskList, TaskUpdate, TaskGet, TaskStop, TaskOutput
 *
 * Provides in-memory task tracking for agent coordination.
 * Tasks persist across turns within a session.
 */

import type { ToolDefinition, ToolContext, ToolResult } from '../types.js'

/**
 * Task status.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

/**
 * Task entry.
 */
export interface Task {
  id: string
  subject: string
  description?: string
  status: TaskStatus
  owner?: string
  createdAt: string
  updatedAt: string
  output?: string
  blockedBy?: string[]
  blocks?: string[]
  metadata?: Record<string, unknown>
  // Part 10 additions:
  pattern?: 'swarm' | 'coordinator'
  phase?: number
  parentTaskId?: string
  evidence?: Array<{path: string, lines: string, note?: string}>
  conflictWith?: string[]
  result?: any // ChildResult
}

/**
 * Global task store (shared across tools in a session).
 */
const taskStore = new Map<string, Task>()

let taskCounter = 0

/**
 * Get all tasks.
 */
export function getAllTasks(): Task[] {
  return Array.from(taskStore.values())
}

/**
 * Get a task by ID.
 */
export function getTask(id: string): Task | undefined {
  return taskStore.get(id)
}

/**
 * Clear all tasks (for session reset).
 */
export function clearTasks(): void {
  taskStore.clear()
  taskCounter = 0
}

// ============================================================================
// TaskCreateTool
// ============================================================================

export const TaskCreateTool: ToolDefinition = {
  name: 'TaskCreate',
  description: 'Create a new task for tracking work progress. Tasks help organize multi-step operations.',
  inputSchema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Short task title' },
      description: { type: 'string', description: 'Detailed task description' },
      owner: { type: 'string', description: 'Task owner/assignee' },
      status: { type: 'string', enum: ['pending', 'in_progress'], description: 'Initial status' },
      // Part 10:
      pattern: { type: 'string', enum: ['swarm', 'coordinator'], description: 'Multi-agent orchestration pattern' },
      phase: { type: 'number', description: 'Phase number (1-4) for orchestration' },
      parent_task_id: { type: 'string', description: 'Parent task ID for dependency tracking' },
    },
    required: ['subject'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Create a task for tracking progress.' },
  async call(input: any): Promise<ToolResult> {
    const id = `task_${++taskCounter}`
    const task: Task = {
      id,
      subject: input.subject,
      description: input.description,
      status: input.status || 'pending',
      owner: input.owner,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Part 10 fields:
      pattern: input.pattern,
      phase: input.phase,
      parentTaskId: input.parent_task_id,
    }
    taskStore.set(id, task)

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: `Task created: ${id} "${task.subject}"${task.pattern ? ` (${task.pattern} pattern, phase ${task.phase || '?'})` : ''}`,
    }
  },
}

// ============================================================================
// TaskListTool
// ============================================================================

export const TaskListTool: ToolDefinition = {
  name: 'TaskList',
  description: 'List all tasks with their status, ownership, and dependencies.',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status' },
      owner: { type: 'string', description: 'Filter by owner' },
    },
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'List tasks.' },
  async call(input: any): Promise<ToolResult> {
    let tasks = getAllTasks()

    if (input.status) {
      tasks = tasks.filter(t => t.status === input.status)
    }
    if (input.owner) {
      tasks = tasks.filter(t => t.owner === input.owner)
    }

    if (tasks.length === 0) {
      return { type: 'tool_result', tool_use_id: '', content: 'No tasks found.' }
    }

    const lines = tasks.map(t =>
      `[${t.id}] ${t.status.toUpperCase()} - ${t.subject}${t.owner ? ` (owner: ${t.owner})` : ''}`
    )

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: lines.join('\n'),
    }
  },
}

// ============================================================================
// TaskUpdateTool
// ============================================================================

export const TaskUpdateTool: ToolDefinition = {
  name: 'TaskUpdate',
  description: 'Update a task\'s status, description, or other properties.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'] },
      description: { type: 'string', description: 'Updated description' },
      owner: { type: 'string', description: 'New owner' },
      output: { type: 'string', description: 'Task output/result' },
      // Part 10:
      pattern: { type: 'string', enum: ['swarm', 'coordinator'] },
      phase: { type: 'number' },
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            lines: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      result: { type: 'object', description: 'Structured ChildResult' },
      conflict_with: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of conflicting task IDs',
      },
    },
    required: ['id'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Update a task.' },
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id)
    if (!task) {
      return { type: 'tool_result', tool_use_id: '', content: `Task not found: ${input.id}`, is_error: true }
    }

    if (input.status) task.status = input.status
    if (input.description) task.description = input.description
    if (input.owner) task.owner = input.owner
    if (input.output) task.output = input.output
    // Part 10 fields
    if (input.pattern) task.pattern = input.pattern
    if (input.phase !== undefined) task.phase = input.phase
    if (input.evidence) task.evidence = input.evidence
    if (input.result) task.result = input.result
    if (input.conflict_with) task.conflictWith = input.conflict_with
    task.updatedAt = new Date().toISOString()

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: `Task updated: ${task.id} - ${task.status} - "${task.subject}"`,
    }
  },
}

// ============================================================================
// TaskGetTool
// ============================================================================

export const TaskGetTool: ToolDefinition = {
  name: 'TaskGet',
  description: 'Get full details of a specific task.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
    },
    required: ['id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Get task details.' },
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id)
    if (!task) {
      return { type: 'tool_result', tool_use_id: '', content: `Task not found: ${input.id}`, is_error: true }
    }

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: JSON.stringify(task, null, 2),
    }
  },
}

// ============================================================================
// TaskStopTool
// ============================================================================

export const TaskStopTool: ToolDefinition = {
  name: 'TaskStop',
  description: 'Stop/cancel a running task.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID to stop' },
      reason: { type: 'string', description: 'Reason for stopping' },
    },
    required: ['id'],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Stop a task.' },
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id)
    if (!task) {
      return { type: 'tool_result', tool_use_id: '', content: `Task not found: ${input.id}`, is_error: true }
    }

    task.status = 'cancelled'
    task.updatedAt = new Date().toISOString()
    if (input.reason) task.output = `Stopped: ${input.reason}`

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: `Task stopped: ${task.id}`,
    }
  },
}

// ============================================================================
// TaskMergeTool (Part 10: Swarm/Coordinator merge)
// ============================================================================

/**
 * Deduplicate evidence by path and lines.
 */
function dedupeEvidence(evidence: Array<{path: string, lines: string, note?: string}>): Array<{path: string, lines: string, note?: string}> {
  const seen = new Set<string>()
  const result: Array<{path: string, lines: string, note?: string}> = []
  for (const e of evidence) {
    const key = `${e.path}:${e.lines}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(e)
    }
  }
  return result
}

/**
 * Detect conflicts (multiple agents touching same path).
 * Simplified: if same path appears with different lines or notes, consider conflict.
 */
function detectConflicts(evidence: Array<{path: string, lines: string, note?: string}>): Array<{path: string, agents: string[], lines: string[]}> {
  const groups = new Map<string, Array<{path: string, lines: string, note?: string}>>()
  for (const e of evidence) {
    const key = e.path
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }

  const conflicts: Array<{path: string, agents: string[], lines: string[]}> = []
  for (const [path, items] of groups) {
    if (items.length > 1) {
      // More than one agent touched this path
      conflicts.push({
        path,
        agents: items.map((_, i) => `agent_${i}`), // Simplified: no agent names
        lines: [...new Set(items.map(i => i.lines))],
      })
    }
  }
  return conflicts
}

export const TaskMergeTool: ToolDefinition = {
  name: 'TaskMerge',
  description: 'Merge child task results for Swarm pattern. Deduplicates evidence and detects conflicts.',
  inputSchema: {
    type: 'object',
    properties: {
      task_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of task IDs to merge',
      },
    },
    required: ['task_ids'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Merge results from multiple tasks.' },
  async call(input: any): Promise<ToolResult> {
    const taskIds = input.task_ids as string[]
    const tasks = taskIds
      .map(id => taskStore.get(id))
      .filter(Boolean) as Task[]

    if (tasks.length === 0) {
      return { type: 'tool_result', tool_use_id: '', content: 'No tasks found to merge', is_error: true }
    }

    // 1. Aggregate all evidence
    const allEvidence = tasks.flatMap(t => (t.evidence || []))

    // 2. Deduplicate
    const deduped = dedupeEvidence(allEvidence)

     // 3. Detect conflicts
     const conflicts = detectConflicts(deduped)

     // 4. Anti-lazy: check summary length/quality
     const lazyTasks: string[] = []
     for (const task of tasks) {
       const summary = (task.result?.summary) || task.output || ''
       if (summary.trim().length < 20) {
         lazyTasks.push(`${task.id} (${task.subject})`)
       }
     }

     // 5. Build merged summary
     const summaries = tasks.map(t => (t.result?.summary) || t.output || '').filter(Boolean)
     let mergedSummary = `Merged ${tasks.length} tasks: ${summaries.length} summaries. ${deduped.length} evidence items, ${conflicts.length} conflicts.`
     if (lazyTasks.length > 0) {
       mergedSummary += `\nWarning: ${lazyTasks.length} tasks have very brief summaries (possible lazy output): ${lazyTasks.join(', ')}.`
     }

     // 6. Update parent task or return result
     return {
      type: 'tool_result',
      tool_use_id: '',
       content: JSON.stringify({
         summary: mergedSummary,
         evidence: deduped,
         conflicts,
         open_questions: [
           ...(conflicts.length > 0 ? ['Resolve conflicts before proceeding'] : []),
           ...(lazyTasks.length > 0 ? [`Lazy summaries: ${lazyTasks.length} tasks need more detail.`] : []),
         ],
         merged_from: taskIds,
       }, null, 2),
    }
  },
}

export const TaskOutputTool: ToolDefinition = {
  name: 'TaskOutput',
  description: 'Get the output/result of a task.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
    },
    required: ['id'],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  async prompt() { return 'Get task output.' },
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id)
    if (!task) {
      return { type: 'tool_result', tool_use_id: '', content: `Task not found: ${input.id}`, is_error: true }
    }

    // If task has structured result, return as JSON
    if (task.result) {
      return {
        type: 'tool_result',
        tool_use_id: '',
        content: JSON.stringify(task.result, null, 2),
      }
    }

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: task.output || '(no output yet)',
    }
  },
}

