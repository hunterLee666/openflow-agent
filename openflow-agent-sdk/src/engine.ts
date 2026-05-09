/**
 * QueryEngine - Core agentic loop
 *
 * Manages the full conversation lifecycle:
 * 1. Take user prompt
 * 2. Build system prompt with context (git status, project context, tools)
 * 3. Call LLM API with tools (via provider abstraction)
 * 4. Stream response
 * 5. Execute tool calls (concurrent for read-only, serial for mutations)
 * 6. Send results back, repeat until done
 * 7. Auto-compact when context exceeds threshold
 * 8. Retry with exponential backoff on transient errors
 */

import type {
  SDKMessage,
  QueryEngineConfig,
  ToolDefinition,
  ToolResult,
  ToolContext,
  TokenUsage,
} from './types.js'
import { setDeferredTools } from './tools/tool-search.js'
import type {
  LLMProvider,
  CreateMessageResponse,
  NormalizedMessageParam,
  NormalizedTool,
  StreamChunk,
} from './providers/types.js'
import {
  estimateMessagesTokens,
  estimateCost,
  estimateTokens,
  getAutoCompactThreshold,
  getEffectiveTokenBudget,
} from './utils/tokens.js'
import {
  shouldAutoCompact,
  shouldTriggerCircuitBreaker,
  compactConversation,
  microCompactMessages,
  createAutoCompactState,
  getCostWarningLevel,
  getCostWarningMessage,
  type AutoCompactState,
} from './utils/compact.js'
import {
  withRetry,
  isPromptTooLongError,
} from './utils/retry.js'
import { getSystemContext, getUserContext } from './utils/context.js'
import { buildSystemPrompt as buildPromptModules } from './utils/prompt-builder.js'
import { defaultSpeculativeCheck, validateToolOutput, defaultValidateInput, evaluatePermission } from './utils/governance.js'
import { normalizeMessagesForAPI } from './utils/messages.js'
import type { HookRegistry, HookInput, HookOutput } from './hooks.js'
import { formatSkillsForPrompt } from './skills/index.js'


// ============================================================================
// Tool format conversion
// ============================================================================

/** Convert a ToolDefinition to the normalized provider tool format. */
function toProviderTool(tool: ToolDefinition): NormalizedTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }
}

// ============================================================================
// ToolUseBlock (internal type for extracted tool_use blocks)
// ============================================================================

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: any
}

// ============================================================================
// System Prompt Builder
// ============================================================================

async function buildSystemPrompt(config: QueryEngineConfig): Promise<string> {
  // Option 1: Full custom override (backward compatible)
  if (config.systemPrompt) {
    const base = config.systemPrompt
    return config.appendSystemPrompt
      ? base + '\n\n' + config.appendSystemPrompt
      : base
  }

   // Option 2: Use modular prompt engineering (Part 05 style)
   if (config.systemPromptConfig) {
      const ctx = {
        cwd: config.cwd,
        model: config.model,
        tools: config.tools.map(t => ({ name: t.name, description: t.description })),
        agents: config.agents,
        tokenBudget: config.maxTokensBudget,
        projectContext: '',
        mcpServers: config.mcpServers,
      }

     // Build core sections without appending user content yet
     const sections = buildPromptModules(
       ctx,
       config.systemPromptConfig,
       undefined,
       undefined
     )

     // Inject available skills
     const skillsSection = formatSkillsForPrompt()
     if (skillsSection) {
       sections.push('\n# Available Skills')
       sections.push(skillsSection)
     }

     // Append any user-provided system prompt addition
     if (config.appendSystemPrompt) {
       sections.push('\n' + config.appendSystemPrompt)
     }

     return sections.join('\n\n')
   }

  // Option 3: Legacy default behavior (simple concatenation)
  const parts: string[] = []

  parts.push(
    'You are an AI assistant with access to tools. Use the tools provided to help the user accomplish their tasks.',
    'You should use tools when they would help you complete the task more accurately or efficiently.',
  )

  // List available tools with descriptions
  parts.push('\n# Available Tools\n')
  for (const tool of config.tools) {
    parts.push(`- **${tool.name}**: ${tool.description}`)
  }

   // Add agent definitions
   if (config.agents && Object.keys(config.agents).length > 0) {
     parts.push('\n# Available Subagents\n')
     for (const [name, def] of Object.entries(config.agents)) {
       parts.push(`- **${name}**: ${def.description}`)
     }
   }

   // Available skills
   const skillsSection = formatSkillsForPrompt()
   if (skillsSection) {
     parts.push('\n# Available Skills')
     parts.push(skillsSection)
   }

   // System context (git status, etc.)
  try {
    const sysCtx = await getSystemContext(config.cwd)
    if (sysCtx) {
      parts.push('\n# Environment\n')
      parts.push(sysCtx)
    }
  } catch {
    // Context is best-effort
  }

  // User context (AGENT.md, date)
  try {
    const userCtx = await getUserContext(config.cwd)
    if (userCtx) {
      parts.push('\n# Project Context\n')
      parts.push(userCtx)
    }
  } catch {
    // Context is best-effort
  }

  // Working directory
  parts.push(`\n# Working Directory\n${config.cwd}`)

  if (config.appendSystemPrompt) {
    parts.push('\n' + config.appendSystemPrompt)
  }

  return parts.join('\n')
}

