export type ToolTier = 'L0' | 'L1' | 'L2' | 'L3'

export interface ToolTierConfig {
  tier: ToolTier
  name: string
  description: string
  loadStrategy: 'immediate' | 'on-demand' | 'lazy' | 'search-only'
  priority: number
  preloadOnProject?: (projectType: string) => boolean
}

export const TOOL_TIER_CONFIGS: Record<ToolTier, ToolTierConfig> = {
  L0: {
    tier: 'L0',
    name: 'Core',
    description: 'Essential tools always loaded at session start',
    loadStrategy: 'immediate',
    priority: 100,
  },
  L1: {
    tier: 'L1',
    name: 'Common',
    description: 'Frequently used tools loaded on second batch or first use',
    loadStrategy: 'on-demand',
    priority: 75,
  },
  L2: {
    tier: 'L2',
    name: 'Domain',
    description: 'Project-specific tools loaded after project detection',
    loadStrategy: 'lazy',
    priority: 50,
    preloadOnProject: (projectType) => {
      const domainTools: Record<string, string[]> = {
        node: ['npm_tool', 'eslint_tool', 'prettier_tool'],
        python: ['pytest_tool', 'black_tool', 'mypy_tool'],
        go: ['go_tool', 'golangci_lint_tool'],
        rust: ['cargo_tool', 'rustfmt_tool'],
        kubernetes: ['kubectl_tool', 'helm_tool'],
        terraform: ['terraform_tool', 'tfsec_tool'],
      }
      return domainTools[projectType]?.length > 0
    },
  },
  L3: {
    tier: 'L3',
    name: 'Rare',
    description: 'Specialized tools only loaded via tool_search',
    loadStrategy: 'search-only',
    priority: 25,
  },
}

export const TOOL_TIER_ASSIGNMENTS: Record<string, ToolTier> = {
  Read: 'L0',
  Write: 'L0',
  Edit: 'L0',
  Glob: 'L0',
  Grep: 'L0',
  LS: 'L0',
  Bash: 'L0',
  ToolSearch: 'L0',

  WebFetch: 'L1',
  WebSearch: 'L1',
  TodoWrite: 'L1',
  AskUserQuestion: 'L1',
  LSP: 'L1',

  Task: 'L2',
  TaskOutput: 'L2',
  KillShell: 'L2',
  NotebookEdit: 'L2',
  MultiEdit: 'L2',
  Skill: 'L2',

  EnterPlanMode: 'L3',
  ExitPlanMode: 'L3',
  AskExpertModel: 'L3',
}

export function getToolTier(toolName: string): ToolTier {
  return TOOL_TIER_ASSIGNMENTS[toolName] || 'L3'
}

export function getToolTierConfig(toolName: string): ToolTierConfig {
  const tier = getToolTier(toolName)
  return TOOL_TIER_CONFIGS[tier]
}

export function getToolsByTier(tools: string[]): Record<ToolTier, string[]> {
  const result: Record<ToolTier, string[]> = {
    L0: [],
    L1: [],
    L2: [],
    L3: [],
  }

  for (const tool of tools) {
    const tier = getToolTier(tool)
    result[tier].push(tool)
  }

  return result
}

export function getImmediateLoadTools(tools: string[]): string[] {
  return tools.filter(tool => {
    const config = getToolTierConfig(tool)
    return config.loadStrategy === 'immediate'
  })
}

export function getOnDemandLoadTools(tools: string[]): string[] {
  return tools.filter(tool => {
    const config = getToolTierConfig(tool)
    return config.loadStrategy === 'on-demand'
  })
}

export function getLazyLoadTools(tools: string[]): string[] {
  return tools.filter(tool => {
    const config = getToolTierConfig(tool)
    return config.loadStrategy === 'lazy'
  })
}

export function getSearchOnlyTools(tools: string[]): string[] {
  return tools.filter(tool => {
    const config = getToolTierConfig(tool)
    return config.loadStrategy === 'search-only'
  })
}

