/**
 * Core type definitions for the Agent SDK
 */

import type { LLMProvider } from './providers/types.js'
import type { HookRegistry } from './hooks.js'

// Content block types (provider-agnostic, compatible with Anthropic format)
export type ContentBlockParam =
  | { type: 'text'; text: string }
  | { type: 'image'; source: any }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string | any[]; is_error?: boolean }

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'thinking'; thinking: string }

// --------------------------------------------------------------------------
// Message Types
// --------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant'

export interface ConversationMessage {
  role: MessageRole
  content: string | ContentBlockParam[]
}

export interface UserMessage {
  type: 'user'
  message: ConversationMessage
  uuid: string
  timestamp: string
}

export interface AssistantMessage {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: ContentBlock[]
  }
  uuid: string
  timestamp: string
  usage?: TokenUsage
  cost?: number
}

export type Message = UserMessage | AssistantMessage

// --------------------------------------------------------------------------
// SDK Message Types (streaming events)
// --------------------------------------------------------------------------

export type SDKMessage =
  | SDKAssistantMessage
  | SDKToolResultMessage
  | SDKResultMessage
  | SDKPartialMessage
  | SDKSystemMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKTaskNotificationMessage
  | SDKRateLimitEvent

export interface SDKAssistantMessage {
  type: 'assistant'
  uuid?: string
  session_id?: string
  message: {
    role: 'assistant'
    content: ContentBlock[]
  }
  parent_tool_use_id?: string | null
}

export interface SDKToolResultMessage {
  type: 'tool_result'
  result: {
    tool_use_id: string
    tool_name: string
    output: string
  }
}

export interface SDKResultMessage {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_compaction_circuit_breaker' | 'error_token_budget_exceeded' | string
  uuid?: string
  session_id?: string
  is_error?: boolean
  num_turns?: number
  result?: string
  stop_reason?: string | null
  total_cost_usd?: number
  duration_ms?: number
  duration_api_ms?: number
  usage?: TokenUsage
  model_usage?: Record<string, { input_tokens: number; output_tokens: number }>
  permission_denials?: Array<{ tool: string; reason: string }>
  structured_output?: unknown
  errors?: string[]
  /** @deprecated Use total_cost_usd */
  cost?: number
}

export interface SDKPartialMessage {
  type: 'partial_message'
  partial: {
    type: 'text' | 'tool_use'
    text?: string
    name?: string
    input?: string
  }
}

/** Emitted once at session start with initialization info. */
export interface SDKSystemMessage {
  type: 'system'
  subtype: 'init'
  uuid?: string
  session_id: string
  tools: string[]
  model: string
  cwd: string
  mcp_servers: Array<{ name: string; status: string }>
  permission_mode: string
}

/** Marks a compaction boundary in the conversation. */
export interface SDKCompactBoundaryMessage {
  type: 'system'
  subtype: 'compact_boundary'
  summary?: string
}

/** Status update during long operations. */
export interface SDKStatusMessage {
  type: 'system'
  subtype: 'status'
  message: string
}

/** Task lifecycle notification. */
export interface SDKTaskNotificationMessage {
  type: 'system'
  subtype: 'task_notification'
  task_id: string
  status: string
  message?: string
}

/** Rate limit event. */
export interface SDKRateLimitEvent {
  type: 'system'
  subtype: 'rate_limit'
  retry_after_ms?: number
  message: string
}

// --------------------------------------------------------------------------
// Token Usage
// --------------------------------------------------------------------------

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// --------------------------------------------------------------------------
// Tool Types
// --------------------------------------------------------------------------

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: ToolInputSchema
  outputSchema?: ToolOutputSchema
  call: (input: any, context: ToolContext) => Promise<ToolResult>
  isReadOnly?: () => boolean
  isConcurrencySafe?: () => boolean
  isEnabled?: () => boolean
  prompt?: (context: ToolContext) => Promise<string>
  /** Speculative classifier: pre-validate tool usage risk */
  speculativeCheck?: (input: any, context: ToolContext) => SpeculativeResult
  /** Input validator: business rule validation beyond schema */
  validateInput?: (input: any, context: ToolContext) => InputValidationResult
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, any>
  required?: string[]
}

export interface ToolOutputSchema {
  type: 'object'
  properties: Record<string, any>
  required?: string[]
}

