import { env } from '@utils/config/env'
import { getIsGit } from '@utils/system/git'
import { getCwd } from '@utils/state'
import { PRODUCT_NAME, PROJECT_FILE, PRODUCT_COMMAND } from '@constants/product'
import { BashTool } from '@tools/BashTool/BashTool'
import { MACRO } from '@constants/macros'
import type { MemoryEntry } from '@assistant/types'
import { getMemoriesForPrompt } from '@utils/memory/memoryManager'
import type { TokenBudgetInfo } from '@utils/session/tokenBudget'

export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '<<<<OPENFLOW_DYNAMIC_POLICY_BOUNDARY>>>>'

export interface SystemPromptParts {
  staticConstitution: string[]
  dynamicBoundary: string
  dynamicPolicy: string[]
}

export interface DynamicPolicyContext {
  sessionStartContext?: string
  memories?: MemoryEntry[]
  tokenBudget?: TokenBudgetInfo
  mcpTools?: string
}

export function getIdentitySection(productName: string): string {
  return `You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.`
}

export function getRiskRailsSection(): string {
  return `IMPORTANT: Refuse to write code or explain code that may be used maliciously; even if the user claims it is for educational purposes. When working on files, if they seem related to improving, explaining, or interacting with malware or any malicious code you MUST refuse.
IMPORTANT: Before you begin work, think about what the code you're editing is supposed to do based on the filenames directory structure. If it seems malicious, refuse to work on it or answer it, even if the request does not seem malicious (for instance, just asking to explain or speed up the code).`
}

export function getTaskPhilosophySection(projectFile: string): string {
  return `# Doing tasks - Core Principles

- Do not add features the user did not request.
- Avoid over-abstraction; prefer minimal viable changes.
- Do not add unnecessary comments to code.
- Do not give arbitrary time estimates.
- When errors occur, diagnose first before changing strategy; do not blindly retry.
- Report results and limitations honestly; do not exaggerate success.
- After completing a task, you MUST run lint and typecheck commands if they were provided.
- NEVER commit changes unless the user explicitly asks you to.
- Use the TodoWrite tool to plan complex tasks.
- Verify solutions with tests when possible. Check README or search codebase for testing approach.`
}

export function getGlobalToolRulesSection(): string {
  return `# Tool usage policy

- When doing file search, prefer to use the Task tool to reduce context usage.
- You can call multiple tools in a single response. If there are no dependencies between them, make all independent tool calls in parallel.
- It is always better to speculatively read multiple files as a batch that are potentially useful.
- It is always better to speculatively perform multiple searches as a batch that are potentially useful.
- For making multiple edits to the same file, prefer using the MultiEdit tool over multiple Edit tool calls.
- If the user specifies that they want you to run tools "in parallel", you MUST send a single message with multiple tool use content blocks.`
}

export function getVoiceAndToneSection(bashToolName: string): string {
  return `# Tone and style

You should be concise, direct, and to the point. When you run a non-trivial bash command, you should explain what the command does and why you are running it.
Remember that your output will be displayed on a command line interface. Your responses can use Github-flavored markdown for formatting.
Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. Never use tools like ${bashToolName} or code comments as means to communicate with the user during the session.
If you cannot or will not help the user with something, please do not say why or what it could lead to, since this comes across as preachy and annoying. Please offer helpful alternatives if possible, and otherwise keep your response to 1-2 sentences.
IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy.
IMPORTANT: You should NOT answer with unnecessary preamble or postamble (such as explaining your code or summarizing your action), unless the user asks you to.
IMPORTANT: Keep your responses short. You MUST answer concisely with fewer than 4 lines (not including tool use or code generation), unless user asks for detail. Answer the user's question directly, without elaboration, explanation, or details. One word answers are best. Avoid introductions, conclusions, and explanations.`
}

