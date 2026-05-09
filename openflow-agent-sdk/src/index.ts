/**
 * @openflow/openflow-agent-sdk
 *
 * Open-source Agent SDK by Openflow (https://github.com/openflow-ai).
 * Runs the full agent loop in-process without spawning subprocesses.
 *
 * Features:
 * - 30+ built-in tools (file I/O, shell, web, agents, tasks, teams, etc.)
 * - Skill system (reusable prompt templates with bundled skills)
 * - MCP server integration (stdio, SSE, HTTP)
 * - Context compression (auto-compact, micro-compact)
 * - Retry with exponential backoff
 * - Git status & project context injection
 * - Multi-turn session persistence
 * - Permission system (allow/deny/bypass modes)
 * - Subagent spawning & team coordination
 * - Task management & scheduling
 * - Hook system with lifecycle integration (pre/post tool use, session, compact)
 * - Token estimation & cost tracking
 * - File state LRU caching
 * - Plan mode for structured workflows
 */

// --------------------------------------------------------------------------
// High-level Agent API
// --------------------------------------------------------------------------

export { Agent, createAgent, query } from './agent.js'

// --------------------------------------------------------------------------
// Tool Helper (Zod-based tool creation, compatible with official SDK)
// --------------------------------------------------------------------------

export { tool, sdkToolToToolDefinition } from './tool-helper.js'
export type {
  ToolAnnotations,
  CallToolResult,
  SdkMcpToolDefinition,
} from './tool-helper.js'

// --------------------------------------------------------------------------
// In-Process MCP Server
// --------------------------------------------------------------------------

export { createSdkMcpServer, isSdkServerConfig } from './sdk-mcp-server.js'
export type { McpSdkServerConfig } from './sdk-mcp-server.js'

// --------------------------------------------------------------------------
// Core Engine
// --------------------------------------------------------------------------

export { QueryEngine } from './engine.js'

// --------------------------------------------------------------------------
// LLM Providers (Anthropic + OpenAI)
// --------------------------------------------------------------------------

export {
  createProvider,
  AnthropicProvider,
  OpenAIProvider,
} from './providers/index.js'
export type {
  ApiType,
  LLMProvider,
  CreateMessageParams,
  CreateMessageResponse,
  NormalizedMessageParam,
  NormalizedContentBlock,
  NormalizedTool,
  NormalizedResponseBlock,
  StreamChunk,
} from './providers/index.js'

// --------------------------------------------------------------------------
// Tool System (30+ tools)
// --------------------------------------------------------------------------

export {
  // Registry
  getAllBaseTools,
  filterTools,
  assembleToolPool,

  // Helpers
  defineTool,
  toApiTool,

  // Core file I/O & execution
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  NotebookEditTool,

  // Web
  WebFetchTool,
  WebSearchTool,

  // Agent & Multi-agent
  AgentTool,
  SendMessageTool,
  TeamCreateTool,
  TeamDeleteTool,

  // Tasks
  TaskCreateTool,
  TaskListTool,
  TaskUpdateTool,
  TaskGetTool,
  TaskStopTool,
  TaskOutputTool,
  TaskMergeTool,

  // Worktree
  EnterWorktreeTool,
  ExitWorktreeTool,

  // Planning
  EnterPlanModeTool,
  ExitPlanModeTool,

  // User interaction
  AskUserQuestionTool,

  // Discovery
  ToolSearchTool,

  // MCP Resources
  ListMcpResourcesTool,
  ReadMcpResourceTool,

  // Scheduling
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  RemoteTriggerTool,

  // LSP
  LSPTool,

  // Config
  ConfigTool,

  // Todo
  TodoWriteTool,

  // Skill
  SkillTool,
} from './tools/index.js'

// Agent tool helpers (built-in agents)
export { BUILTIN_AGENTS } from './tools/agent-tool.js'

// --------------------------------------------------------------------------
// MCP Client
// --------------------------------------------------------------------------

export { connectMCPServer, closeAllConnections } from './mcp/client.js'
export type { MCPConnection } from './mcp/client.js'