/** Result from speculative classifier */
export interface SpeculativeResult {
  /** Risk level: low, medium, high */
  level: 'low' | 'medium' | 'high'
  /** Reason for the risk assessment */
  reason?: string
  /** Whether to allow the call */
  allowed: boolean
  /** Optional message to display */
  message?: string
}

/** Result from input validator */
export interface InputValidationResult {
  /** Whether the input is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Optional sanitized/transformed input */
  sanitizedInput?: any
}

export interface ToolContext {
  cwd: string
  abortSignal?: AbortSignal
  /** Parent agent's LLM provider (inherited by subagents) */
  provider?: import('./providers/types.js').LLMProvider
  /** Parent agent's model ID */
  model?: string
  /** Parent agent's API type */
  apiType?: import('./providers/types.js').ApiType
}

export interface SpeculativeResult {
  level: 'low' | 'medium' | 'high'
  reason?: string
  allowed: boolean
  message?: string
}

export interface PermissionPipelineInput {
  toolName: string
  input: any
  permissionMode: string
  permissionConfig?: {
    denyRules?: string[]
    askRules?: string[]
    allowedDirectories?: string[]
    disallowedDirectories?: string[]
    denyCommands?: string[]
    safetyGuardrailPaths?: string[]
    contentSensitivePatterns?: string[]
    requestUserConfirmation?: (toolName: string, input: unknown, reason?: string) => Promise<boolean>
  }
  allowedTools?: string[]
}

export interface PermissionPipelineResult {
  denied: boolean
  ask: boolean
  bypass: boolean
  allowed: boolean
  step1?: string
  step2?: string
  step3?: string
  step4?: string
  step5?: string
  step6?: string
  step7?: string
  toolDenied?: boolean
  toolAllowed?: boolean
}

export interface ToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string | any[]
  is_error?: boolean
  /** Optional metadata for advanced features (e.g., structured returns) */
  metadata?: Record<string, any>
}

// --------------------------------------------------------------------------
// Permission Types
// --------------------------------------------------------------------------

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
  | 'auto'

export type PermissionBehavior = 'allow' | 'deny'

export type CanUseToolResult = {
  behavior: PermissionBehavior
  updatedInput?: unknown
  message?: string
}

export type CanUseToolFn = (
  tool: ToolDefinition,
  input: unknown,
) => Promise<CanUseToolResult>

// --------------------------------------------------------------------------
// MCP Types
// --------------------------------------------------------------------------

export type McpServerConfig =
  | McpStdioConfig
  | McpSseConfig
  | McpHttpConfig

