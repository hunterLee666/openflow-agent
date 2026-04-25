import type { ToolDefinition } from "../types/index.js";
import { createFileTools } from "./file-tools.js";
import { createGitTools } from "./git-tools.js";
import { createSearchTools } from "./search-tools.js";
import { createBashTools } from "./bash-tools.js";
import { createAgentTool } from "./agent-tool.js";
import { createWebTools } from "./web-tools.js";
import { createUtilityTools } from "./utility-tools.js";
import { createMultimediaTools } from "./multimedia-tools.js";
import type { CommandRegistry } from "../commands/command-registry.js";

export { createFileTools } from "./file-tools.js";
export { createGitTools } from "./git-tools.js";
export { createSearchTools } from "./search-tools.js";
export { createBashTools } from "./bash-tools.js";
export { createAgentTool } from "./agent-tool.js";
export { createWebTools } from "./web-tools.js";
export { createUtilityTools } from "./utility-tools.js";
export { createMultimediaTools } from "./multimedia-tools.js";

export type { AgentToolManifest } from "./agent-tool.js";
export type { GlobToolInput, GrepToolInput } from "./search-tools.js";
export type { BashToolInput, BashOutputInput, KillShellInput } from "./bash-tools.js";
export type { WebFetchInput, WebSearchInput } from "./web-tools.js";
export type { TodoItem, TodoWriteInput, ExitPlanModeInput, SlashCommandInput, TaskInput } from "./utility-tools.js";
export type { MediaAnalysisResult } from "./multimedia-tools.js";
export { getTodoState, resetTodoState } from "./utility-tools.js";

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
];

export const TOOL_GROUPS: Record<string, string[]> = {
  "group:fs": ["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "LS"],
  "group:search": ["Glob", "Grep"],
  "group:runtime": ["Bash", "BashOutput", "KillShell"],
  "group:web": ["WebFetch", "WebSearch"],
  "group:utility": ["TodoWrite", "ExitPlanMode", "SlashCommand", "Task"],
  "group:git": ["git_status", "git_diff", "git_log", "git_branch"],
  "group:media": ["ImageAnalysis", "ImageGeneration", "AudioAnalysis", "AudioGeneration", "VideoAnalysis", "VideoGeneration"],
};

export const TOOL_PROFILES: Record<string, string[]> = {
  full: BUILTIN_TOOL_NAMES,
  coding: ["group:fs", "group:search", "group:runtime", "group:web", "group:utility", "group:git"],
  messaging: ["Read", "Glob", "Grep", "TodoWrite", "WebFetch", "WebSearch"],
  minimal: ["Read", "Glob", "Grep", "TodoWrite"],
  multimedia: ["group:media", "Read", "Write"],
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

export function createAllTools(workspaceRoot: string, commandRegistry?: CommandRegistry): ToolDefinition[] {
  const fileTools = createFileTools(workspaceRoot);
  const searchTools = createSearchTools(workspaceRoot);
  const bashTools = createBashTools();
  const gitTools = createGitTools();
  const webTools = createWebTools();
  const utilityTools = createUtilityTools(commandRegistry);
  const multimediaTools = createMultimediaTools();

  return [...fileTools, ...searchTools, ...bashTools, ...gitTools, ...webTools, ...utilityTools, ...multimediaTools];
}
