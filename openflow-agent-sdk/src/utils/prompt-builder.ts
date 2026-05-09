/**
 * System Prompt Builder (Part 05: Prompt Engineering)
 *
 * Implements the modular prompt engineering system:
 * - Static Constitution (6 modules): cached prefix
 * - Dynamic Policy (6 injections): varies per session
 * - SYSTEM_PROMPT_DYNAMIC_BOUNDARY: enables cache optimization
 */

import type { SystemPromptConfig, StaticConstitution, DynamicPolicy } from '../types.js'

/**
 * Default static constitution: identity and guidelines.
 */
export const DEFAULT_STATIC_CONSTITUTION: StaticConstitution = {
  identity: `You are an AI assistant with access to tools. Use the tools provided to help the user accomplish their tasks efficiently and accurately.`,
  
  operationalNorms: `Before executing complex tasks: understand the goal, plan your approach, and verify results. Always prefer explicit verification over assumption.`,
  
  taskPhilosophy: `Focus on the user's explicit request. Avoid scope creep. Complete tasks rather than leaving them partially done. Prefer simple, readable solutions over clever abstractions.`,
  
  riskSafety: `Handle sensitive data (API keys, passwords, tokens) with care. Never expose secrets in logs or output. When in doubt about destructive operations, ask for confirmation first.`,
  
  toolsRules: `Use tools for file operations and command execution. Prefer reading files before modifying. For Bash commands, explain what the command does. Fail closed when tool capabilities are unclear.`,
  
  voiceTone: `Be concise and practical. Prioritize clarity over verbosity. Use code blocks for technical content. When unsure, acknowledge uncertainty.`,
}

/**
 * Dynamic policy context generators.
 */
export interface DynamicPolicyContext {
  cwd: string
  model: string
  tools: Array<{ name: string; description: string }>
  agents?: Record<string, { description: string }>
  mcpServers?: Record<string, { name: string; tools?: string[] }>
  tokenBudget?: number | false
  usedTokens?: number
  sessionId?: string
  projectContext?: string
  memoryInjections?: string[]
}

/**
 * Build session preamble (dynamic injection #1).
 */
export function buildSessionPreamble(ctx: DynamicPolicyContext): string {
  const parts: string[] = []
  if (ctx.sessionId) {
    parts.push(`Session: ${ctx.sessionId}`)
  }
  return parts.length > 0 ? parts.join('\n') : ''
}

/**
 * Build environment info (dynamic injection #3).
 */
export function buildEnvironmentBlock(cwd: string): string {
  return `# Working Directory\n${cwd}`
}

/**
 * Build token budget hint (dynamic injection #6).
 */
export function buildTokenBudgetHint(
  tokenBudget: number | false | undefined, 
  usedTokens?: number
): string {
  if (tokenBudget === false || tokenBudget === undefined) {
    return ''
  }
  const used = usedTokens || 0
  const remaining = tokenBudget - used
  const percent = Math.round((remaining / tokenBudget) * 100)
  return `Token budget: ~${remaining.toLocaleString()} / ${tokenBudget.toLocaleString()} remaining (${percent}%)`
}

/**
 * Build MCP server section (dynamic injection #5).
 */
export function buildMcpSection(
  mcpServers: Record<string, { name: string; tools?: string[]; instructions?: string }> = {}
): string {
  const entries = Object.entries(mcpServers)
  if (entries.length === 0) return ''

  const lines = ['# Available MCP Servers']
  for (const [key, config] of entries) {
    lines.push(`- **${config.name}**`)
    if (config.tools && config.tools.length > 0) {
      lines.push(`  Tools: ${config.tools.join(', ')}`)
    }
    if (config.instructions) {
      lines.push(`  Instructions: ${config.instructions}`)
    }
  }
  return lines.join('\n')
}

/**
 * Format static constitution as string.
 */
