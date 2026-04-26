import { z } from "zod";

export const PluginComponentTypeSchema = z.enum(["command", "agent", "skill", "hook", "mcp", "workflow"]);

export type PluginComponentType = z.infer<typeof PluginComponentTypeSchema>;

export const CommandComponentSchema = z.object({
  type: z.literal("command"),
  name: z.string(),
  description: z.string(),
  entry: z.string(),
  config: z.object({
    slashCommand: z.string(),
    permission: z.enum(["read-only", "write", "full"]).optional(),
    arguments: z.array(z.object({
      name: z.string(),
      description: z.string(),
      required: z.boolean().optional(),
    })).optional(),
  }),
});

export type CommandComponent = z.infer<typeof CommandComponentSchema>;

export const AgentComponentSchema = z.object({
  type: z.literal("agent"),
  name: z.string(),
  description: z.string(),
  entry: z.string(),
  config: z.object({
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
    maxTurns: z.number().optional(),
  }),
});

export type AgentComponent = z.infer<typeof AgentComponentSchema>;

export const SkillComponentSchema = z.object({
  type: z.literal("skill"),
  name: z.string(),
  description: z.string(),
  entry: z.string().optional(),
  config: z.object({
    trigger: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    agentskillsIo: z.object({
      name: z.string(),
      version: z.string(),
      description: z.string(),
      triggers: z.array(z.string()).optional(),
    }).optional(),
  }),
});

export type SkillComponent = z.infer<typeof SkillComponentSchema>;

export const HookComponentSchema = z.object({
  type: z.literal("hook"),
  name: z.string(),
  description: z.string(),
  entry: z.string(),
  config: z.object({
    event: z.string(),
    matcher: z.string().optional(),
    priority: z.number().optional(),
    type: z.enum(["command", "prompt"]).optional(),
  }),
});

export type HookComponent = z.infer<typeof HookComponentSchema>;

export const McpComponentSchema = z.object({
  type: z.literal("mcp"),
  name: z.string(),
  description: z.string(),
  config: z.object({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
    timeout: z.number().optional(),
    transport: z.enum(["stdio", "sse", "http"]).optional(),
  }),
});

export type McpComponent = z.infer<typeof McpComponentSchema>;

export const WorkflowComponentSchema = z.object({
  type: z.literal("workflow"),
  name: z.string(),
  description: z.string(),
  entry: z.string(),
  config: z.object({
    mode: z.enum(["sequential", "parallel"]).optional(),
    timeout: z.number().optional(),
    maxConcurrency: z.number().optional(),
    onError: z.enum(["abort", "continue"]).optional(),
    variables: z.record(z.string(), z.string()).optional(),
  }),
});

export type WorkflowComponent = z.infer<typeof WorkflowComponentSchema>;

export const PluginComponentSchema = z.discriminatedUnion("type", [
  CommandComponentSchema,
  AgentComponentSchema,
  SkillComponentSchema,
  HookComponentSchema,
  McpComponentSchema,
  WorkflowComponentSchema,
]);

export type PluginComponent = z.infer<typeof PluginComponentSchema>;

export const PluginManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  components: z.array(PluginComponentSchema),
  dependencies: z.array(z.string()).optional(),
  engines: z.object({
    openflow: z.string().optional(),
  }).optional(),
  disableModelInvocationFor: z.array(z.string()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export const PluginConfigSchema = z.object({
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

export const PluginInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  components: z.array(PluginComponentSchema),
  loadedAt: z.number(),
});

export type PluginInfo = z.infer<typeof PluginInfoSchema>;
