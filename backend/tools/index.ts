import type { ToolDefinition } from "../types/index.js";
import { createFileTools } from "./file-tools.js";
import { createGitTools } from "./git-tools.js";
import { createSearchTools } from "./search-tools.js";
import { createBashTools } from "./bash-tools.js";
import { createWebTools } from "./web-tools.js";
import { createUtilityTools } from "./utility-tools.js";
import { createCronTools } from "./cron-tools.js";
import { createTaskTools } from "./task-tools.js";
import { createToolSearchTool } from "./tool-search-tool.js";
import { createClarifyTools } from "./clarify-tool.js";
import { createMemorySearchTools } from "./memory-tools.js";
import { createSessionSearchTools } from "./session-search-tool.js";
import { createPathSecurityTools } from "./path-security-tool.js";
import { createDelegateTool } from "./delegate-tool.js";
import { createApprovalTool } from "./approval-tool.js";
import { createCheckpointTool } from "./checkpoint-tool.js";
import { createInterruptTool } from "./interrupt-tool.js";
import { createSkillsTool } from "./skills-tool.js";
import { ToolManualRegistry } from "./tool-manual-registry.js";
import type { CommandRegistry } from "../commands/command-registry.js";
import type { CronScheduler } from "../scheduler/cron-scheduler.js";
import type { TaskScheduler } from "../scheduler/task-scheduler.js";

export { createFileTools } from "./file-tools.js";
export { createGitTools } from "./git-tools.js";
export { createSearchTools } from "./search-tools.js";
export { createBashTools } from "./bash-tools.js";
export { createAgentTool, type AgentToolManifest } from "./agent-tool.js";
export { createWebTools } from "./web-tools.js";
export { createUtilityTools, type TodoItem, getTodoState, resetTodoState } from "./utility-tools.js";
export { createMultimediaTools, type MediaAnalysisResult } from "./multimedia-tools.js";
export { createBrowserTools, type BrowserConfig, type BrowserState } from "./browser-tools.js";
export { createGitHubTools, type GitHubConfig } from "./github-tools.js";
export { createCommunicationTools, type CommunicationConfig } from "./communication-tools.js";
export { createDatabaseTools, type DatabaseConfig } from "./database-tools.js";
export { createIDETools, type IDEConfig } from "./ide-tools.js";
export { createCronTools } from "./cron-tools.js";
export { createTaskTools } from "./task-tools.js";
export { createToolSearchTool, type ToolSearchToolConfig } from "./tool-search-tool.js";
export { ToolManualRegistry, type ToolManualEntry, type ToolManualIndex } from "./tool-manual-registry.js";
export { defineTool, createReadOnlyTool, createWriteTool, type ToolConfig } from "./tool-factory.js";
export {
  validateWithZod,
  validateOutputWithZod,
  formatValidationForModel,
  createInputValidationError,
  createOutputValidationError,
  createValidationFailure,
  createValidationSuccess,
  type ToolValidationError,
  type ValidationResult,
  type ToolValidationContext,
  type InputValidator,
} from "./validation.js";
export { createDelegateTool } from "./delegate-tool.js";
export { createApprovalTool } from "./approval-tool.js";
export { createCheckpointTool } from "./checkpoint-tool.js";
export { createInterruptTool } from "./interrupt-tool.js";
export { createSkillsTool } from "./skills-tool.js";

export const BUILTIN_TOOL_NAMES = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "LS",
  "Glob",
  "Grep",
  "Bash",
  "BashOutput",
  "KillShell",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "ExitPlanMode",
  "SlashCommand",
  "Task",
  "ToolSearch",
  "git_status",
  "git_diff",
  "git_log",
  "git_branch",
  "ImageAnalysis",
  "ImageGeneration",
  "AudioAnalysis",
  "AudioGeneration",
  "VideoAnalysis",
  "VideoGeneration",
  "BrowserNavigate",
  "BrowserScreenshot",
  "BrowserClick",
  "BrowserFill",
  "BrowserEvaluate",
  "BrowserGetContent",
  "GitHubListPRs",
  "GitHubGetPR",
  "GitHubListIssues",
  "GitHubCreateIssue",
  "GitHubCommentOnPR",
  "GitHubGetPRFiles",
  "GitHubSearchCode",
  "SlackSend",
  "DiscordSend",
  "TelegramSend",
  "EmailSend",
  "DatabaseQuery",
  "DatabaseSchema",
  "DatabaseMigrate",
  "DatabaseSeed",
  "LintCheck",
  "FormatCheck",
  "TypeCheck",
  "GetDiagnostics",
  "RunTests",
  "CronCreate",
  "CronList",
  "CronDelete",
  "CronPause",
  "CronResume",
  "CronRunNow",
  "CronStatus",
  "CronHistory",
  "CronEdit",
  "CronStats",
  "ask_clarification",
  "MemorySearch",
  "SessionSearch",
  "PathSecurityCheck",
  "Delegate",
  "Approval",
  "Checkpoint",
  "Interrupt",
  "Skills",
  "TaskCreate",
  "TaskList",
  "TaskRunNow",
  "TaskDelete",
  "TaskEnable",
  "TaskDisable",
];

