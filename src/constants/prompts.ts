import { env } from '@utils/config/env'
import { getIsGit } from '@utils/system/git'
import { getCwd } from '@utils/state'
import { PRODUCT_NAME, PROJECT_FILE, PRODUCT_COMMAND } from './product'
import { BashTool } from '@tools/BashTool/BashTool'
import { MACRO } from './macros'
import { getSessionStartAdditionalContext } from '@utils/session/openflowHooks'
import { getCurrentOutputStyleDefinition } from '@services/outputStyles'
import {
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  getStructuredSystemPrompt,
  flattenSystemPrompt,
  buildStaticConstitution,
  buildDynamicPolicy,
  type DynamicPolicyContext,
} from './promptEngineering'
import type { TokenBudgetInfo } from '@utils/session/tokenBudget'

export { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from './promptEngineering'

export function getCLISyspromptPrefix(): string {
  return `You are ${PRODUCT_NAME}, OPENFLOW's Agent AI CLI for terminal & coding.`
}

export async function getSystemPrompt(options?: {
  disableSlashCommands?: boolean
  tokenBudget?: TokenBudgetInfo
  mcpTools?: string
}): Promise<string[]> {
  const disableSlashCommands = options?.disableSlashCommands === true
  const sessionStartAdditionalContext = await getSessionStartAdditionalContext()
  const outputStyle = getCurrentOutputStyleDefinition()
  const isOutputStyleActive = outputStyle !== null
  const includeCodingInstructions =
    !isOutputStyleActive || outputStyle.keepCodingInstructions === true

  const parts = await getStructuredSystemPrompt({
    disableSlashCommands,
    sessionStartContext: sessionStartAdditionalContext,
    tokenBudget: options?.tokenBudget,
    mcpTools: options?.mcpTools,
  })

  return flattenSystemPrompt(parts)
}

export async function getEnvInfo(): Promise<string> {
  const isGit = await getIsGit()
  return `Here is useful information about the environment you are running in:
<env>
Working directory: ${getCwd()}
Is directory a git repo: ${isGit ? 'Yes' : 'No'}
Platform: ${env.platform}
Today's date: ${new Date().toLocaleDateString()}
</env>`
}

export async function getAgentPrompt(): Promise<string[]> {
  return [
    `
You are an agent for ${PRODUCT_NAME}. Given the user's prompt, you should use the tools available to you to answer the user's question.

Notes:
1. IMPORTANT: You should be concise, direct, and to the point, since your responses will be displayed on a command line interface. Answer the user's question directly, without elaboration, explanation, or details. One word answers are best. Avoid introductions, conclusions, and explanations. You MUST avoid text before/after your response, such as "The answer is <answer>.", "Here is the content of the file..." or "Based on the information provided, the answer is..." or "Here is what I will do next...".
2. When relevant, share file names and code snippets relevant to the query
3. Any file paths you return in your final response MUST be absolute. DO NOT use relative paths.`,
    `${await getEnvInfo()}`,
  ]
}

export {
  getStructuredSystemPrompt,
  flattenSystemPrompt,
  buildStaticConstitution,
  buildDynamicPolicy,
  type DynamicPolicyContext,
} from './promptEngineering'
