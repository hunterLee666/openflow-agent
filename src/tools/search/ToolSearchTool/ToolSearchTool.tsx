import { Box, Text } from 'ink'
import * as React from 'react'
import { z } from 'zod'
import type { Tool } from '@tool'
import { getTools, getAllTools } from '@tools/index'
import { getTheme } from '@utils/theme'
import { PROMPT, DESCRIPTION } from './prompt'

const inputSchema = z.strictObject({
  tool_name: z
    .string()
    .optional()
    .describe('The name of the tool to get detailed information about'),
  capability: z
    .string()
    .optional()
    .describe('A description of the capability to search for tools'),
  list_all: z
    .boolean()
    .optional()
    .describe('List all available tools with brief descriptions'),
})

interface ToolInfo {
  name: string
  description: string
  isReadOnly: boolean
  isConcurrencySafe: boolean
  inputSchema?: string
  prompt?: string
}

async function getToolInfo(tool: Tool, detailed: boolean = false): Promise<ToolInfo> {
  const description = typeof tool.description === 'function'
    ? await tool.description()
    : tool.description || 'No description available'

  const info: ToolInfo = {
    name: tool.name,
    description,
    isReadOnly: tool.isReadOnly(),
    isConcurrencySafe: tool.isConcurrencySafe(),
  }

  if (detailed) {
    if (tool.inputSchema) {
      const schema = tool.inputSchema as z.ZodTypeAny
      info.inputSchema = JSON.stringify(schema._def, null, 2)
    }

    if (tool.prompt) {
      info.prompt = await tool.prompt()
    }
  }

  return info
}

function matchesCapability(tool: Tool, capability: string): boolean {
  const lowerCapability = capability.toLowerCase()
  const toolName = tool.name.toLowerCase()

  if (toolName.includes(lowerCapability)) {
    return true
  }

  const keywords: Record<string, string[]> = {
    'file': ['file', 'read', 'write', 'edit', 'filesystem'],
    'search': ['search', 'grep', 'glob', 'find'],
    'bash': ['bash', 'shell', 'command', 'execute'],
    'web': ['web', 'fetch', 'search', 'network'],
    'mcp': ['mcp', 'resource', 'server'],
    'plan': ['plan', 'mode', 'strategy'],
    'task': ['task', 'agent', 'subtask'],
    'notebook': ['notebook', 'jupyter', 'ipynb'],
    'todo': ['todo', 'task', 'list', 'track'],
    'ask': ['ask', 'question', 'user', 'interaction'],
  }

  for (const [key, aliases] of Object.entries(keywords)) {
    if (lowerCapability.includes(key)) {
      if (aliases.some(alias => toolName.includes(alias))) {
        return true
      }
    }
  }

  return false
}

