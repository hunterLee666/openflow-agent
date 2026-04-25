export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  components: PluginComponent[];
  dependencies?: string[];
  engines?: {
    openflow?: string;
  };
  disableModelInvocationFor?: string[];
}

export type PluginComponentType = "command" | "agent" | "skill" | "hook" | "mcp" | "workflow";

export interface PluginComponent {
  type: PluginComponentType;
  name: string;
  description: string;
  entry?: string;
  config?: Record<string, unknown>;
}

export interface CommandComponent extends PluginComponent {
  type: "command";
  name: string;
  description: string;
  entry: string;
  config: {
    slashCommand: string;
    permission?: "read-only" | "write" | "full";
    arguments?: Array<{
      name: string;
      description: string;
      required?: boolean;
    }>;
  };
}

export interface AgentComponent extends PluginComponent {
  type: "agent";
  name: string;
  description: string;
  entry: string;
  config: {
    model?: string;
    tools?: string[];
    systemPrompt?: string;
    maxTurns?: number;
  };
}

export interface SkillComponent extends PluginComponent {
  type: "skill";
  name: string;
  description: string;
  entry?: string;
  config: {
    trigger?: string[];
    metadata?: Record<string, unknown>;
    agentskillsIo?: {
      name: string;
      version: string;
      description: string;
      triggers?: string[];
    };
  };
}

export interface HookComponent extends PluginComponent {
  type: "hook";
  name: string;
  description: string;
  entry: string;
  config: {
    event: string;
    matcher?: string;
    priority?: number;
    type?: "command" | "prompt";
  };
}

export interface McpComponent extends PluginComponent {
  type: "mcp";
  name: string;
  description: string;
  config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    timeout?: number;
    transport?: "stdio" | "sse" | "http";
  };
}

export interface WorkflowComponent extends PluginComponent {
  type: "workflow";
  name: string;
  description: string;
  entry: string;
  config: {
    mode?: "sequential" | "parallel";
    timeout?: number;
    maxConcurrency?: number;
    onError?: "abort" | "continue";
    variables?: Record<string, string>;
  };
}

export interface PluginConfig {
  enabled?: boolean;
  settings?: Record<string, unknown>;
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  path: string;
  enabled: boolean;
  components: PluginComponent[];
  loadedAt: number;
}