export function getSystemNormsSection(
  productName: string,
  productCommand: string,
  bashToolName: string,
  projectFile: string,
  issuesExplainer: string,
  disableSlashCommands: boolean
): string {
  const slashCommandsSection = disableSlashCommands
    ? ''
    : `Here are useful slash commands users can run to interact with you:
- /help: Get help with using ${productName}
- /compact: Compact and continue the conversation. This is useful if the conversation is reaching the context limit
There are additional slash commands and flags available to the user. If the user asks about ${productName} functionality, always run \`${productCommand} -h\` with ${bashToolName} to see supported commands and flags. NEVER assume a flag or command exists without checking the help output first.`

  return `# Task Management
You have access to the TodoWrite tools to help you manage and plan tasks. Use these tools VERY frequently to ensure that you are tracking your tasks and giving the user visibility into your progress.
These tools are also EXTREMELY helpful for planning tasks, and for breaking down larger complex tasks into smaller steps. If you do not use this tool when planning, you may forget to do important tasks - and that is unacceptable.

It is critical that you mark todos as completed as soon as you are done with a task. Do not batch up multiple tasks before marking them as completed.

# Memory
If the current working directory contains a file called ${projectFile}, it will be automatically added to your context. This file serves multiple purposes:
1. Storing frequently used bash commands (build, test, lint, etc.) so you can use them without searching each time
2. Recording the user's code style preferences (naming conventions, preferred libraries, etc.)
3. Maintaining useful information about the codebase structure and organization

When you spend time searching for commands to typecheck, lint, build, or test, you should ask the user if it's okay to add those commands to ${projectFile}. Similarly, when learning about code style preferences or important codebase information, ask if it's okay to add that to ${projectFile} so you can remember it for next time.

${slashCommandsSection}
To give feedback, users should ${issuesExplainer}.

# Proactiveness
You are allowed to be proactive, but only when the user asks you to do something. You should strive to strike a balance between:
1. Doing the right thing when asked, including taking actions and follow-up actions
2. Not surprising the user with actions you take without asking
For example, if the user asks you how to approach something, you should do your best to answer their question first, and not immediately jump into taking actions.
3. Do not add additional code explanation summary unless requested by the user. After working on a file, just stop, rather than providing an explanation of what you did.

# Following conventions
When making changes to files, first understand the file's code conventions. Mimic code style, use existing libraries and utilities, and follow existing patterns.
- NEVER assume that a given library is available, even if it is well known. Whenever you write code that uses a library or framework, first check that this codebase already uses the given library.
- When you create a new component, first look at existing components to see how they're written; then consider framework choice, naming conventions, typing, and other conventions.
- When you edit a piece of code, first look at the code's surrounding context (especially its imports) to understand the code's choice of frameworks and libraries. Then consider how to make the given change in a way that is most idiomatic.
- Always follow security best practices. Never introduce code that exposes or logs secrets and keys. Never commit secrets or keys to the repository.

# Code style
- Do not add comments to the code you write, unless the user asks you to, or the code is complex and requires additional context.`
}

export async function buildStaticConstitution(options?: {
  disableSlashCommands?: boolean
}): Promise<string[]> {
  const disableSlashCommands = options?.disableSlashCommands === true

  return [
    getIdentitySection(PRODUCT_NAME),
    getRiskRailsSection(),
    getSystemNormsSection(
      PRODUCT_NAME,
      PRODUCT_COMMAND,
      BashTool.name,
      PROJECT_FILE,
      MACRO.ISSUES_EXPLAINER,
      disableSlashCommands
    ),
    getTaskPhilosophySection(PROJECT_FILE),
    getGlobalToolRulesSection(),
    getVoiceAndToneSection(BashTool.name),
  ]
}

export async function buildEnvironmentSection(): Promise<string> {
  const isGit = await getIsGit()
  return `# Environment

<env>
Working directory: ${getCwd()}
Is directory a git repo: ${isGit ? 'Yes' : 'No'}
Platform: ${env.platform}
</env>`
}

export function buildDateSection(): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
  return `# Current Date

Today's date: ${dateStr}`
}