export interface CacheableTextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export function formatStaticConstitution(
  staticCfg: StaticConstitution = DEFAULT_STATIC_CONSTITUTION,
  customSections: Record<string, string> = {}
): CacheableTextBlock[] {
  const parts: CacheableTextBlock[] = []

  // Identity first
  if (staticCfg.identity) {
    parts.push({ type: 'text', text: staticCfg.identity, cache_control: { type: 'ephemeral' } })
  }

  // Operational norms
  if (staticCfg.operationalNorms) {
    parts.push({ type: 'text', text: `## Operational Norms\n${staticCfg.operationalNorms}`, cache_control: { type: 'ephemeral' } })
  }

  // Task philosophy
  if (staticCfg.taskPhilosophy) {
    parts.push({ type: 'text', text: `## Task Philosophy\n${staticCfg.taskPhilosophy}`, cache_control: { type: 'ephemeral' } })
  }

  // Risk & safety
  if (staticCfg.riskSafety) {
    parts.push({ type: 'text', text: `## Risk & Safety\n${staticCfg.riskSafety}`, cache_control: { type: 'ephemeral' } })
  }

  // Tools rules
  if (staticCfg.toolsRules) {
    parts.push({ type: 'text', text: `## Tools Usage\n${staticCfg.toolsRules}`, cache_control: { type: 'ephemeral' } })
  }

  // Voice & tone
  if (staticCfg.voiceTone) {
    parts.push({ type: 'text', text: `## Communication Style\n${staticCfg.voiceTone}`, cache_control: { type: 'ephemeral' } })
  }

  // Custom static sections
  for (const [key, value] of Object.entries(customSections)) {
    parts.push({ type: 'text', text: `## ${key}\n${value}`, cache_control: { type: 'ephemeral' } })
  }

  return parts
}

/**
 * Format dynamic policy as string.
 */
export function formatDynamicPolicy(
  ctx: DynamicPolicyContext,
  dynamicCfg: Partial<DynamicPolicy> = {},
  config: {
    enableBoundaryMarker?: boolean
    boundaryMarker?: string
    includeTokenBudget?: boolean
    maxMemoryInjections?: number
    customSections?: Record<string, string>
    customToolDescriptions?: Record<string, string>
  } = {}
): string[] {
  const parts: string[] = []
  const marker = config.boundaryMarker ?? '---'

  // Session preamble
  const preamble = dynamicCfg.sessionPreamble ?? buildSessionPreamble(ctx)
  if (preamble) {
    if (config.enableBoundaryMarker) {
      parts.push(`\n${marker}\n`)
    }
    parts.push(`# Session Context\n${preamble}`)
  }

  // Memory injections
  const memories = ctx.memoryInjections || []
  const maxMem = config.maxMemoryInjections ?? 5
  if (memories.length > 0) {
    parts.push(`# Recent Context\n${memories.slice(0, maxMem).join('\n')}`)
  }

  // Environment
  const envInfo = dynamicCfg.environment ?? buildEnvironmentBlock(ctx.cwd)
  if (envInfo) {
    parts.push(envInfo)
  }

  // Project context (CLAUDE.md, AGENT.md)
  if (ctx.projectContext) {
    parts.push(`# Project Context\n${ctx.projectContext}`)
  }

  // Tools section with custom descriptions
  if (ctx.tools.length > 0) {
    const lines = ['# Available Tools']
    for (const tool of ctx.tools) {
      const customDesc = config.customToolDescriptions?.[tool.name]
      const desc = customDesc ?? tool.description
      lines.push(`- **${tool.name}**: ${desc}`)
    }
    // Subagents
    if (ctx.agents && Object.keys(ctx.agents).length > 0) {
      lines.push('\n# Available Subagents')
      for (const [name, def] of Object.entries(ctx.agents)) {
        lines.push(`- **${name}**: ${def.description}`)
      }
    }
    parts.push(lines.join('\n'))
  }

  // MCP servers
  const mcpSection = dynamicCfg.mcpServers ?? buildMcpSection(ctx.mcpServers || {})
  if (mcpSection) {
    parts.push(mcpSection)
  }

  // Token budget hint
  if (config.includeTokenBudget && ctx.tokenBudget && typeof ctx.tokenBudget === 'number') {
    const hint = dynamicCfg.tokenBudgetHint ?? buildTokenBudgetHint(ctx.tokenBudget, ctx.usedTokens || 0)
    parts.push(hint)
  }

  // Custom dynamic sections
  for (const [key, value] of Object.entries(config.customSections || {})) {
    parts.push(`## ${key}\n${value}`)
  }

  return parts
}