// --------------------------------------------------------------------------
// Skill System
// --------------------------------------------------------------------------

export {
  registerSkill,
  getSkill,
  getAllSkills,
  getUserInvocableSkills,
  hasSkill,
  unregisterSkill,
  clearSkills,
  formatSkillsForPrompt,
  initBundledSkills,
} from './skills/index.js'
export type {
  SkillDefinition,
  SkillContentBlock,
  SkillResult,
} from './skills/index.js'

// --------------------------------------------------------------------------
// Session Management
// --------------------------------------------------------------------------

export {
  saveSession,
  loadSession,
  listSessions,
  forkSession,
  getSessionMessages,
  getSessionInfo,
  renameSession,
  tagSession,
  appendToSession,
  deleteSession,
} from './session.js'
export type { SessionMetadata, SessionData } from './session.js'

// --------------------------------------------------------------------------
// Context Utilities
// --------------------------------------------------------------------------

export {
  getSystemContext,
  getUserContext,
  getGitStatus,
  readProjectContextContent,
  discoverProjectContextFiles,
  readMultiLevelContext,
  discoverMultiLevelContextFiles,
  extractMemoriesFromHistory,
  retrieveMemories,
  jarvisDream,
  shouldTriggerJarvisDream,
  clearContextCache,
  type DiscoveredContextFile,
  type ContextLayer,
  type ExtractedMemory,
  type MemoryRetrievalResult,
  type DualModelRetrievalConfig,
  type JarvisDreamConfig,
  type JarvisDreamEntry,
} from './utils/context.js'

// --------------------------------------------------------------------------
// Message Utilities
// --------------------------------------------------------------------------

export {
  createUserMessage,
  createAssistantMessage,
  normalizeMessagesForAPI,
  stripImagesFromMessages,
  extractTextFromContent,
  createCompactBoundaryMessage,
  truncateText,
} from './utils/messages.js'

// --------------------------------------------------------------------------
// Token Estimation & Cost
// --------------------------------------------------------------------------

export {
  estimateTokens,
  estimateMessagesTokens,
  estimateSystemPromptTokens,
  getTokenCountFromUsage,
  getContextWindowSize,
  getAutoCompactThreshold,
  getEffectiveTokenBudget,
  estimateCost,
  MODEL_PRICING,
  AUTOCOMPACT_BUFFER_TOKENS,
} from './utils/tokens.js'

// --------------------------------------------------------------------------
// System Prompt Engineering (Part 05)
// --------------------------------------------------------------------------

export {
  buildSystemPrompt,
  buildSessionPreamble,
  buildEnvironmentBlock,
  buildTokenBudgetHint,
  buildMcpSection,
  formatStaticConstitution,
  formatDynamicPolicy,
  getStaticConstitutionString,
  estimateStaticConstitutionTokens,
  DEFAULT_STATIC_CONSTITUTION,
} from './utils/prompt-builder.js'
export type {
  SystemPromptConfig,
  StaticConstitution,
  DynamicPolicy,
} from './types.js'

// --------------------------------------------------------------------------
// Context Compression
// --------------------------------------------------------------------------

export {
  shouldAutoCompact,
  shouldTriggerCircuitBreaker,
  compactConversation,
  compactConversationWithFocus,
  microCompactMessages,
  createAutoCompactState,
  getCostWarningLevel,
  getCostWarningMessage,
  buildNineSectionTemplate,
  compactMessagesForTest,
  getCompactionStats,
} from './utils/compact.js'
export type { 
  AutoCompactState, 
  CostWarningLevel,
  NineSectionSummary,
} from './utils/compact.js'

// --------------------------------------------------------------------------
// Retry Logic
// --------------------------------------------------------------------------

export {
  withRetry,
  isRetryableError,
  isPromptTooLongError,
  isAuthError,
  isRateLimitError,
  formatApiError,
  getRetryDelay,
  classifyError,
  getRetryAfterDelay,
  DEFAULT_RETRY_CONFIG,
  RATE_LIMIT_RETRY_CONFIG,
} from './utils/retry.js'
export type { RetryConfig } from './utils/retry.js'