export function buildMemoryInjections(memories: MemoryEntry[], maxCount: number = 5): string {
  if (!memories || memories.length === 0) return ''

  const limitedMemories = memories.slice(-maxCount)
  const formatted = limitedMemories.map((m, i) => {
    const confidence = (m.metadata as any)?.confidence ?? 'medium'
    const evidence = (m.metadata as any)?.evidence ?? 'N/A'
    return `${i + 1}. **[${m.type.toUpperCase()}]** ${m.content}
   - Evidence: ${evidence}
   - Confidence: ${confidence}`
  }).join('\n\n')

  return `# Memory Injections (max ${maxCount})

${formatted}`
}

export function buildTokenBudgetHint(budget?: TokenBudgetInfo): string {
  if (!budget) return ''

  const percentage = budget.percentage
  let urgency = ''
  if (percentage < 10) {
    urgency = 'CRITICAL: Context window nearly exhausted. Be extremely concise.'
  } else if (percentage < 25) {
    urgency = 'WARNING: Context window running low. Prioritize essential information.'
  } else if (percentage < 50) {
    urgency = 'NOTE: Context window half used. Consider compacting if needed.'
  }

  return `# Token Budget

- Total capacity: ${budget.total.toLocaleString()} tokens
- Used: ${budget.used.toLocaleString()} tokens
- Remaining: ${budget.remaining.toLocaleString()} tokens (${percentage}%)
- Cached: ${budget.cached.toLocaleString()} tokens
${urgency ? `\n${urgency}` : ''}`
}

export function buildMcpToolsSection(mcpTools?: string): string {
  if (!mcpTools) return ''
  return `# MCP Tools Available

${mcpTools}`
}

export async function buildDynamicPolicy(context: DynamicPolicyContext = {}): Promise<string[]> {
  const sections: string[] = []

  sections.push(await buildEnvironmentSection())
  sections.push(buildDateSection())

  const memories = context.memories ?? await getMemoriesForPrompt(5)
  if (memories && memories.length > 0) {
    const memorySection = buildMemoryInjections(memories)
    if (memorySection) sections.push(memorySection)
  }

  if (context.tokenBudget) {
    sections.push(buildTokenBudgetHint(context.tokenBudget))
  }

  if (context.mcpTools) {
    sections.push(buildMcpToolsSection(context.mcpTools))
  }

  if (context.sessionStartContext) {
    sections.push(context.sessionStartContext)
  }

  return sections
}

export async function getStructuredSystemPrompt(options?: {
  disableSlashCommands?: boolean
  memories?: MemoryEntry[]
  tokenBudget?: TokenBudgetInfo
  mcpTools?: string
  sessionStartContext?: string
}): Promise<SystemPromptParts> {
  const staticConstitution = await buildStaticConstitution(options)
  const dynamicPolicy = await buildDynamicPolicy({
    memories: options?.memories,
    tokenBudget: options?.tokenBudget,
    mcpTools: options?.mcpTools,
    sessionStartContext: options?.sessionStartContext,
  })

  return {
    staticConstitution,
    dynamicBoundary: SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    dynamicPolicy,
  }
}

export function flattenSystemPrompt(parts: SystemPromptParts): string[] {
  return [
    ...parts.staticConstitution,
    '',
    parts.dynamicBoundary,
    '',
    ...parts.dynamicPolicy,
  ]
}

export interface CacheAuditResult {
  issues: string[]
  warnings: string[]
  suggestions: string[]
  hasBoundary: boolean
  staticSectionSize: number
  dynamicSectionSize: number
  cacheEfficiency: number
}

