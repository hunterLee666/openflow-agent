import type { ToolDefinition } from "../types/index.js";
import { createFileTools } from "./file-tools.js";
import { createGitTools } from "./git-tools.js";
import { createSearchTools } from "./search-tools.js";
import { createBashTools } from "./bash-tools.js";
import { createAgentTool } from "./agent-tool.js";
import { createWebTools } from "./web-tools.js";
import { createUtilityTools } from "./utility-tools.js";
import { createMultimediaTools } from "./multimedia-tools.js";
import { createBrowserTools } from "./browser-tools.js";
import { createGitHubTools } from "./github-tools.js";
import { createCommunicationTools } from "./communication-tools.js";
import { createDatabaseTools } from "./database-tools.js";
import { createIDETools } from "./ide-tools.js";
import { createCronTools } from "./cron-tools.js";
import { createToolSearchTool } from "./tool-search-tool.js";
import { ToolManualRegistry } from "./tool-manual-registry.js";
import type { CommandRegistry } from "../commands/command-registry.js";
import type { CronScheduler } from "../scheduler/cron-scheduler.js";

export { createFileTools, type FileConfig } from "./file-tools.js";
export { createGitTools } from "./git-tools.js";
export { createSearchTools, type GlobToolInput, type GrepToolInput } from "./search-tools.js";
export { createBashTools, type BashToolInput, type BashOutputInput, type KillShellInput } from "./bash-tools.js";
export { createAgentTool, type AgentToolManifest } from "./agent-tool.js";
export { createWebTools, type WebFetchInput, type WebSearchInput } from "./web-tools.js";
export { createUtilityTools, type TodoItem, type TodoWriteInput, type ExitPlanModeInput, type SlashCommandInput, type TaskInput, getTodoState, resetTodoState } from "./utility-tools.js";
export { createMultimediaTools, type MediaAnalysisResult } from "./multimedia-tools.js";
export { createBrowserTools, type BrowserConfig, type BrowserState } from "./browser-tools.js";
export { createGitHubTools, type GitHubConfig } from "./github-tools.js";
export { createCommunicationTools, type CommunicationConfig } from "./communication-tools.js";
export { createDatabaseTools, type DatabaseConfig } from "./database-tools.js";
export { createIDETools, type IDEConfig } from "./ide-tools.js";
export { createCronTools } from "./cron-tools.js";
export { createToolSearchTool, type ToolSearchToolConfig } from "./tool-search-tool.js";
export { ToolManualRegistry, type ToolManualEntry, type ToolManualIndex } from "./tool-manual-registry.js";
export { defineTool, createReadOnlyTool, createWriteTool, type ToolConfig, type SafetyFlags } from "./tool-factory.js";
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
};

export const TOOL_PROFILES: Record<string, string[]> = {
  full: BUILTIN_TOOL_NAMES,
  coding: ["group:fs", "group:search", "group:runtime", "group:web", "group:utility", "group:git", "group:ide"],
  messaging: ["Read", "Glob", "Grep", "TodoWrite", "WebFetch", "WebSearch"],
  minimal: ["Read", "Glob", "Grep", "TodoWrite"],
  multimedia: ["group:media", "Read", "Write"],
  browser: ["group:browser", "group:fs", "group:runtime"],
  github: ["group:github", "group:fs", "group:runtime"],
  database: ["group:database", "group:fs", "group:runtime"],
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

export function createAllTools(workspaceRoot: string, commandRegistry?: CommandRegistry, cronScheduler?: CronScheduler): ToolDefinition[] {
  const fileTools = createFileTools(workspaceRoot);
  const searchTools = createSearchTools(workspaceRoot);
  const bashTools = createBashTools();
  const gitTools = createGitTools();
  const webTools = createWebTools();
  const utilityTools = createUtilityTools(commandRegistry);
  const multimediaTools = createMultimediaTools();
  const browserTools = createBrowserTools();
  const githubTools = createGitHubTools();
  const communicationTools = createCommunicationTools();
  const databaseTools = createDatabaseTools();
  const ideTools = createIDETools({ workspaceRoot });
  const cronTools = cronScheduler ? createCronTools(cronScheduler) : [];

  const manualRegistry = new ToolManualRegistry();
  const toolSearchTool = createToolSearchTool({ manualRegistry });

  return [
    ...fileTools,
    ...searchTools,
    ...bashTools,
    ...gitTools,
    ...webTools,
    ...utilityTools,
    ...multimediaTools,
    ...browserTools,
    ...githubTools,
    ...communicationTools,
    ...databaseTools,
    ...ideTools,
    ...cronTools,
    toolSearchTool,
  ];
}
