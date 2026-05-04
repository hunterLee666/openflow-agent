import { type Tool } from '@tool'
import { getTools, getReadOnlyTools } from '@tools'
import { TaskTool } from './TaskTool'
import { BashTool } from '@tools/BashTool/BashTool'
import { FileWriteTool } from '@tools/FileWriteTool/FileWriteTool'
import { FileEditTool } from '@tools/FileEditTool/FileEditTool'
import { NotebookEditTool } from '@tools/NotebookEditTool/NotebookEditTool'
import { GlobTool } from '@tools/GlobTool/GlobTool'
import { FileReadTool } from '@tools/FileReadTool/FileReadTool'
import { getModelManager } from '@utils/model'
import { getActiveAgents } from '@utils/agent/loader'

const SUBAGENT_DISALLOWED_TOOL_NAMES = new Set<string>([
  'Task',
  'TaskOutput',
  'KillShell',
  'EnterPlanMode',
  'ExitPlanMode',
  'AskUserQuestion',
])

export async function getTaskTools(safeMode: boolean): Promise<Tool[]> {
  return (await (!safeMode ? getTools() : getReadOnlyTools())).filter(
    tool => !SUBAGENT_DISALLOWED_TOOL_NAMES.has(tool.name),
  )
}

export async function getPrompt(safeMode: boolean): Promise<string> {
  const agents = await getActiveAgents()

  const agentDescriptions = agents
    .map(agent => {
      const toolsStr = Array.isArray(agent.tools) ? agent.tools.join(', ') : '*'
      return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${toolsStr})`
    })
    .join('\n')

  return `Launch a specialized sub-agent to handle complex, multi-step tasks autonomously.

## When to Use
- Delegate tasks that require specific expertise (code review, testing, research, refactoring)
- When the task is complex enough to warrant focused attention and multiple tool uses
- For long-running operations that would block the main conversation
- When you need to work on multiple workstreams concurrently

## When NOT to Use
- Reading a specific file: use ${FileReadTool.name} or ${GlobTool.name} directly
- Searching for a class/function definition: use ${GlobTool.name} directly
- Searching within 2-3 specific files: use ${FileReadTool.name} directly
- Trivial tasks that can be done in one or two steps
- Tasks requiring stateful interaction with you (sub-agents are stateless)

## Approach
1. Choose the appropriate subagent_type from the list below based on the task's nature
2. Provide a concise "description" (3-5 words) summarizing the task
3. Write a detailed "prompt" with clear deliverables and expected output format
4. Optionally include "context" for background information
5. Optionally override the model with "model" (string or {provider, model})
6. Await the agent's final report; it cannot communicate with you mid-task

## Parameters
- description (required): Short title for the task (3-5 words)
- prompt (required): Detailed instructions, including what to produce and how
- subagent_type (required): Which agent type to use (must be from available list)
- context (optional): Background information the sub-agent should know
- model (optional): Override model for this sub-agent
  - string: keep parent provider, override model id
  - { provider, model }: explicit provider + model choice
  - omitted: inherit parent model

## Output
- The sub-agent's final text message
- May include pending permissions if the sub-agent needed but wasn't auto-approved
- Agent output is not automatically shown to the user; you must summarize it if you want it visible

## Constraints
- Sub-agents inherit the same sandbox, working directory, and tool restrictions
- Delegation depth may be limited to prevent infinite recursion
- Sub-agents are stateless: they cannot access your state or the parent conversation unless provided in the prompt
- The parent agent cannot communicate with the sub-agent after launch

## Safety/Limitations
- Sub-agents cannot spawn further sub-agents unless explicitly allowed (depth limited)
- All operations are confined to the sandbox; no escaping
- High-impact commands may require approval depending on policy
- Background processes started by sub-agents must be tracked and cleaned up

## Avoid Repetition (Anti-Loop)
- Do NOT use the Task tool to execute tasks that are already within your own capabilities
- If a sub-agent returns a result that you could have produced directly, adjust your delegation strategy
- Avoid creating circular delegation: don't have sub-agent A spawn B which then spawns A
- If a sub-agent fails with a particular approach, do not immediately re-delegate the same task—adjust the prompt or do it yourself
- Limit nested delegation depth: prefer delegating to leaf agents rather than chaining many levels
- For simple file operations (read, grep, edit), use the direct tools yourself; only delegate if the task is compound and multi-step

## Available Agent Templates
${agentDescriptions}

## Example Usage

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure, I'll write that function.
assistant: I'll use the ${FileWriteTool.name} to create the function.
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
The code is written. For completeness, I'll have the code-reviewer agent check it.
</commentary>
assistant: Launching code-reviewer agent to review the isPrime function.
</example>

<example>
user: "Hello"
<commentary>
Greeting requires a friendly response. I'll delegate to the greeting-responder agent.
</commentary>
assistant: I'm launching the greeting-responder agent to craft a reply.
</example>`
}