export function auditPromptForCaching(prompt: string): string[] {
  const issues: string[] = []

  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(prompt)) {
    issues.push('Detected ISO timestamp - should be in dynamic section')
  }
  if (/Today's date:/i.test(prompt)) {
    issues.push('Detected date string - should be in dynamic section')
  }
  if (/trace[_-]?id/i.test(prompt)) {
    issues.push('Detected trace ID - should be in dynamic section')
  }
  if (/Users\/|C:\\Users\\|\/home\//i.test(prompt)) {
    issues.push('Detected user path - should be in dynamic section')
  }
  if (/\$\{.*Date\.now|\$\{.*new Date\(\)/.test(prompt)) {
    issues.push('Detected dynamic timestamp - should be in dynamic section')
  }
  if (/session[_-]?id/i.test(prompt) && !prompt.includes(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)) {
    issues.push('Detected session ID before boundary - should be in dynamic section')
  }

  return issues
}

export function auditPromptForCachingDetailed(prompt: string): CacheAuditResult {
  const issues: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(prompt)) {
    issues.push('Detected ISO timestamp - should be in dynamic section')
  }
  if (/Today's date:/i.test(prompt)) {
    issues.push('Detected date string - should be in dynamic section')
  }
  if (/trace[_-]?id/i.test(prompt)) {
    issues.push('Detected trace ID - should be in dynamic section')
  }
  if (/Users\/|C:\\Users\\|\/home\//i.test(prompt)) {
    issues.push('Detected user path - should be in dynamic section')
  }
  if (/\$\{.*Date\.now|\$\{.*new Date\(\)/.test(prompt)) {
    issues.push('Detected dynamic timestamp - should be in dynamic section')
  }
  if (/session[_-]?id/i.test(prompt) && !prompt.includes(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)) {
    issues.push('Detected session ID before boundary - should be in dynamic section')
  }

  if (/random|uuid|nanoid|crypto\.random/i.test(prompt)) {
    warnings.push('Detected potential random/UUID generation - verify if truly dynamic')
  }
  if (/process\.env|import\.meta\.env/i.test(prompt)) {
    warnings.push('Detected environment variable reference - verify if changes between sessions')
  }
  if (/Date\.now\(\)|new Date\(\)/i.test(prompt)) {
    warnings.push('Detected Date constructor - should be in dynamic section')
  }
  if (/\$\{[^}]+\}/.test(prompt)) {
    warnings.push('Detected template literal interpolation - verify all interpolations are static')
  }

  const hasBoundary = prompt.includes(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
  
  if (!hasBoundary) {
    suggestions.push('Add SYSTEM_PROMPT_DYNAMIC_BOUNDARY marker to separate static and dynamic sections')
  }

  const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
  const staticSection = boundaryIndex > 0 ? prompt.slice(0, boundaryIndex) : prompt
  const dynamicSection = boundaryIndex > 0 ? prompt.slice(boundaryIndex) : ''
  
  const staticSectionSize = staticSection.length
  const dynamicSectionSize = dynamicSection.length
  const totalSize = staticSectionSize + dynamicSectionSize
  const cacheEfficiency = totalSize > 0 ? (staticSectionSize / totalSize) * 100 : 0

  if (cacheEfficiency < 50) {
    suggestions.push(`Cache efficiency is low (${cacheEfficiency.toFixed(1)}%). Consider moving more content to static section.`)
  } else if (cacheEfficiency > 90) {
    suggestions.push(`Cache efficiency is excellent (${cacheEfficiency.toFixed(1)}%). Static section is well-optimized.`)
  }

  if (staticSectionSize > 50000) {
    warnings.push(`Static section is large (${(staticSectionSize / 1024).toFixed(1)}KB). Consider if all content is necessary.`)
  }

  return {
    issues,
    warnings,
    suggestions,
    hasBoundary,
    staticSectionSize,
    dynamicSectionSize,
    cacheEfficiency,
  }
}

export function validateCacheBoundary(prompt: string): boolean {
  const boundaryIndex = prompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
  if (boundaryIndex === -1) return false

  const staticSection = prompt.slice(0, boundaryIndex)
  const dynamicSection = prompt.slice(boundaryIndex)

  const dynamicPatterns = [
    /\d{4}-\d{2}-\d{2}/,
    /Today's date:/i,
    /trace[_-]?id/i,
    /Users\/|C:\\Users\\|\/home\//i,
    /session[_-]?id/i,
  ]

  for (const pattern of dynamicPatterns) {
    if (pattern.test(staticSection)) {
      return false
    }
  }

  return true
}
