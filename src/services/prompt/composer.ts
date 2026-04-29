export interface McpServerInstructions {
  serverId: string
  serverName: string
  instructions: string
  tools?: McpToolInfo[]
  resources?: McpResourceInfo[]
  version?: string
  connectedAt: number
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface SystemPromptContext {
  basePrompt: string
  projectRules?: string
  skills?: string[]
  mcpInstructions?: McpServerInstructions[]
  customInstructions?: string[]
  tokenBudget?: number
}

export interface PromptSection {
  id: string
  priority: number
  content: string
  source: 'base' | 'project' | 'skill' | 'mcp' | 'custom'
  tokenCount?: number
  cacheControl?: {
    type: 'ephemeral'
    ttl?: '5m' | '1h'
  }
}

export const DEFAULT_TOKEN_BUDGET = 100000
export const MCP_INSTRUCTIONS_MAX_CHARS = 8000
export const TOOL_SCHEMA_MAX_CHARS = 16000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function trimInstructions(
  text: string,
  maxChars: number = MCP_INSTRUCTIONS_MAX_CHARS,
): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n…[truncated]'
}

export function formatMcpInstructionsBlock(
  instructions: McpServerInstructions,
): string {
  const lines: string[] = []
  lines.push(`## MCP Server: ${instructions.serverName}`)
  lines.push(``)
  lines.push(trimInstructions(instructions.instructions))

  if (instructions.tools && instructions.tools.length > 0) {
    lines.push(``)
    lines.push(`### Available Tools (${instructions.tools.length})`)
    for (const tool of instructions.tools.slice(0, 10)) {
      lines.push(`- \`${tool.name}\`: ${tool.description || 'No description'}`)
    }
    if (instructions.tools.length > 10) {
      lines.push(`- ... and ${instructions.tools.length - 10} more tools`)
    }
  }

  return lines.join('\n')
}

export function composeSystemPrompt(context: SystemPromptContext): string {
  const sections: PromptSection[] = []
  const tokenBudget = context.tokenBudget || DEFAULT_TOKEN_BUDGET
  let usedTokens = 0

  sections.push({
    id: 'base',
    priority: 100,
    content: context.basePrompt,
    source: 'base',
    tokenCount: estimateTokens(context.basePrompt),
  })
  usedTokens += sections[0]!.tokenCount!

  if (context.projectRules) {
    const tokenCount = estimateTokens(context.projectRules)
    sections.push({
      id: 'project',
      priority: 90,
      content: context.projectRules,
      source: 'project',
      tokenCount,
    })
    usedTokens += tokenCount
  }

  if (context.skills && context.skills.length > 0) {
    for (let i = 0; i < context.skills.length; i++) {
      const skill = context.skills[i]!
      const tokenCount = estimateTokens(skill)
      if (usedTokens + tokenCount > tokenBudget * 0.7) break
      sections.push({
        id: `skill-${i}`,
        priority: 80 - i,
        content: skill,
        source: 'skill',
        tokenCount,
      })
      usedTokens += tokenCount
    }
  }

  if (context.mcpInstructions && context.mcpInstructions.length > 0) {
    const sortedMcp = [...context.mcpInstructions].sort(
      (a, b) => a.serverName.localeCompare(b.serverName),
    )

    for (let i = 0; i < sortedMcp.length; i++) {
      const mcp = sortedMcp[i]!
      const block = formatMcpInstructionsBlock(mcp)
      const tokenCount = estimateTokens(block)
      if (usedTokens + tokenCount > tokenBudget * 0.9) break
      sections.push({
        id: `mcp-${mcp.serverId}`,
        priority: 70 - i,
        content: block,
        source: 'mcp',
        tokenCount,
      })
      usedTokens += tokenCount
    }
  }

  if (context.customInstructions && context.customInstructions.length > 0) {
    for (let i = 0; i < context.customInstructions.length; i++) {
      const custom = context.customInstructions[i]!
      const tokenCount = estimateTokens(custom)
      if (usedTokens + tokenCount > tokenBudget) break
      sections.push({
        id: `custom-${i}`,
        priority: 60 - i,
        content: custom,
        source: 'custom',
        tokenCount,
      })
      usedTokens += tokenCount
    }
  }

  sections.sort((a, b) => b.priority - a.priority)

  return sections.map((s) => s.content).join('\n\n---\n\n')
}

export class SystemPromptComposer {
  private basePrompt: string = ''
  private projectRules: string = ''
  private skills: string[] = []
  private mcpInstructions: Map<string, McpServerInstructions> = new Map()
  private customInstructions: string[] = []
  private tokenBudget: number = DEFAULT_TOKEN_BUDGET
  private cacheKey: string = ''
  private cachedPrompt: string | null = null

  setBasePrompt(prompt: string): this {
    this.basePrompt = prompt
    this.invalidateCache()
    return this
  }

  setProjectRules(rules: string): this {
    this.projectRules = rules
    this.invalidateCache()
    return this
  }

  addSkill(skillContent: string): this {
    this.skills.push(skillContent)
    this.invalidateCache()
    return this
  }

  clearSkills(): this {
    this.skills = []
    this.invalidateCache()
    return this
  }

  appendMcpInstructions(instructions: McpServerInstructions): this {
    this.mcpInstructions.set(instructions.serverId, instructions)
    this.invalidateCache()
    return this
  }

  removeMcpInstructions(serverId: string): this {
    this.mcpInstructions.delete(serverId)
    this.invalidateCache()
    return this
  }