// ============================================================================
// QueryEngine
// ============================================================================

export class QueryEngine {
  private config: QueryEngineConfig
  private provider: LLMProvider
  public messages: NormalizedMessageParam[] = []
  private totalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 }
  private totalCost = 0
  private turnCount = 0
  private compactState: AutoCompactState
  private sessionId: string
  private apiTimeMs = 0
  private hookRegistry?: HookRegistry
  private skillStack: { allowedTools: string[]; model?: string }[] = []

  // Lazy loading: dynamically mounted tools (names)
  private mountedToolNames: Set<string>
  // All available tools (full set)
  private allTools: ToolDefinition[]

  constructor(config: QueryEngineConfig) {
    this.config = config
    this.provider = config.provider
    this.compactState = createAutoCompactState()
    this.sessionId = config.sessionId || crypto.randomUUID()
    this.hookRegistry = config.hookRegistry

    // Initialize tool sets for lazy loading
    this.allTools = config.tools
    const lazyLoad = config.lazyLoad !== false // default true

    // Determine initial mounted tools:
    // - If lazyLoad disabled, mount everything
    // - Else if allowedTools is set, use that as initial mount
    // - Otherwise, mount core tools + ToolSearch by default
    if (!lazyLoad) {
      this.mountedToolNames = new Set(config.tools.map(t => t.name))
    } else {
      const allowed = config.allowedTools
      if (allowed && allowed.length > 0) {
        this.mountedToolNames = new Set(allowed)
      } else {
        // Core set: minimal file I/O + discovery + agent creation
        this.mountedToolNames = new Set([
          'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
          'ToolSearch', 'Agent', 'TaskCreate', 'TaskList',
        ])
      }
    }

    // Register all tools with ToolSearchTool for lazy loading discovery
    setDeferredTools(this.allTools)

    // Log tool loading stats (for debugging/optimization)
    if (process.env.DEBUG_TOOLS === '1') {
      const mounted = this.getMountedTools()
      const totalSchemaTokens = mounted.reduce((sum, t) => {
        return sum + estimateTokens(JSON.stringify(t.inputSchema))
      }, 0)
      console.log(`[QueryEngine] Initialized with ${mounted.length} mounted tools, ~${totalSchemaTokens} tool schema tokens`)
    }
  }

  /**
   * Get currently mounted tools (for API call)
   */
  private getMountedTools(): ToolDefinition[] {
    return this.allTools.filter(t => this.mountedToolNames.has(t.name))
  }

  /**
   * Dynamically mount additional tools (lazy loading)
   * Honors allowedTools if set (strict whitelist)
   * No-op if lazy loading is disabled.
   */
  private mountTools(toolNames: string[]): void {
    if (this.config.lazyLoad === false) return // lazy loading disabled
    const allowedSet = this.config.allowedTools ? new Set(this.config.allowedTools) : null
    for (const name of toolNames) {
      // Must exist in allTools
      if (!this.allTools.some(t => t.name === name)) continue
      // If allowedTools whitelist is set, only allow those
      if (allowedSet !== null && !allowedSet.has(name)) continue
      this.mountedToolNames.add(name)
    }
  }

  /**
   * Execute hooks for a lifecycle event.
   * Returns hook outputs; never throws.
   */
  private async executeHooks(
    event: import('./hooks.js').HookEvent,
    extra?: Partial<HookInput>,
  ): Promise<HookOutput[]> {
    if (!this.hookRegistry?.hasHooks(event)) return []
    try {
      return await this.hookRegistry.execute(event, {
        event,
        sessionId: this.sessionId,
        cwd: this.config.cwd,
        ...extra,
      })
    } catch {
      return []
    }
  }

  /**
   * Submit a user message and run the agentic loop.
   * Yields SDKMessage events as the agent works.
   */
  async *submitMessage(
    prompt: string | any[],
  ): AsyncGenerator<SDKMessage> {
    // Hook: SessionStart
    await this.executeHooks('SessionStart')

    // Hook: UserPromptSubmit
    const userHookResults = await this.executeHooks('UserPromptSubmit', {
      toolInput: prompt,
    })
    // Check if any hook blocks the submission
    if (userHookResults.some((r) => r.block)) {
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        usage: this.totalUsage,
        num_turns: 0,
        cost: 0,
        errors: ['Blocked by UserPromptSubmit hook'],
      }
      return
    }

    // Add user message
    this.messages.push({ role: 'user', content: prompt as any })

    // Initial tool set (lazy loading: only mounted tools are sent to API)
    let effectiveTools = this.getMountedTools().map(toProviderTool)

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(this.config)

    // Emit init system message
    yield {
      type: 'system',
      subtype: 'init',
      session_id: this.sessionId,
      tools: this.config.tools.map(t => t.name),
      model: this.config.model,
      cwd: this.config.cwd,
      mcp_servers: [],
      permission_mode: 'bypassPermissions',
    } as SDKMessage

    // Agentic loop
    let turnsRemaining = this.config.maxTurns ?? 10
    let budgetExceeded = false
    let maxOutputRecoveryAttempts = 0
    const MAX_OUTPUT_RECOVERY = 3

    while (turnsRemaining > 0) {
      if (this.config.abortSignal?.aborted) break

      // Check budget
      if (this.config.maxBudgetUsd && this.totalCost >= this.config.maxBudgetUsd) {
        budgetExceeded = true
        break
      }

      // Auto-compact if context is too large
      if (shouldAutoCompact(this.messages as any[], this.config.model, this.compactState)) {
        await this.executeHooks('PreCompact')
        try {
          const result = await compactConversation(
            this.provider,
            this.config.model,
            this.messages as any[],
            this.compactState,
          )
          this.messages = result.compactedMessages as NormalizedMessageParam[]
          this.compactState = result.state
          await this.executeHooks('PostCompact')
        } catch {
          // Continue with uncompacted messages
        }
      }

      // Micro-compact: truncate large tool results
      const apiMessages = microCompactMessages(
        normalizeMessagesForAPI(this.messages as any[]),
      ) as NormalizedMessageParam[]

      this.turnCount++
      turnsRemaining--

      // Determine effective tools and model based on active skill stack and lazy-loaded tools
      let effectiveTools = this.getMountedTools().map(toProviderTool)
      let effectiveModel = this.config.model
      if (this.skillStack.length > 0) {
        const top = this.skillStack[this.skillStack.length - 1]
        if (top.allowedTools.length > 0) {
          effectiveTools = effectiveTools.filter(t => top.allowedTools.includes(t.name))
        }
        if (top.model) effectiveModel = top.model
      }

      // Make API call with retry via provider
      let response: CreateMessageResponse
      const apiStart = performance.now()
      try {
        response = await withRetry(
          async () => {
            return this.provider.createMessage({
              model: effectiveModel,
              maxTokens: this.config.maxTokens ?? 16384,
              system: systemPrompt,
              messages: apiMessages,
              tools: effectiveTools.length > 0 ? effectiveTools : undefined,
              thinking:
                this.config.thinking?.type === 'enabled' &&
                this.config.thinking.budgetTokens
                  ? {
                      type: 'enabled',
                      budget_tokens: this.config.thinking.budgetTokens,
                    }
                  : undefined,
            })
          },
          undefined,
          this.config.abortSignal,
        )
      } catch (err: any) {
        // Handle prompt-too-long by compacting
        if (isPromptTooLongError(err) && !this.compactState.compacted) {
          try {
            const result = await compactConversation(
              this.provider,
              this.config.model,
              this.messages as any[],
              this.compactState,
            )
            this.messages = result.compactedMessages as NormalizedMessageParam[]
            this.compactState = result.state
            turnsRemaining++ // Retry this turn
            this.turnCount--
            continue
          } catch {
            // Can't compact, give up
          }
        }

        yield {
          type: 'result',
          subtype: 'error',
          usage: this.totalUsage,
          num_turns: this.turnCount,
          cost: this.totalCost,
        }
        return
      }

      // Track API timing
      this.apiTimeMs += performance.now() - apiStart

      // Track usage (normalized by provider)
      if (response.usage) {
        this.totalUsage.input_tokens += response.usage.input_tokens
        this.totalUsage.output_tokens += response.usage.output_tokens
        if (response.usage.cache_creation_input_tokens) {
          this.totalUsage.cache_creation_input_tokens =
            (this.totalUsage.cache_creation_input_tokens || 0) +
            response.usage.cache_creation_input_tokens
        }
        if (response.usage.cache_read_input_tokens) {
          this.totalUsage.cache_read_input_tokens =
            (this.totalUsage.cache_read_input_tokens || 0) +
            response.usage.cache_read_input_tokens
        }
       }

       // Emit cost/token warning if threshold reached
       const costWarningLevel = getCostWarningLevel(
         this.totalUsage.input_tokens + this.totalUsage.output_tokens,
         this.config.model,
       )
       if (costWarningLevel !== 'normal') {
         const warningMsg = getCostWarningMessage(costWarningLevel)
         if (warningMsg) {
           // Emit as status system message (non-intrusive)
           yield {
             type: 'system',
             subtype: 'status',
             message: `[Token usage] ${warningMsg}`,
           } as SDKMessage
         }
       }

       // Update total cost
       this.totalCost += estimateCost(this.config.model, response.usage)

       // Add assistant message to conversation
      this.messages.push({ role: 'assistant', content: response.content as any })

      // Yield assistant message
      yield {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: response.content as any,
        },
      }

      // Handle max_output_tokens recovery
      if (
        response.stopReason === 'max_tokens' &&
        maxOutputRecoveryAttempts < MAX_OUTPUT_RECOVERY
      ) {
        maxOutputRecoveryAttempts++
        // Add continuation prompt
        this.messages.push({
          role: 'user',
          content: 'Please continue from where you left off.',
        })
        continue
      }

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use',
      )

      if (toolUseBlocks.length === 0) {
        // Pop skill stack if we're ending (final answer)
        if (this.skillStack.length > 0) {
          this.skillStack.pop()
        }
        break // No tool calls - agent is done
      }

      // Reset max_output recovery counter on successful tool use
      maxOutputRecoveryAttempts = 0

       // Execute tools (concurrent read-only, serial mutations)
       const toolResults = await this.executeTools(toolUseBlocks)

       // Yield tool results
       for (const result of toolResults) {
         yield {
           type: 'tool_result',
           result: {
             tool_use_id: result.tool_use_id,
             tool_name: result.tool_name || '',
             output:
               typeof result.content === 'string'
                 ? result.content
                 : JSON.stringify(result.content),
           },
         }
       }

       // Add tool results to conversation
       this.messages.push({
         role: 'user',
         content: toolResults.map((r) => ({
           type: 'tool_result' as const,
           tool_use_id: r.tool_use_id,
           content:
             typeof r.content === 'string'
               ? r.content
               : JSON.stringify(r.content),
           is_error: r.is_error,
         })),
        })

       // Check for skill invocations to push onto stack
       for (const result of toolResults) {
         if (result.tool_name === 'Skill' && !result.is_error) {
           try {
             const data = typeof result.content === 'string' ? JSON.parse(result.content) : null
             if (data) {
               this.skillStack.push({
                 allowedTools: data.allowedTools || [],
                 model: data.model,
               })
             }
           } catch (e) {
             // ignore parse errors
           }
         }

         // Lazy loading: handle ToolSearch results to mount additional tools
         if (result.tool_name === 'ToolSearch' && !result.is_error && typeof result.content === 'string') {
           const content = result.content as string
           const match = content.match(/Found \d+ tool\(s\):\n([\s\S]*)/)
           if (match) {
             const toolListText = match[1]
             const toolNames: string[] = []
             for (const line of toolListText.split('\n')) {
               const nameMatch = line.match(/^-\s*([^:]+):/)
               if (nameMatch) {
                 const name = nameMatch[1].trim()
                 if (!this.mountedToolNames.has(name)) {
                   toolNames.push(name)
                 }
               }
             }
             if (toolNames.length > 0) {
               this.mountTools(toolNames)
               // Update effective tools for subsequent turns in this loop
               effectiveTools = this.getMountedTools().map(toProviderTool)
             }
           }
         }
       }

      if (response.stopReason === 'end_turn') break
    }

    // Hook: Stop (end of agentic loop)
    await this.executeHooks('Stop')

    // Hook: SessionEnd
    await this.executeHooks('SessionEnd')

    // Yield enriched final result
    const endSubtype = budgetExceeded
      ? 'error_max_budget_usd'
      : turnsRemaining <= 0
        ? 'error_max_turns'
        : 'success'

    yield {
      type: 'result',
      subtype: endSubtype,
      session_id: this.sessionId,
      is_error: endSubtype !== 'success',
      num_turns: this.turnCount,
      total_cost_usd: this.totalCost,
      duration_api_ms: Math.round(this.apiTimeMs),
      usage: this.totalUsage,
      model_usage: { [this.config.model]: { input_tokens: this.totalUsage.input_tokens, output_tokens: this.totalUsage.output_tokens } },
      cost: this.totalCost,
    }
  }/**
   * Execute tool calls with concurrency control.
   *
   * Read-only tools run concurrently (up to 10 at a time).
   * Mutation tools run sequentially.
   */
  private async executeTools(
    toolUseBlocks: ToolUseBlock[],
  ): Promise<(ToolResult & { tool_name?: string })[]> {
    const context: ToolContext = {
      cwd: this.config.cwd,
      abortSignal: this.config.abortSignal,
      provider: this.provider,
      model: this.config.model,
      apiType: this.provider.apiType,
    }

    const MAX_CONCURRENCY = parseInt(
      process.env.AGENT_SDK_MAX_TOOL_CONCURRENCY || '10',
    )

    // Partition into read-only (concurrent) and mutation (serial)
    const readOnly: Array<{ block: ToolUseBlock; tool?: ToolDefinition }> = []
    const mutations: Array<{ block: ToolUseBlock; tool?: ToolDefinition }> = []

    for (const block of toolUseBlocks) {
      const tool = this.config.tools.find((t) => t.name === block.name)
      if (tool?.isReadOnly?.()) {
        readOnly.push({ block, tool })
      } else {
        mutations.push({ block, tool })
      }
    }

    const results: (ToolResult & { tool_name?: string })[] = []

    // Execute read-only tools concurrently (batched by MAX_CONCURRENCY)
    for (let i = 0; i < readOnly.length; i += MAX_CONCURRENCY) {
      const batch = readOnly.slice(i, i + MAX_CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map((item) =>
          this.executeSingleTool(item.block, item.tool, context),
        ),
      )
      results.push(...batchResults)
    }

    // Execute mutation tools sequentially
    for (const item of mutations) {
      const result = await this.executeSingleTool(item.block, item.tool, context)
      results.push(result)
    }

    return results
  }

  /**
   * Execute a single tool with permission checking.
   */
  private async executeSingleTool(
    block: ToolUseBlock,
    tool: ToolDefinition | undefined,
    context: ToolContext,
  ): Promise<ToolResult & { tool_name?: string }> {
    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Error: Unknown tool "${block.name}"`,
        is_error: true,
        tool_name: block.name,
      }
    }

    // PreToolUse hook (early, before other checks)
    let effectiveToolName = block.name
    let effectiveInput = block.input
     let effectiveTool: ToolDefinition | undefined = tool

    const preHookResults = await this.executeHooks('PreToolUse', {
      toolName: block.name,
      toolInput: block.input,
      toolUseId: block.id,
    })

    // Process decisions: block first, then modify
    for (const result of preHookResults) {
      if (result.block) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.message || 'Blocked by PreToolUse hook',
          is_error: true,
          tool_name: block.name,
        }
      }
      if (result.modify) {
        if (result.modify.toolName) {
          effectiveToolName = result.modify.toolName
        }
        if (result.modify.toolInput) {
          effectiveInput = { ...effectiveInput, ...result.modify.toolInput }
        }
      }
    }

    // If tool name changed, resolve new tool definition
    if (effectiveToolName !== block.name) {
      effectiveTool = this.config.tools.find((t) => t.name === effectiveToolName)
      if (!effectiveTool) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: Modified tool "${effectiveToolName}" not found`,
          is_error: true,
          tool_name: block.name,
        }
      }
    }

    // Check enabled for effectiveTool
    if (effectiveTool.isEnabled && !effectiveTool.isEnabled()) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Error: Tool "${effectiveToolName}" is not enabled`,
        is_error: true,
        tool_name: block.name,
      }
    }

    // Speculative classification (step 4 of governance pipeline)
    if (effectiveTool.speculativeCheck) {
      const specResult = effectiveTool.speculativeCheck(effectiveInput, context)
      if (!specResult.allowed) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: specResult.message || `Speculative check blocked tool "${effectiveToolName}": ${specResult.reason}`,
          is_error: true,
          tool_name: block.name,
        }
      }
    } else {
      // Default speculative check for Bash tool
      if (effectiveToolName === 'Bash') {
        const specResult = defaultSpeculativeCheck(effectiveToolName, effectiveInput, context)
        if (!specResult.allowed) {
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: specResult.message || `Speculative check blocked: ${specResult.reason}`,
            is_error: true,
            tool_name: block.name,
          }
        }
      }
    }

    // Input validation (step 3 of governance pipeline)
    let finalInput = effectiveInput
    if (effectiveTool.validateInput) {
      const validateResult = effectiveTool.validateInput(effectiveInput, context)
      if (!validateResult.valid) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Input validation error: ${validateResult.error}`,
          is_error: true,
          tool_name: block.name,
        }
      }
      if (validateResult.sanitizedInput) {
        finalInput = validateResult.sanitizedInput
      }
    } else {
      // Default validation for known tools
      const defaultResult = defaultValidateInput(effectiveToolName, effectiveInput, context)
      if (!defaultResult.valid) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Input validation error: ${defaultResult.error}`,
          is_error: true,
          tool_name: block.name,
        }
      }
      if (defaultResult.sanitizedInput) {
        finalInput = defaultResult.sanitizedInput
      }
    }

    // Permission pipeline (steps 1-3, 6-7 of 7-step evaluation)
    if (this.config.permissionConfig) {
      const pipelineResult = await evaluatePermission({
        toolName: effectiveToolName,
        input: finalInput,
        permissionMode: this.config.permissionMode || 'default',
        permissionConfig: this.config.permissionConfig,
        allowedTools: this.config.allowedTools,
      })

      if (pipelineResult.decision === 'deny') {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Permission denied (step ${pipelineResult.step}): ${pipelineResult.reason}`,
          is_error: true,
          tool_name: block.name,
        }
      }

      if (pipelineResult.decision === 'ask') {
        if (this.config.permissionConfig.requestUserConfirmation) {
          const userConfirm = await this.config.permissionConfig.requestUserConfirmation(
            effectiveToolName,
            finalInput,
            pipelineResult.reason
          )
          if (!userConfirm) {
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Permission denied by user: ${pipelineResult.reason}`,
              is_error: true,
              tool_name: block.name,
            }
          }
        } else {
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Permission requires confirmation: ${pipelineResult.reason}`,
            is_error: true,
            tool_name: block.name,
          }
        }
      }
    }

    // Custom permission handler (step 4, can override)
    if (this.config.canUseTool) {
      try {
        const permission = await this.config.canUseTool(effectiveTool, finalInput)
        if (permission.behavior === 'deny') {
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: permission.message || `Permission denied for tool "${effectiveToolName}"`,
            is_error: true,
            tool_name: block.name,
          }
        }
        if (permission.updatedInput !== undefined) {
          finalInput = permission.updatedInput
        }
      } catch (err: any) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Permission check error: ${err.message}`,
          is_error: true,
          tool_name: block.name,
        }
      }
    }

    // Execute the tool with finalInput
    try {
      const result = await effectiveTool.call(finalInput, context)

      // Hook: PostToolUse
      await this.executeHooks('PostToolUse', {
        toolName: block.name,
        toolInput: finalInput,
        toolUseId: block.id,
        toolResult: result,
      })

      // Output schema validation (step 12 of governance pipeline)
      if (effectiveTool.outputSchema) {
        const outputValidation = validateToolOutput(result, effectiveTool.outputSchema)
        if (!outputValidation.valid) {
          await this.executeHooks('PostToolUseFailure', {
            toolName: block.name,
            toolInput: finalInput,
            toolUseId: block.id,
            error: outputValidation.error,
          })
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Output validation error: ${outputValidation.error}`,
            is_error: true,
            tool_name: block.name,
          }
        }
      }

      return { ...result, tool_use_id: block.id, tool_name: block.name }
    } catch (err: any) {
      // Hook: PostToolUseFailure
      await this.executeHooks('PostToolUseFailure', {
        toolName: block.name,
        toolInput: finalInput,
        toolUseId: block.id,
        error: err.message,
      })

      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Tool execution error: ${err.message}`,
        is_error: true,
         tool_name: block.name,
       }
      }
  }

   /**
   * Get current messages for session persistence.
   */
  getMessages(): NormalizedMessageParam[] {
    return [...this.messages]
  }

  /**
   * Get total usage across all turns.
   */
  getUsage(): TokenUsage {
    return { ...this.totalUsage }
  }

  /**
   * Get total cost.
   */
  getCost(): number {
    return this.totalCost
  }
}