export const ToolSearchTool = {
  name: 'ToolSearch',
  async description() {
    return DESCRIPTION
  },
  userFacingName: () => 'Tool Search',
  async prompt() {
    return PROMPT
  },
  inputSchema,
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions() {
    return false
  },
  renderToolUseMessage(input, { verbose }) {
    if (input.list_all) {
      return 'list all tools'
    }
    if (input.tool_name) {
      return `tool: ${input.tool_name}`
    }
    if (input.capability) {
      return `capability: ${input.capability}`
    }
    return 'search tools'
  },
  renderToolResultMessage(result: { tools: ToolInfo[]; mode: string }) {
    const { tools, mode } = result
    const theme = getTheme()

    if (mode === 'list_all') {
      return (
        <Box flexDirection="column">
          <Text bold color={theme.primary}>
            Available Tools ({tools.length}):
          </Text>
          {tools.map((tool, index) => (
            <Box key={tool.name} paddingLeft={2}>
              <Text>
                <Text bold>{index + 1}.</Text>{' '}
                <Text color={theme.secondaryText}>{tool.name}</Text>
                {' - '}
                <Text dimColor>{tool.description.slice(0, 60)}{tool.description.length > 60 ? '...' : ''}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    if (mode === 'single') {
      const tool = tools[0]
      return (
        <Box flexDirection="column">
          <Text bold color={theme.primary}>
            Tool: {tool.name}
          </Text>
          <Box paddingLeft={2} flexDirection="column">
            <Text>
              <Text bold>Description: </Text>
              {tool.description}
            </Text>
            <Text>
              <Text bold>Read-only: </Text>
              <Text color={tool.isReadOnly ? theme.success : theme.warning}>
                {tool.isReadOnly ? 'Yes' : 'No'}
              </Text>
            </Text>
            <Text>
              <Text bold>Concurrency-safe: </Text>
              <Text color={tool.isConcurrencySafe ? theme.success : theme.warning}>
                {tool.isConcurrencySafe ? 'Yes' : 'No'}
              </Text>
            </Text>
            {tool.prompt && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>Usage Instructions:</Text>
                <Box paddingLeft={2}>
                  <Text dimColor>{tool.prompt}</Text>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold color={theme.primary}>
          Matching Tools ({tools.length}):
        </Text>
        {tools.map((tool, index) => (
          <Box key={tool.name} paddingLeft={2} flexDirection="column">
            <Text>
              <Text bold>{index + 1}.</Text>{' '}
              <Text color={theme.secondaryText}>{tool.name}</Text>
            </Text>
            <Box paddingLeft={3}>
              <Text dimColor>{tool.description.slice(0, 80)}{tool.description.length > 80 ? '...' : ''}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    )
  },
  async validateInput({ tool_name, capability, list_all }) {
    if (!tool_name && !capability && !list_all) {
      return {
        result: false,
        message: 'Please provide either tool_name, capability, or set list_all to true',
      }
    }
    return { result: true }
  },
  async *call({ tool_name, capability, list_all }) {
    const allTools = getAllTools()

    if (list_all) {
      const toolInfos = await Promise.all(
        allTools.map(tool => getToolInfo(tool, false))
      )
      yield {
        type: 'result',
        data: { tools: toolInfos, mode: 'list_all' },
        resultForAssistant: this.renderResultForAssistant({ tools: toolInfos, mode: 'list_all' }),
      }
      return
    }

    if (tool_name) {
      const tool = allTools.find(t => t.name.toLowerCase() === tool_name.toLowerCase())
      if (!tool) {
        yield {
          type: 'result',
          data: { tools: [], mode: 'single' },
          resultForAssistant: `Tool "${tool_name}" not found. Use list_all=true to see all available tools.`,
        }
        return
      }

      const toolInfo = await getToolInfo(tool, true)
      yield {
        type: 'result',
        data: { tools: [toolInfo], mode: 'single' },
        resultForAssistant: this.renderResultForAssistant({ tools: [toolInfo], mode: 'single' }),
      }
      return
    }

    if (capability) {
      const matchingTools = allTools.filter(tool => matchesCapability(tool, capability))
      const toolInfos = await Promise.all(
        matchingTools.map(tool => getToolInfo(tool, false))
      )
      yield {
        type: 'result',
        data: { tools: toolInfos, mode: 'search' },
        resultForAssistant: this.renderResultForAssistant({ tools: toolInfos, mode: 'search' }),
      }
      return
    }
  },
  renderResultForAssistant(result: { tools: ToolInfo[]; mode: string }) {
    const { tools, mode } = result

    if (mode === 'list_all') {
      return `Available Tools (${tools.length}):
${tools.map((t, i) => `${i + 1}. ${t.name} - ${t.description.slice(0, 60)}${t.description.length > 60 ? '...' : ''}`).join('\n')}`
    }

    if (mode === 'single') {
      const tool = tools[0]
      if (!tool) {
        return 'Tool not found. Use ToolSearch with list_all=true to see all available tools.'
      }
      return `Tool: ${tool.name}
Description: ${tool.description}
Read-only: ${tool.isReadOnly ? 'Yes' : 'No'}
Concurrency-safe: ${tool.isConcurrencySafe ? 'Yes' : 'No'}
${tool.prompt ? `\nUsage Instructions:\n${tool.prompt}` : ''}`
    }

    return `Matching Tools (${tools.length}):
${tools.map((t, i) => `${i + 1}. ${t.name} - ${t.description.slice(0, 80)}${t.description.length > 80 ? '...' : ''}`).join('\n')}`
  },
} satisfies Tool<
  typeof inputSchema,
  { tools: ToolInfo[]; mode: string }
>