  clearMcpInstructions(): this {
    this.mcpInstructions.clear()
    this.invalidateCache()
    return this
  }

  addCustomInstruction(instruction: string): this {
    this.customInstructions.push(instruction)
    this.invalidateCache()
    return this
  }

  setTokenBudget(budget: number): this {
    this.tokenBudget = budget
    this.invalidateCache()
    return this
  }

  compose(): string {
    const newCacheKey = this.computeCacheKey()
    if (this.cacheKey === newCacheKey && this.cachedPrompt) {
      return this.cachedPrompt
    }

    const mcpArray = Array.from(this.mcpInstructions.values())

    this.cachedPrompt = composeSystemPrompt({
      basePrompt: this.basePrompt,
      projectRules: this.projectRules,
      skills: this.skills,
      mcpInstructions: mcpArray,
      customInstructions: this.customInstructions,
      tokenBudget: this.tokenBudget,
    })

    this.cacheKey = newCacheKey
    return this.cachedPrompt
  }

  getMcpServerIds(): string[] {
    return Array.from(this.mcpInstructions.keys())
  }

  getMcpInstructions(serverId: string): McpServerInstructions | undefined {
    return this.mcpInstructions.get(serverId)
  }

  private computeCacheKey(): string {
    const parts = [
      this.basePrompt.length,
      this.projectRules.length,
      this.skills.length,
      this.mcpInstructions.size,
      this.customInstructions.length,
      this.tokenBudget,
    ]
    return parts.join('-')
  }

  private invalidateCache(): void {
    this.cacheKey = ''
    this.cachedPrompt = null
  }

  reset(): this {
    this.basePrompt = ''
    this.projectRules = ''
    this.skills = []
    this.mcpInstructions.clear()
    this.customInstructions = []
    this.tokenBudget = DEFAULT_TOKEN_BUDGET
    this.invalidateCache()
    return this
  }
}

let composerInstance: SystemPromptComposer | null = null

export function getSystemPromptComposer(): SystemPromptComposer {
  if (!composerInstance) {
    composerInstance = new SystemPromptComposer()
  }
  return composerInstance
}

export function resetSystemPromptComposer(): void {
  composerInstance?.reset()
  composerInstance = null
}

export interface CacheablePromptBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' }
}

export function buildCacheableSystemBlocks(
  sections: PromptSection[],
  maxBreakpoints: number = 4,
): CacheablePromptBlock[] {
  const blocks: CacheablePromptBlock[] = []
  let usedBreakpoints = 0

  const sortedSections = [...sections].sort((a, b) => b.priority - a.priority)

  for (let i = 0; i < sortedSections.length; i++) {
    const section = sortedSections[i]!
    const isFirst = i === 0
    const isLast = i === sortedSections.length - 1
    const shouldCache =
      (isFirst || section.tokenCount && section.tokenCount > 1000) &&
      usedBreakpoints < maxBreakpoints

    const block: CacheablePromptBlock = {
      type: 'text',
      text: section.content,
    }

    if (shouldCache) {
      block.cache_control = {
        type: 'ephemeral',
        ttl: section.source === 'base' ? '1h' : '5m',
      }
      usedBreakpoints++
    }

    blocks.push(block)
  }

  return blocks
}

export function composeWithCacheControl(
  context: SystemPromptContext,
  options: {
    maxBreakpoints?: number
    defaultTtl?: '5m' | '1h'
  } = {},
): CacheablePromptBlock[] {
  const sections: PromptSection[] = []
  const tokenBudget = context.tokenBudget || DEFAULT_TOKEN_BUDGET
  const maxBreakpoints = options.maxBreakpoints ?? 4

  sections.push({
    id: 'base',
    priority: 100,
    content: context.basePrompt,
    source: 'base',
    tokenCount: estimateTokens(context.basePrompt),
    cacheControl: { type: 'ephemeral', ttl: '1h' },
  })

  if (context.projectRules) {
    sections.push({
      id: 'project',
      priority: 95,
      content: context.projectRules,
      source: 'project',
      tokenCount: estimateTokens(context.projectRules),
      cacheControl: { type: 'ephemeral', ttl: '5m' },
    })
  }

  if (context.mcpInstructions && context.mcpInstructions.length > 0) {
    const mcpContent = context.mcpInstructions
      .map((mcp) => formatMcpInstructionsBlock(mcp))
      .join('\n\n')
    sections.push({
      id: 'mcp',
      priority: 85,
      content: mcpContent,
      source: 'mcp',
      tokenCount: estimateTokens(mcpContent),
      cacheControl: { type: 'ephemeral', ttl: '5m' },
    })
  }

  if (context.skills && context.skills.length > 0) {
    for (let i = 0; i < context.skills.length; i++) {
      const skill = context.skills[i]!
      sections.push({
        id: `skill-${i}`,
        priority: 80 - i,
        content: skill,
        source: 'skill',
        tokenCount: estimateTokens(skill),
      })
    }
  }

  if (context.customInstructions && context.customInstructions.length > 0) {
    for (let i = 0; i < context.customInstructions.length; i++) {
      const custom = context.customInstructions[i]!
      sections.push({
        id: `custom-${i}`,
        priority: 60 - i,
        content: custom,
        source: 'custom',
        tokenCount: estimateTokens(custom),
      })
    }
  }

  return buildCacheableSystemBlocks(sections, maxBreakpoints)
}
