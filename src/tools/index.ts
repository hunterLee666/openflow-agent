export * from '@openflow-agent-sdk/tools'

import { memoize } from 'lodash-es'
import { Tool } from '@tool'
import { AskExpertModelTool } from './ai/AskExpertModelTool/AskExpertModelTool'
import { AskUserQuestionTool } from './interaction/AskUserQuestionTool/AskUserQuestionTool'
import { BashTool } from './system/BashTool/BashTool'
import { TaskOutputTool } from './system/TaskOutputTool/TaskOutputTool'
import { EnterPlanModeTool } from './agent/PlanModeTool/EnterPlanModeTool'
import { ExitPlanModeTool } from './agent/PlanModeTool/ExitPlanModeTool'
import { FileEditTool } from './filesystem/FileEditTool/FileEditTool'
import { FileReadTool } from './filesystem/FileReadTool/FileReadTool'
import { FileWriteTool } from './filesystem/FileWriteTool/FileWriteTool'
import { GlobTool } from './filesystem/GlobTool/GlobTool'
import { GrepTool } from './search/GrepTool/GrepTool'
import { ToolSearchTool } from './search/ToolSearchTool/ToolSearchTool'
import { KillShellTool } from './system/KillShellTool/KillShellTool'
import { ListMcpResourcesTool } from './mcp/ListMcpResourcesTool/ListMcpResourcesTool'
import { LspTool } from './search/LspTool/LspTool'
import { MCPTool } from './mcp/MCPTool/MCPTool'
import { NotebookEditTool } from './filesystem/NotebookEditTool/NotebookEditTool'
import { ReadMcpResourceTool } from './mcp/ReadMcpResourceTool/ReadMcpResourceTool'
import { SlashCommandTool } from './interaction/SlashCommandTool/SlashCommandTool'
import { SkillTool } from './ai/SkillTool/SkillTool'
import { TaskTool } from './agent/TaskTool/TaskTool'
import { TodoWriteTool } from './interaction/TodoWriteTool/TodoWriteTool'
import { WebFetchTool } from './network/WebFetchTool/WebFetchTool'
import { WebSearchTool } from './network/WebSearchTool/WebSearchTool'
import { getMCPTools } from '@services/mcpClient'
import {
  getDeferredToolRegistry,
  type ToolSchema,
} from '@services/tools'
import {
  getToolTier,
  getToolsByTier,
  shouldPreloadTool,
  type ToolTier,
} from '@services/tools/toolTiers'

export const getAllTools = (): Tool[] => [
  TaskTool as unknown as Tool,
  AskExpertModelTool as unknown as Tool,
  BashTool as unknown as Tool,
  TaskOutputTool as unknown as Tool,
  KillShellTool as unknown as Tool,
  GlobTool as unknown as Tool,
  GrepTool as unknown as Tool,
  ToolSearchTool as unknown as Tool,
  LspTool as unknown as Tool,
  FileReadTool as unknown as Tool,
  FileEditTool as unknown as Tool,
  FileWriteTool as unknown as Tool,
  NotebookEditTool as unknown as Tool,
  TodoWriteTool as unknown as Tool,
  WebSearchTool as unknown as Tool,
  WebFetchTool as unknown as Tool,
  AskUserQuestionTool as unknown as Tool,
  EnterPlanModeTool as unknown as Tool,
  ExitPlanModeTool as unknown as Tool,
  SlashCommandTool as unknown as Tool,
  SkillTool as unknown as Tool,
  ListMcpResourcesTool as unknown as Tool,
  ReadMcpResourceTool as unknown as Tool,
  MCPTool as unknown as Tool,
]

export const getTools = memoize(
  async (_includeOptional?: boolean): Promise<Tool[]> => {
    const tools = [...getAllTools(), ...(await getMCPTools())]

    const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
    return tools.filter((_, i) => isEnabled[i])
  },
)

export const getReadOnlyTools = memoize(async (): Promise<Tool[]> => {
  const tools = getAllTools().filter(tool => tool.isReadOnly())
  const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
  return tools.filter((_, index) => isEnabled[index])
})

export function registerToolStub(
  name: string,
  kind: 'builtin' | 'mcp' | 'plugin',
  loader?: () => Promise<ToolSchema>,
): void {
  const registry = getDeferredToolRegistry()
  registry.registerStub(name, kind, loader)
}

export async function hydrateToolSchema(name: string): Promise<ToolSchema> {
  const registry = getDeferredToolRegistry()
  return registry.ensureHydrated(name)
}

export function isToolLoaded(name: string): boolean {
  const registry = getDeferredToolRegistry()
  return registry.isLoaded(name)
}

export function initializeDeferredTools(): void {
  const registry = getDeferredToolRegistry()
  const builtinTools = getAllTools()
  for (const tool of builtinTools) {
    registry.registerBuiltin(tool.name, async () => {
      const description =
        typeof tool.description === 'function'
          ? await tool.description()
          : tool.description
      return {
        name: tool.name,
        description: description || '',
        inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
      }
    })
  }
}

export function getToolsByTierGroup(): {
  L0: Tool[]
  L1: Tool[]
  L2: Tool[]
  L3: Tool[]
} {
  const allTools = getAllTools()
  return {
    L0: allTools.filter(t => getToolTier(t.name) === 'L0'),
    L1: allTools.filter(t => getToolTier(t.name) === 'L1'),
    L2: allTools.filter(t => getToolTier(t.name) === 'L2'),
    L3: allTools.filter(t => getToolTier(t.name) === 'L3'),
  }
}

export async function getInitialTools(): Promise<Tool[]> {
  const allTools = await getTools()
  return allTools.filter(t => getToolTier(t.name) === 'L0')
}

export async function getOnDemandTools(): Promise<Tool[]> {
  const allTools = await getTools()
  return allTools.filter(t => {
    const tier = getToolTier(t.name)
    return tier === 'L1' || tier === 'L2'
  })
}

export { getToolTier, getToolsByTier, shouldPreloadTool }
export type { ToolTier }