export interface McpStdioConfig {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpSseConfig {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

export interface McpHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

// --------------------------------------------------------------------------
// Agent Types
// --------------------------------------------------------------------------

export interface AgentDefinition {
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit' | string
  mcpServers?: Array<string | { name: string; tools?: string[] }>
  skills?: string[]
  maxTurns?: number
  criticalSystemReminder_EXPERIMENTAL?: string
}

export interface ThinkingConfig {
  type: 'adaptive' | 'enabled' | 'disabled'
  budgetTokens?: number
}

// --------------------------------------------------------------------------
// Sandbox Types
// --------------------------------------------------------------------------

export interface SandboxSettings {
  enabled?: boolean
  autoAllowBashIfSandboxed?: boolean
  excludedCommands?: string[]
  allowUnsandboxedCommands?: boolean
  network?: SandboxNetworkConfig
  filesystem?: SandboxFilesystemConfig
  ignoreViolations?: Record<string, string[]>
  enableWeakerNestedSandbox?: boolean
  ripgrep?: { command: string; args?: string[] }
  /** Cloud sandbox mode - use managed egress proxy */
  cloudEnabled?: boolean
  /** Cloud sandbox - custom proxy URL */
  cloudProxyUrl?: string
  /** Auto-enable local sandbox when available */
  autoEnableLocal?: boolean
}

export interface SandboxNetworkConfig {
  allowedDomains?: string[]
  allowManagedDomainsOnly?: boolean
  allowLocalBinding?: boolean
  allowUnixSockets?: string[]
  allowAllUnixSockets?: boolean
  httpProxyPort?: number
  socksProxyPort?: number
  /** Cloud sandbox: use external egress proxy */
  useCloudProxy?: boolean
  /** Cloud sandbox: proxy URL */
  cloudProxyUrl?: string
}

export interface SandboxFilesystemConfig {
  allowWrite?: string[]
  denyWrite?: string[]
  denyRead?: string[]
  /** Local sandbox mode */
  mode?: 'bubblewrap' | 'seatbelt' | 'job' | 'none'
  /** Fail if sandbox unavailable (vs silent fallback) */
  failIfUnavailable?: boolean
  /** Auto-allow commands when sandboxed */
  autoAllowBashWhenSandboxed?: boolean
}

// --------------------------------------------------------------------------
// Output Format
// --------------------------------------------------------------------------

export interface OutputFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

// --------------------------------------------------------------------------
// Setting Sources
// --------------------------------------------------------------------------

export type SettingSource = 'user' | 'project' | 'local'

// --------------------------------------------------------------------------
// Model Info
// --------------------------------------------------------------------------

export interface ModelInfo {
  value: string
  displayName: string
  description: string
  supportsEffort?: boolean
  supportedEffortLevels?: ('low' | 'medium' | 'high' | 'max')[]
  supportsAdaptiveThinking?: boolean
  supportsFastMode?: boolean
}

// --------------------------------------------------------------------------
// System Prompt Engineering
// --------------------------------------------------------------------------

/**
 * Static constitution modules (cached prefix).
 */
export interface StaticConstitution {
  /** Identity: Who am I */
  identity?: string
  /** Operational norms: How to work */
  operationalNorms?: string
  /** Task philosophy: What counts as "done" */
  taskPhilosophy?: string
  /** Risk & safety rails */
  riskSafety?: string
  /** Tools global rules */
  toolsRules?: string
  /** Voice & tone */
  voiceTone?: string
}

/**
 * Dynamic policy injections (varies per session).
 */
export interface DynamicPolicy {
  /** Session preamble/context */
  sessionPreamble?: string
  /** Memory injections (max items) */
  memoryInjections?: string[]
  /** Environment info */
  environment?: string
  /** Project context files (CLAUDE.md, AGENT.md) */
  projectContext?: string
  /** MCP server configurations */
  mcpServers?: string
  /** Token budget hint */
  tokenBudgetHint?: string
  /** Custom dynamic sections */
  custom?: Array<{ name: string; content: string }>
}

/**
 * Complete system prompt configuration.
 * Enables full control over prompt engineering per Guide Part 05.
 */
export interface SystemPromptConfig {
  /** Static constitution modules (overrides default) */
  static?: StaticConstitution
  /** Additional static sections (custom key-value pairs) */
  staticSections?: Record<string, string>
  /** Dynamic policy injections (overrides default) */
  dynamic?: DynamicPolicy
  /** Additional dynamic sections */
  dynamicSections?: Record<string, string>
  /** Enable SYSTEM_PROMPT_DYNAMIC_BOUNDARY marker */
  enableBoundaryMarker?: boolean
  /** Boundary marker text (default: "---") */
  boundaryMarker?: string
  /** Include token budget hint in dynamic section */
  includeTokenBudget?: boolean
  /** Max memory injections (default: 5) */
  maxMemoryInjections?: number
  /** Custom tool descriptions (overrides default) */
  customToolDescriptions?: Record<string, string>
}

export interface AgentOptions {
  /** LLM model ID */
  model?: string
  /**
   * API type: 'anthropic-messages' or 'openai-completions'.
   * Falls back to OPENFLOW_API_TYPE env var. Default: 'anthropic-messages'.
   */
  apiType?: import('./providers/types.js').ApiType
  /** API key. Falls back to OPENFLOW_API_KEY env var. */
  apiKey?: string
  /** API base URL override */
  baseURL?: string
  /** Working directory for file/shell tools */
  cwd?: string
  /** System prompt override or preset */
  systemPrompt?: string | { type: 'preset'; preset: 'default'; append?: string }
  /** Append to default system prompt */
  appendSystemPrompt?: string
  /** Available tools (ToolDefinition[] or string[] preset) */
  tools?: ToolDefinition[] | string[] | { type: 'preset'; preset: 'default' }
  /** Maximum number of agentic turns per query */
  maxTurns?: number
  /** Maximum USD budget per query */
  maxBudgetUsd?: number
  /** Extended thinking configuration */
  thinking?: ThinkingConfig
  /** Maximum thinking tokens (deprecated, use thinking.budgetTokens) */
  maxThinkingTokens?: number
  /** Structured output JSON schema */
  jsonSchema?: Record<string, unknown>
  /** Structured output format */
  outputFormat?: OutputFormat
/** Permission handler callback */
  canUseTool?: CanUseToolFn
  /** Permission mode controlling tool approval behavior */
  permissionMode?: PermissionMode
  /** Tool names to pre-approve without prompting */
  allowedTools?: string[]
  /** Tool names to deny */
  disallowedTools?: string[]
  /** Deny rules for tool-level blocking (format: "toolName" or "toolName:inputField=pattern") */
  denyRules?: string[]
   /** Ask rules for tool-level confirmation (format: "toolName" or "toolName:inputField=pattern") */
   askRules?: string[]
   /** Enable tool lazy loading (default: true) */
   lazyLoad?: boolean
   /** Allowed directories for file operations (default: cwd or workspace) */
   allowedDirectories?: string[]
  /** Disallowed directories (e.g., /root, /etc, ~/.ssh) */
  disallowedDirectories?: string[]
  /** Deny commands list (e.g., "curl", "wget", "rm -rf") */
  denyCommands?: string[]
  /** Safety guardrail paths to protect (e.g., ".git", ".svn", ".bashrc") */
  safetyGuardrailPaths?: string[]
  /** Content sensitivity patterns to trigger ask (e.g., "AWS_SECRET", "PRIVATE_KEY") */
  contentSensitivePatterns?: string[]
  /** User confirmation callback for ask mode */
  requestUserConfirmation?: (toolName: string, input: unknown, reason?: string) => Promise<boolean>
  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig | any> // supports McpSdkServerConfig
  /** Custom subagent definitions */
  agents?: Record<string, AgentDefinition>
  /** Maximum tokens for responses */
  maxTokens?: number
  /** Effort level for reasoning */
  effort?: 'low' | 'medium' | 'high' | 'max'
  /** Fallback model if primary is unavailable */
  fallbackModel?: string
  /** Continue the most recent session in cwd */
  continue?: boolean
  /** Resume a specific session by ID */
  resume?: string
  /** Fork a session instead of continuing it */
  forkSession?: boolean
  /** Persist session to disk */
  persistSession?: boolean
  /** Explicit session ID */
  sessionId?: string
  /** Enable file checkpointing (for rewindFiles) */
  enableFileCheckpointing?: boolean
  /** Sandbox configuration */
  sandbox?: SandboxSettings
  /** Load settings from filesystem */
  settingSources?: SettingSource[]
  /** Plugin configurations */
  plugins?: Array<{ name: string; config?: Record<string, unknown> }>
  /** Additional working directories */
  additionalDirectories?: string[]
  /** Default agent to use */
  agent?: string
  /** Debug mode */
  debug?: boolean
  /** Debug log file */
  debugFile?: string
  /** Tool-specific configuration */
  toolConfig?: Record<string, unknown>
  /** Enable prompt suggestions */
  promptSuggestions?: boolean
  /** Strict MCP config validation */
  strictMcpConfig?: boolean
  /** Extra CLI arguments */
  extraArgs?: Record<string, string | null>
  /** SDK betas to enable */
  betas?: string[]
  /** Permission prompt tool name override */
  permissionPromptToolName?: string
  /** Context compression configuration */
  contextCompression?: {
    enabled?: boolean
    compactThreshold?: number
    preferServerSide?: boolean
  }
  // Part 10: Multi-agent orchestration
  multiAgentPattern?: 'simple' | 'swarm' | 'coordinator'
  maxParallelAgents?: number
  requireStructuredReturns?: boolean
  collectEvidence?: boolean
  forkId?: string
  // Engine configuration
  includePartialMessages?: boolean
  compactionCircuitBreaker?: number | false
  // Existing hook/env etc.
  hooks?: Record<string, Array<{
    matcher?: string
    hooks: Array<(input: any, toolUseId: string, context: { signal: AbortSignal }) => Promise<any>>
    timeout?: number
  }>>
  env?: Record<string, string | undefined>
  abortController?: AbortController
  abortSignal?: AbortSignal
}

// ============================================================================
// Part 10: Multi-Agent Orchestration Types
// ============================================================================

/**
 * Evidence of code changes or findings from a child agent.
 * Matches: "path:line — snippet" or structured format
 */
export interface Evidence {
  path: string
  lines: string  // e.g., "10-40" or "TOP" (for whole file)
  note?: string  // short description
}

/**
 * Structured result returned by child agents in Swarm/Coordinator modes.
 */
export interface ChildResult {
  /** Summary of findings (3-8 sentences) */
  summary: string
  /** Array of evidence with file paths and line numbers */
  evidence: Evidence[]
  /** Files that were touched/modified (empty for read-only agents) */
  touched_files?: string[]
  /** Commands executed (for reproducibility) */
  commands_run?: string[]
  /** Questions that need parent/human decision */
  open_questions?: string[]
  /** For verification agents: PASS/FAIL/PARTIAL */
  verdict?: 'PASS' | 'FAIL' | 'PARTIAL'
}

/**
 * Conflict detected during merge phase.
 */
export interface Conflict {
  path: string
  agents: string[]  // agent identifiers that conflict
  lines: { start: number; end: number }[]
  severity: 'low' | 'medium' | 'high'
  reason: string
}

/**
 * Merged result after combining multiple child agents' evidence.
 */
export interface MergedResult {
  summary: string
  evidence: Evidence[]
  conflicts: Conflict[]
  open_questions: string[]
  merged_from: string[]  // task IDs or agent names
}

/**
 * Team configuration for Swarm/Coordinator patterns.
 */
export interface TeamConfig {
  pattern: 'swarm' | 'coordinator'
  currentPhase: number
  parentTeamId?: string
}

export interface PermissionConfig {
  /** Deny rules for tool-level blocking */
  denyRules?: string[]
  /** Ask rules for tool-level confirmation */
  askRules?: string[]
  /** Allowed directories for file operations */
  allowedDirectories?: string[]
  /** Disallowed directories */
  disallowedDirectories?: string[]
  /** Deny commands list */
  denyCommands?: string[]
  /** Safety guardrail paths to protect */
  safetyGuardrailPaths?: string[]
  /** Content sensitivity patterns */
  contentSensitivePatterns?: string[]
  /** User confirmation callback */
   requestUserConfirmation?: (toolName: string, input: unknown, reason?: string) => Promise<boolean>
}

// ============================================================================
// Engine & Agent core types (previously defined)
// ============================================================================

/**
 * Configuration for the QueryEngine.
 */
export interface QueryEngineConfig {
  // Core
  provider: LLMProvider
  cwd: string
  model: string
  tools: ToolDefinition[]

