import type { McpServerConfig } from "../services/mcp/protocol.js";
import type { HooksSettings } from "../hooks/types.js";

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: PluginAuthor;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  dependencies?: string[];
  commands?: PluginCommandsConfig;
  agents?: PluginAgentsConfig;
  skills?: PluginSkillsConfig;
  hooks?: PluginHooksConfig;
  mcpServers?: PluginMcpServersConfig;
  outputStyles?: PluginOutputStylesConfig;
  userConfig?: Record<string, PluginUserConfigOption>;
}

export interface PluginUserConfigOption {
  type: "string" | "number" | "boolean" | "directory" | "file";
  title: string;
  description: string;
  default?: unknown;
  required?: boolean;
  secret?: boolean;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: string[];
  };
}

export type PluginCommandsConfig =
  | string
  | string[]
  | Record<string, PluginCommandMetadata>;

export type PluginAgentsConfig = string | string[];

export type PluginSkillsConfig = string | string[];

export type PluginHooksConfig =
  | string
  | HooksSettings
  | Array<string | HooksSettings>;

export type PluginMcpServersConfig =
  | string
  | Record<string, McpServerConfig>
  | Array<string | Record<string, McpServerConfig>>;

export type PluginOutputStylesConfig = string | string[];

export interface PluginCommandMetadata {
  source?: string;
  content?: string;
  description?: string;
  argumentHint?: string;
  model?: string;
  allowedTools?: string[];
}

export interface BuiltinPluginDefinition {
  name: string;
  description: string;
  version?: string;
  skills?: BuiltinSkillDefinition[];
  hooks?: HooksSettings;
  mcpServers?: Record<string, McpServerConfig>;
  isAvailable?: () => boolean;
  defaultEnabled?: boolean;
}

export interface BuiltinSkillDefinition {
  name: string;
  description: string;
  argumentHint?: string;
  whenToUse?: string;
  model?: string;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  isEnabled?: () => boolean;
  hooks?: HooksSettings;
  getPromptForCommand?: (args: {
    cwd: string;
    prompt: string;
  }) => string | Promise<string>;
}

export interface LoadedPlugin {
  name: string;
  manifest: PluginManifest;
  path: string;
  source: string;
  repository: string;
  enabled?: boolean;
  isBuiltin?: boolean;
  sha?: string;
  commandsPath?: string;
  commandsPaths?: string[];
  commandsMetadata?: Record<string, PluginCommandMetadata>;
  agentsPath?: string;
  agentsPaths?: string[];
  skillsPath?: string;
  skillsPaths?: string[];
  outputStylesPath?: string;
  outputStylesPaths?: string[];
  hooksConfig?: HooksSettings;
  mcpServers?: Record<string, McpServerConfig>;
  settings?: Record<string, unknown>;
}

export type PluginComponent =
  | "commands"
  | "agents"
  | "skills"
  | "hooks"
  | "output-styles";

export type PluginError =
  | {
      type: "path-not-found";
      source: string;
      plugin?: string;
      path: string;
      component: PluginComponent;
    }
  | {
      type: "git-auth-failed";
      source: string;
      plugin?: string;
      gitUrl: string;
      authType: "ssh" | "https";
    }
  | {
      type: "git-timeout";
      source: string;
      plugin?: string;
      gitUrl: string;
      operation: "clone" | "pull";
    }
  | {
      type: "network-error";
      source: string;
      plugin?: string;
      url: string;
      details?: string;
    }
  | {
      type: "manifest-parse-error";
      source: string;
      plugin?: string;
      manifestPath: string;
      parseError: string;
    }
  | {
      type: "manifest-validation-error";
      source: string;
      plugin?: string;
      manifestPath: string;
      validationErrors: string[];
    }
  | {
      type: "plugin-not-found";
      source: string;
      pluginId: string;
      marketplace: string;
    }
  | {
      type: "marketplace-not-found";
      source: string;
      marketplace: string;
      availableMarketplaces: string[];
    }
  | {
      type: "marketplace-load-failed";
      source: string;
      marketplace: string;
      reason: string;
    }
  | {
      type: "mcp-config-invalid";
      source: string;
      plugin: string;
      serverName: string;
      validationError: string;
    }
  | {
      type: "hook-load-failed";
      source: string;
      plugin: string;
      hookPath: string;
      reason: string;
    }
  | {
      type: "component-load-failed";
      source: string;
      plugin: string;
      component: PluginComponent;
      path: string;
      reason: string;
    }
  | {
      type: "dependency-unsatisfied";
      source: string;
      plugin: string;
      dependency: string;
      reason: "not-enabled" | "not-found";
    }
  | {
      type: "generic-error";
      source: string;
      plugin?: string;
      error: string;
    };

export interface PluginLoadResult {
  enabled: LoadedPlugin[];
  disabled: LoadedPlugin[];
  errors: PluginError[];
}

export interface PluginHookMatcher {
  matcher?: string | string[];
  hooks: Array<{
    type: string;
    command?: string;
    timeout?: number;
  }>;
  pluginRoot?: string;
  pluginName?: string;
  pluginId?: string;
}

export function getPluginErrorMessage(error: PluginError): string {
  switch (error.type) {
    case "generic-error":
      return error.error;
    case "path-not-found":
      return `Path not found: ${error.path} (${error.component})`;
    case "git-auth-failed":
      return `Git authentication failed (${error.authType}): ${error.gitUrl}`;
    case "git-timeout":
      return `Git ${error.operation} timeout: ${error.gitUrl}`;
    case "network-error":
      return `Network error: ${error.url}${error.details ? ` - ${error.details}` : ""}`;
    case "manifest-parse-error":
      return `Manifest parse error: ${error.parseError}`;
    case "manifest-validation-error":
      return `Manifest validation failed: ${error.validationErrors.join(", ")}`;
    case "plugin-not-found":
      return `Plugin ${error.pluginId} not found in marketplace ${error.marketplace}`;
    case "marketplace-not-found":
      return `Marketplace ${error.marketplace} not found`;
    case "marketplace-load-failed":
      return `Marketplace ${error.marketplace} failed to load: ${error.reason}`;
    case "mcp-config-invalid":
      return `MCP server ${error.serverName} invalid: ${error.validationError}`;
    case "hook-load-failed":
      return `Hook load failed: ${error.reason}`;
    case "component-load-failed":
      return `${error.component} load failed from ${error.path}: ${error.reason}`;
    case "dependency-unsatisfied": {
      const hint =
        error.reason === "not-enabled"
          ? "disabled — enable it or remove the dependency"
          : "not found in any configured marketplace";
      return `Dependency "${error.dependency}" is ${hint}`;
    }
  }
}
