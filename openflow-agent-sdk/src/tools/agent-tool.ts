/**
 * AgentTool - Spawn subagents for parallel/delegated work
 *
 * Supports built-in agents (Explore, Plan) and custom agent definitions.
 * Agents run as nested query loops with their own context and tool sets.
 */

import type { ToolDefinition, ToolContext, ToolResult, AgentDefinition } from '../types.js'
import { NEEDS_PARENT_DISPATCH } from '../types.js'

import { QueryEngine } from '../engine.js'
import { getAllBaseTools, filterTools } from './index.js'
import { createProvider, type ApiType } from '../providers/index.js'

// Store for registered agent definitions
let registeredAgents: Record<string, AgentDefinition> = {}

/**
 * Register agent definitions for the AgentTool to use.
 */
export function registerAgents(agents: Record<string, AgentDefinition>): void {
  registeredAgents = { ...registeredAgents, ...agents }
}

/**
 * Clear registered agents.
 */
export function clearAgents(): void {
  registeredAgents = {}
}

/**
 * Built-in agent definitions.
 */
export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  Explore: {
    description: 'Fast agent for exploring codebases. Use for finding files, searching code, and answering questions about the codebase.',
    prompt: 'You are a codebase exploration agent. Search through files and code to answer questions. Be thorough but efficient. Use Glob to find files, Grep to search content, and Read to examine files.',
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
  },
   Plan: {
     description: 'Software architect agent for designing implementation plans. Returns step-by-step plans and identifies critical files.',
     prompt: 'You are a software architect. Design implementation plans for the given task. Identify critical files, consider trade-offs, and provide step-by-step plans. Use search tools to understand the codebase before planning.',
     tools: ['Read', 'Glob', 'Grep', 'Bash'],
   },
   Verification: {
     description: 'Independent verification agent for validating work results and providing PASS/FAIL verdicts.',
     prompt: `You are a verification agent. Review the provided task results and produce a verification report with a verdict (PASS/FAIL/PARTIAL). Be thorough and objective. Use Read, Glob, Grep to examine files and confirm changes.`,
     tools: ['Read', 'Glob', 'Grep'],
     maxTurns: 5,
   },
 }