export function shouldPreloadTool(toolName: string, projectType: string): boolean {
  const config = getToolTierConfig(toolName)
  return config.preloadOnProject?.(projectType) ?? false
}

export function getToolsToPreloadForProject(
  tools: string[],
  projectType: string,
): string[] {
  return tools.filter(tool => shouldPreloadTool(tool, projectType))
}

export function estimateToolSchemaTokens(toolName: string): number {
  const estimates: Record<string, number> = {
    Read: 800,
    Write: 900,
    Edit: 1200,
    Glob: 600,
    Grep: 700,
    LS: 400,
    Bash: 2500,
    ToolSearch: 500,
    WebFetch: 600,
    WebSearch: 500,
    TodoWrite: 800,
    AskUserQuestion: 900,
    LSP: 1500,
    Task: 2000,
    TaskOutput: 800,
    KillShell: 400,
    NotebookEdit: 1200,
    MultiEdit: 1400,
    Skill: 1000,
    EnterPlanMode: 300,
    ExitPlanMode: 300,
    AskExpertModel: 600,
  }
  return estimates[toolName] || 1000
}

export function estimateTotalSchemaTokens(toolNames: string[]): number {
  return toolNames.reduce((sum, name) => sum + estimateToolSchemaTokens(name), 0)
}

export function compareLoadingStrategies(
  allTools: string[],
): {
  fullLoad: number
  tieredLoad: number
  savingsPercent: number
} {
  const fullLoad = estimateTotalSchemaTokens(allTools)
  const immediate = getImmediateLoadTools(allTools)
  const tieredLoad = estimateTotalSchemaTokens(immediate)
  const savingsPercent = ((fullLoad - tieredLoad) / fullLoad) * 100

  return {
    fullLoad,
    tieredLoad,
    savingsPercent: Math.round(savingsPercent * 10) / 10,
  }
}

export interface ToolLoadPlan {
  immediate: string[]
  onDemand: string[]
  lazy: string[]
  searchOnly: string[]
  estimatedTokens: {
    immediate: number
    onDemand: number
    lazy: number
    searchOnly: number
    total: number
  }
}

export function createToolLoadPlan(tools: string[], projectType?: string): ToolLoadPlan {
  const immediate = getImmediateLoadTools(tools)
  const onDemand = getOnDemandLoadTools(tools)
  const lazy = getLazyLoadTools(tools)
  const searchOnly = getSearchOnlyTools(tools)

  if (projectType) {
    const projectTools = getToolsToPreloadForProject(tools, projectType)
    for (const tool of projectTools) {
      if (lazy.includes(tool)) {
        const idx = lazy.indexOf(tool)
        if (idx > -1) {
          lazy.splice(idx, 1)
          onDemand.push(tool)
        }
      }
    }
  }

  return {
    immediate,
    onDemand,
    lazy,
    searchOnly,
    estimatedTokens: {
      immediate: estimateTotalSchemaTokens(immediate),
      onDemand: estimateTotalSchemaTokens(onDemand),
      lazy: estimateTotalSchemaTokens(lazy),
      searchOnly: estimateTotalSchemaTokens(searchOnly),
      total: estimateTotalSchemaTokens(tools),
    },
  }
}

export function assignToolTier(toolName: string, tier: ToolTier): void {
  TOOL_TIER_ASSIGNMENTS[toolName] = tier
}

export function registerMCPToolTier(mcpServerName: string, toolName: string, tier?: ToolTier): void {
  const fullToolName = `${mcpServerName}_${toolName}`
  TOOL_TIER_ASSIGNMENTS[fullToolName] = tier || 'L2'
}

export function registerPluginToolTier(pluginName: string, toolName: string, tier?: ToolTier): void {
  const fullToolName = `${pluginName}_${toolName}`
  TOOL_TIER_ASSIGNMENTS[fullToolName] = tier || 'L2'
}