/**
 * Build complete system prompt from configuration.
 *
 * Supports Guide Part 05 architecture:
 * - Static Constitution (cached prefix) + Dynamic Policy (boundary-separated suffix)
 * - Full customization via SystemPromptConfig
 *
 * Returns an array of blocks that can be either plain strings or structured
 * text blocks with cache_control for prompt caching.
 */
export function buildSystemPrompt(
  ctx: DynamicPolicyContext,
  config?: SystemPromptConfig,
  baseSystemPrompt?: string,
  appendSystemPrompt?: string
): Array<string | CacheableTextBlock> {
  // Use custom config if provided
  const cfg = config ?? {}
  const enableBoundary = cfg.enableBoundaryMarker ?? true
  const boundaryMarker = cfg.boundaryMarker ?? '---'

  const sections: Array<string | CacheableTextBlock> = []

  // Option 1: Full custom override
  if (baseSystemPrompt) {
    // Handle string or array of blocks
    if (Array.isArray(baseSystemPrompt)) {
      sections.push(...baseSystemPrompt)
    } else {
      sections.push({ type: 'text', text: baseSystemPrompt, cache_control: { type: 'ephemeral' } })
    }
    
    // Append dynamic sections after boundary
    if (enableBoundary) {
      sections.push({ type: 'text', text: `\n${boundaryMarker}\n` })
    }
    
    const dynamicParts = formatDynamicPolicy(ctx, cfg.dynamic, {
      enableBoundaryMarker: false,
      includeTokenBudget: cfg.includeTokenBudget,
      maxMemoryInjections: cfg.maxMemoryInjections,
      customToolDescriptions: cfg.customToolDescriptions,
    })
    for (const part of dynamicParts) {
      sections.push({ type: 'text', text: part })
    }
    
    if (appendSystemPrompt) {
      sections.push({ type: 'text', text: `\n${appendSystemPrompt}` })
    }
    
    return sections
  }

  // Option 2: Use constitution + policy structure
  // Static (constitution) - cached prefix
   const staticParts = formatStaticConstitution(
     cfg.static ?? DEFAULT_STATIC_CONSTITUTION,
     cfg.staticSections ?? {}
   )
   // formatStaticConstitution already returns CacheableTextBlock with cache_control
   sections.push(...staticParts)

  // Boundary marker
  if (enableBoundary) {
    sections.push({ type: 'text', text: `\n${boundaryMarker}\n` })
  }

  // Dynamic (policy) - varies per session
  const dynamicParts = formatDynamicPolicy(ctx, cfg.dynamic, {
    enableBoundaryMarker: false,
    includeTokenBudget: cfg.includeTokenBudget,
    maxMemoryInjections: cfg.maxMemoryInjections,
    customToolDescriptions: cfg.customToolDescriptions,
    customSections: cfg.dynamicSections,
  })
  for (const part of dynamicParts) {
    sections.push({ type: 'text', text: part })
  }

  // Append custom content
  if (appendSystemPrompt) {
    sections.push({ type: 'text', text: `\n${appendSystemPrompt}` })
  }

  return sections
}

/**
 * Get the static constitution as a single string (for caching analysis).
 */
export function getStaticConstitutionString(
  config?: Partial<StaticConstitution>
): string {
  return formatStaticConstitution(config ?? DEFAULT_STATIC_CONSTITUTION).join('\n\n')
}

/**
 * Estimate static constitution token count.
 */
export function estimateStaticConstitutionTokens(
  config?: Partial<StaticConstitution>
): number {
  const str = getStaticConstitutionString(config)
  return Math.ceil(str.length / 4)
}