   // System prompt
   systemPrompt?: string
   appendSystemPrompt?: string
   systemPromptConfig?: SystemPromptConfig

  // Execution limits
  maxTurns?: number
  maxTokens?: number
  maxTokensBudget?: number
  maxBudgetUsd?: number

    // Tool execution
    canUseTool?: CanUseToolFn
    permissionMode?: PermissionMode
    permissionConfig?: PermissionConfig
    allowedTools?: string[]
    disallowedTools?: string[]
    denyRules?: string[]
    askRules?: string[]
    lazyLoad?: boolean // Enable tool lazy loading (default: true)

    // Advanced
  thinking?: ThinkingConfig
  jsonSchema?: Record<string, unknown>
  outputFormat?: OutputFormat
   includePartialMessages?: boolean
   compactionCircuitBreaker?: number | false
   contextCompression?: AgentOptions['contextCompression']

  // Session
  sessionId?: string
  hookRegistry?: HookRegistry

   // Extras
   agents?: Record<string, AgentDefinition>
   toolConfig?: Record<string, unknown>
   abortSignal?: AbortSignal
   // MCP server configurations with optional instructions
   mcpServers?: Record<string, { name: string; tools?: string[]; instructions?: string }>
 }

/**
 * Special return value indicating child agent needs parent to dispatch tasks.
 * Used in anti-recursion mechanism (Part 10).
 */
export const NEEDS_PARENT_DISPATCH = '__NEEDS_PARENT_DISPATCH__'

export interface QueryResult {
  text: string
  result?: string  // alias for backward compatibility
  num_turns?: number
  duration_ms?: number
  usage: TokenUsage
  cost?: number
  messages?: Message[]
  sessionId?: string
  totalTurns?: number
  stopReason?: string
  errors?: string[]
}
