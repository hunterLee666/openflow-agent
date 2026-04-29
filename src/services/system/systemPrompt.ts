import { getModelManager } from '@utils/model'
import { generateOpenFlowContext } from '@services/openflowContext'
import { generateSystemReminders } from '@services/systemReminder'
import { getSystemPromptComposer, type McpServerInstructions } from '@services/prompt'

function isGPT5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5')
}

export function formatSystemPromptWithContext(
  systemPrompt: string[],
  context: { [k: string]: string },
  agentId?: string,
  skipContextReminders = false,
): { systemPrompt: string[]; reminders: string } {
  const enhancedPrompt = [...systemPrompt]
  let reminders = ''

  const modelManager = getModelManager()
  const modelProfile = modelManager.getModel('main')
  if (modelProfile && isGPT5Model(modelProfile.modelName)) {
    const persistencePrompts = [
      '\n# Agent Persistence for Long-Running Coding Tasks',
      'You are working on a coding project that may involve multiple steps and iterations. Please maintain context and continuity throughout the session:',
      '- Remember architectural decisions and design patterns established earlier',
      '- Keep track of file modifications and their relationships',
      '- Maintain awareness of the overall project structure and goals',
      '- Reference previous implementations when making related changes',
      '- Ensure consistency with existing code style and conventions',
      '- Build incrementally on previous work rather than starting from scratch',
    ]
    enhancedPrompt.push(...persistencePrompts)
  }

  const hasContext = Object.entries(context).length > 0

  if (hasContext) {
    if (!skipContextReminders) {
      const openflowContext = generateOpenFlowContext()
      if (openflowContext) {
        enhancedPrompt.push('\n---\n# 项目上下文\n')
        enhancedPrompt.push(openflowContext)
        enhancedPrompt.push('\n---\n')
      }
    }

    const reminderMessages = generateSystemReminders(hasContext, agentId)
    if (reminderMessages.length > 0) {
      reminders = reminderMessages.map(r => r.content).join('\n') + '\n'
    }

    enhancedPrompt.push(
      `\nAs you answer the user's questions, you can use the following context:\n`,
    )

    const filteredContext = Object.fromEntries(
      Object.entries(context).filter(
        ([key]) => key !== 'projectDocs' && key !== 'userDocs',
      ),
    )

    enhancedPrompt.push(
      ...Object.entries(filteredContext).map(
        ([key, value]) => `<context name="${key}">${value}</context>`,
      ),
    )
  }

  return { systemPrompt: enhancedPrompt, reminders }
}

export function appendMcpInstructions(
  systemPrompt: string[],
  mcpInstructions: McpServerInstructions[],
): string[] {
  if (!mcpInstructions || mcpInstructions.length === 0) {
    return systemPrompt
  }

  const composer = getSystemPromptComposer()
  composer.setBasePrompt(systemPrompt.join('\n'))

  for (const mcp of mcpInstructions) {
    composer.appendMcpInstructions(mcp)
  }

  const composed = composer.compose()
  return [composed]
}