export const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "LS"],
  "group:search": ["Glob", "Grep"],
  "group:runtime": ["Bash", "BashOutput", "KillShell"],
  "group:web": ["WebFetch", "WebSearch"],
  "group:utility": ["TodoWrite", "ExitPlanMode", "SlashCommand", "Task"],
  "group:git": ["git_status", "git_diff", "git_log", "git_branch"],
  "group:media": ["ImageAnalysis", "ImageGeneration", "AudioAnalysis", "AudioGeneration", "VideoAnalysis", "VideoGeneration"],
  "group:browser": ["BrowserNavigate", "BrowserScreenshot", "BrowserClick", "BrowserFill", "BrowserEvaluate", "BrowserGetContent"],
  "group:github": ["GitHubListPRs", "GitHubGetPR", "GitHubListIssues", "GitHubCreateIssue", "GitHubCommentOnPR", "GitHubGetPRFiles", "GitHubSearchCode"],
  "group:communication": ["SlackSend", "DiscordSend", "TelegramSend", "EmailSend"],
  "group:database": ["DatabaseQuery", "DatabaseSchema", "DatabaseMigrate", "DatabaseSeed"],
  "group:ide": ["LintCheck", "FormatCheck", "TypeCheck", "GetDiagnostics", "RunTests"],
  "group:cron": ["CronCreate", "CronList", "CronDelete", "CronPause", "CronResume", "CronRunNow", "CronStatus", "CronHistory", "CronEdit", "CronStats"],
  "group:intelligence": ["ask_clarification", "MemorySearch", "SessionSearch", "PathSecurityCheck"],
  "group:agent": ["Delegate", "Skills", "Approval", "Checkpoint", "Interrupt"],
  "group:task": ["TaskCreate", "TaskList", "TaskRunNow", "TaskDelete", "TaskEnable", "TaskDisable"],
};

export const TOOL_PROFILES: Record<string, string[]> = {
  full: BUILTIN_TOOL_NAMES,
  coding: ["group:fs", "group:search", "group:runtime", "group:web", "group:utility", "group:git", "group:intelligence", "group:agent"],
  minimal: ["Read", "Glob", "Grep", "TodoWrite"],
  messaging: ["Read", "Glob", "Grep", "TodoWrite", "WebFetch", "WebSearch"],
  intelligence: ["group:intelligence", "group:agent"],
};

export function resolveToolProfile(profile: string): string[] {
  const tools = TOOL_PROFILES[profile];
  if (!tools) {
    return TOOL_PROFILES.full;
  }

  const resolved: string[] = [];
  for (const tool of tools) {
    if (tool.startsWith("group:")) {
      const groupTools = TOOL_GROUPS[tool];
      if (groupTools) {
        resolved.push(...groupTools);
      }
    } else {
      resolved.push(tool);
    }
  }

  return [...new Set(resolved)];
}

export function createAllTools(workspaceRoot: string, commandRegistry?: CommandRegistry, cronScheduler?: CronScheduler, taskScheduler?: TaskScheduler): ToolDefinition[] {
  const fileTools = createFileTools(workspaceRoot);
  const searchTools = createSearchTools(workspaceRoot);
  const bashTools = createBashTools();
  const gitTools = createGitTools();
  const webTools = createWebTools();
  const utilityTools = createUtilityTools(commandRegistry);
  const cronTools = cronScheduler ? createCronTools(cronScheduler) : [];
  const taskTools = taskScheduler ? createTaskTools(taskScheduler) : [];

  const manualRegistry = new ToolManualRegistry();
  const toolSearchTool = createToolSearchTool({ manualRegistry });

  const clarifyTools = createClarifyTools();
  const memorySearchTools = createMemorySearchTools();
  const sessionSearchTools = createSessionSearchTools();
  const pathSecurityTools = createPathSecurityTools(workspaceRoot);

  const delegateTool = createDelegateTool();
  const approvalTool = createApprovalTool();
  const checkpointTool = createCheckpointTool();
  const interruptTool = createInterruptTool();
  const skillsTool = createSkillsTool();

  return [
    ...fileTools,
    ...searchTools,
    ...bashTools,
    ...gitTools,
    ...webTools,
    ...utilityTools,
    ...cronTools,
    ...taskTools,
    toolSearchTool,
    ...clarifyTools,
    ...memorySearchTools,
    ...sessionSearchTools,
    ...pathSecurityTools,
    delegateTool,
    approvalTool,
    checkpointTool,
    interruptTool,
    skillsTool,
  ];
}