export const AgentTool: ToolDefinition = {
  name: 'Agent',
  description: 'Launch a subagent to handle complex, multi-step tasks autonomously. Subagents have their own context and can run specialized tool sets.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The task for the agent to perform',
      },
      description: {
        type: 'string',
        description: 'A short (3-5 word) description of the task',
      },
      subagent_type: {
        type: 'string',
        description: 'The type of agent to use (e.g., "Explore", "Plan", or a custom agent name)',
      },
      model: {
        type: 'string',
        description: 'Optional model override for this agent',
      },
      name: {
        type: 'string',
        description: 'Name for the spawned agent',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Whether to run in background',
      },
      // Part 10 fields:
      structured_return: {
        type: 'boolean',
        description: 'Return structured ChildResult instead of plain text',
      },
      collect_evidence: {
        type: 'boolean',
        description: 'Collect evidence (file paths, commands) from child agent',
      },
      task_id: {
        type: 'string',
        description: 'Task/fork ID for background processing prefix',
      },
      enforce_structured_output: {
        type: 'boolean',
        description: 'Add JSON output requirement to child system prompt',
      },
    },
    required: ['prompt', 'description'],
  },
   async call(input: any, context: ToolContext): Promise<ToolResult> {
    const {
      prompt,
      subagent_type = 'general-purpose',
      model,
      structured_return = false,
      collect_evidence = false,
      task_id,
      enforce_structured_output = false,
    } = input

    // Find agent definition
    const agentDef = registeredAgents[subagent_type] || BUILTIN_AGENTS[subagent_type]

    // Determine tools for subagent
    let tools = getAllBaseTools()
    if (agentDef?.tools) {
      tools = filterTools(tools, agentDef.tools)
    }

    // Remove AgentTool from subagent to prevent infinite recursion
    tools = tools.filter(t => t.name !== 'Agent')

    // Build system prompt
    let systemPrompt = agentDef?.prompt ||
      'You are a helpful assistant. Complete the given task using the available tools.'

     // Part 10: enforce structured output
     if (enforce_structured_output || structured_return) {
       systemPrompt += `
 
## Output Format
You MUST return a JSON object with the following structure:
{
  "summary": "3-8 sentence summary of findings/work",
  "evidence": [{"path": "string", "lines": "string", "note": "string"}],
  "touched_files": ["string"],
  "commands_run": ["string"],
  "open_questions": ["string"]
}
If this is a verification task, also include:
  "verdict": "PASS" | "FAIL" | "PARTIAL"

## Parent Dispatch
NEVER call Task or Agent tools directly. If you need parent to create tasks or spawn more agents, set needs_parent_dispatch: true in your JSON and explain what is needed in the summary.
`
     }

    // Inherit provider and model from parent agent context, fall back to env vars
    const subModel = model || context.model || process.env.OPENFLOW_MODEL || 'claude-sonnet-4-6'
    const provider = context.provider ?? createProvider(
      (context.apiType || process.env.OPENFLOW_API_TYPE as ApiType) || 'anthropic-messages',
      {
        apiKey: process.env.OPENFLOW_API_KEY,
        baseURL: process.env.OPENFLOW_BASE_URL,
      },
    )

    // Create subagent engine
    const engine = new QueryEngine({
      cwd: context.cwd,
      model: subModel,
      provider,
      tools,
      systemPrompt,
      maxTurns: agentDef?.maxTurns || 10,
      maxTokens: 16384,
      canUseTool: async () => ({ behavior: 'allow' }),
      includePartialMessages: false,
    })

    // Run the subagent
    let resultText = ''
    let toolCalls: Array<{name: string, input: any, filePath?: string}> = []
    let evidence: Array<{path: string, lines: string, note?: string}> = []
    let touchedFiles: string[] = []
    let openQuestions: string[] = []

    try {
      for await (const event of engine.submitMessage(prompt)) {
        if (event.type === 'assistant') {
          for (const block of event.message.content) {
            if ('text' in block && block.text) {
              resultText = block.text
            }
            if ('name' in block) {
              const toolUse = block as any
              toolCalls.push({
                name: toolUse.name,
                input: toolUse.input,
              })
            }
          }
        }

        // Part 10: Collect evidence from tool_use blocks (we need file path)
        // We can't get file path from tool_result directly without tool cooperation,
        // but we can capture from assistant's tool_use blocks
        if (collect_evidence && event.type === 'assistant') {
          for (const block of event.message.content) {
            if (block.type === 'tool_use') {
              const toolUse = block as any
              const toolName = toolUse.name
              const input = toolUse.input || {}
              
              // Extract file path based on common tool input patterns
              let filePath = input.file_path || input.path || input.file || input.directory
              if (filePath) {
                // Record as evidence
                evidence.push({
                  path: filePath,
                  lines: '?', // unknown without deeper integration
                  note: `${toolName} call`,
                })
              }

              // Track touched files for write operations
              if (['Write', 'Edit', 'Delete'].includes(toolName)) {
                if (filePath && !touchedFiles.includes(filePath)) {
                  touchedFiles.push(filePath)
                }
              }

              // Track Bash commands
              if (toolName === 'Bash' && input.command) {
                // Could extract file paths from command arguments (future enhancement)
              }
            }
          }
        }

        // Part 10: Could also parse tool_result blocks for additional metadata
      }
     } catch (err: any) {
       return {
         type: 'tool_result',
         tool_use_id: '',
         content: `Subagent error: ${err.message}`,
         is_error: true,
       }
     }

     // Part 10: Anti-recursion check - if child signals need for parent dispatch
     if (resultText && resultText.includes(NEEDS_PARENT_DISPATCH)) {
       return {
         type: 'tool_result',
         tool_use_id: '',
         content: NEEDS_PARENT_DISPATCH,
         metadata: { needs_parent_dispatch: true, task_id },
       }
     }

     // Build fork prefix if needed
    const forkPrefix = (input.run_in_background && task_id)
      ? `[Fork ${task_id}] `
      : ''

    // Structured return (ChildResult as JSON)
    if (structured_return) {
      // Try to parse evidence from resultText if provided as JSON by subagent (enforce_structured_output)
      let parsedChildResult: any = null
      if (enforce_structured_output) {
        try {
          // Look for JSON block in resultText (may contain extra text)
          const jsonMatch = resultText.match(/\{.*"summary".*\}/s)
          if (jsonMatch) {
            parsedChildResult = JSON.parse(jsonMatch[0])
          }
        } catch (e) {
          // fallback to manual construction
        }
      }

      // Use parsed result if available, otherwise construct
      const childResult: any = parsedChildResult || {
        summary: resultText,
        evidence: evidence,
        touched_files: touchedFiles,
        commands_run: toolCalls.map(tc => tc.name),
        open_questions: openQuestions,
      }

      // Remove undefined fields
      Object.keys(childResult).forEach(key => childResult[key] === undefined && delete childResult[key])

      return {
        type: 'tool_result',
        tool_use_id: '',
        content: JSON.stringify(childResult, null, 2),
        metadata: {
          is_structured: true,
          task_id: task_id,
        },
      }
    }

    // Traditional plain text return with optional fork prefix
    const toolSummary = toolCalls.length > 0
      ? `\n[Tools used: ${toolCalls.map(tc => tc.name).join(', ')}]`
      : ''

    return {
      type: 'tool_result',
      tool_use_id: '',
      content: forkPrefix + resultText + toolSummary,
    }
  }
}