// --------------------------------------------------------------------------
// Tool Governance Pipeline (Part 06)
// --------------------------------------------------------------------------

export {
  defaultSpeculativeCheck,
  validateToolOutput,
  createGovernedTool,
  defaultValidateInput,
  matchDenyRules,
  matchAskRules,
  checkSafetyGuardrails,
  checkContentSensitivity,
  checkDenyCommands,
  checkAllowedDirectories,
  evaluatePermission,
  validateToolInput,
  speculativeCheck,
  checkDenyRules,
  checkAskRules,
  permissionPipeline,
  createPermissionChecker,
} from './utils/governance.js'
export type {
  PermissionConfig,
  PermissionPipelineInput,
  PermissionPipelineResult,
  // Part 10: Multi-agent orchestration
  ChildResult,
  Evidence,
  Conflict,
  MergedResult,
  TeamConfig,
} from './types.js'

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------

export {
  getAllTasks,
  getTask,
  clearTasks,
} from './tools/task-tools.js'
export type { Task, TaskStatus } from './tools/task-tools.js'

export {
  getAllTeams,
  getTeam,
  clearTeams,
  TeamDispatchTool,
  TeamMergeTool,
} from './tools/team-tools.js'
export type { Team } from './tools/team-tools.js'

export {
  readMailbox,
  writeToMailbox,
  clearMailboxes,
} from './tools/send-message.js'
export type { AgentMessage } from './tools/send-message.js'

export {
  isPlanModeActive,
  getCurrentPlan,
} from './tools/plan-tools.js'

export {
  registerAgents,
  clearAgents,
} from './tools/agent-tool.js'

export {
  setQuestionHandler,
  clearQuestionHandler,
} from './tools/ask-user.js'

export {
  setDeferredTools,
} from './tools/tool-search.js'

export {
  setMcpConnections,
} from './tools/mcp-resource-tools.js'

export {
  getAllCronJobs,
  clearCronJobs,
} from './tools/cron-tools.js'
export type { CronJob } from './tools/cron-tools.js'

export {
  getConfig,
  setConfig,
  clearConfig,
} from './tools/config-tool.js'

export {
  getTodos,
  clearTodos,
} from './tools/todo-tool.js'
export type { TodoItem } from './tools/todo-tool.js'

// Hooks
export {
  HookRegistry,
  createHookRegistry,
  HOOK_EVENTS,
} from './hooks.js'
export type {
  HookEvent,
  HookDefinition,
  HookInput,
  HookOutput,
  HookConfig,
} from './hooks.js'

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type {
  // Message types
  Message,
  UserMessage,
  AssistantMessage,
  ConversationMessage,
  MessageRole,

  // SDK message types (streaming events)
  SDKMessage,
  SDKAssistantMessage,
  SDKToolResultMessage,
  SDKResultMessage,
  SDKPartialMessage,

  // Tool types
  ToolDefinition,
  ToolInputSchema,
  ToolContext,
  ToolResult,

  // Permission types
  PermissionMode,
  PermissionBehavior,
  CanUseToolFn,
  CanUseToolResult,

  // MCP types
  McpServerConfig,
  McpStdioConfig,
  McpSseConfig,
  McpHttpConfig,

  // Agent types
  AgentOptions,
  AgentDefinition,
  QueryResult,
  ThinkingConfig,
  TokenUsage,

  // Engine types
  QueryEngineConfig,

  // Content block types
  ContentBlockParam,
  ContentBlock,

  // Sandbox types
  SandboxSettings,
  SandboxNetworkConfig,
  SandboxFilesystemConfig,

   // Output format
   OutputFormat,

   // Model info
    ModelInfo,
    // NEEDS_PARENT_DISPATCH exported as value below
  } from './types.js'

// Value export for NEEDS_PARENT_DISPATCH (also a type)
export { NEEDS_PARENT_DISPATCH } from './types.js'

// Sandbox
export {
  checkSandboxDeps,
  buildBubblewrapArgs,
  buildSeatbeltProfile,
  EgressProxy,
  execWithSandbox,
  type SandboxExecResult,
} from './utils/sandbox.js'
