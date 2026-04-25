export const CLAUDE_CODE_PLUGIN_SCHEMA = {
  type: "object",
  required: ["name", "version", "description"],
  properties: {
    name: {
      type: "string",
      description: "Plugin name, must be unique",
    },
    version: {
      type: "string",
      description: "Semantic version string",
    },
    description: {
      type: "string",
      description: "Human-readable description",
    },
    type: {
      type: "string",
      enum: ["skill", "tool", "command", "agent"],
      description: "Plugin type",
    },
    triggers: {
      type: "array",
      items: { type: "string" },
      description: "Trigger words/phrases for auto-activation",
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "description", "input_schema"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          input_schema: { type: "object" },
        },
      },
    },
    skills: {
      type: "array",
      items: { type: "string" },
      description: "List of skill names included in this plugin",
    },
    commands: {
      type: "array",
      items: { type: "string" },
      description: "List of slash commands included in this plugin",
    },
    mcp_servers: {
      type: "array",
      items: {
        type: "object",
        required: ["command", "args"],
        properties: {
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } },
          env: { type: "object" },
          timeout: { type: "number" },
        },
      },
    },
    dependencies: {
      type: "array",
      items: { type: "string" },
      description: "List of required plugin names",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Plugin tags for categorization",
    },
  },
};

export interface ClaudeCodePluginConfig {
  plugins: string[];
  mcpServers?: Array<{
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}
