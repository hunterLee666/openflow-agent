import { z } from "zod";

export const CustomAgentConfigSchema = z.object({
  description: z.string().describe("When the lead agent should delegate to this subagent"),
  system_prompt: z.string().describe("System prompt that guides the subagent's behavior"),
  tools: z.array(z.string()).nullable().optional().describe("Tool names whitelist (null/undefined = inherit all tools from parent)"),
  disallowed_tools: z.array(z.string()).optional().describe("Tool names to deny"),
  skills: z.array(z.string()).nullable().optional().describe("Skill names whitelist (null/undefined = inherit all enabled skills, [] = no skills)"),
  model: z.string().optional().describe("Model to use - 'inherit' uses parent's model"),
  max_turns: z.number().optional().describe("Maximum number of agent turns before stopping"),
  timeout_seconds: z.number().optional().describe("Maximum execution time in seconds"),
  temperature: z.number().optional().describe("Temperature for model sampling"),
  max_tokens: z.number().optional().describe("Maximum tokens in response"),
});

export type CustomAgentConfig = z.infer<typeof CustomAgentConfigSchema>;

export const AgentConfigYamlSchema = z.object({
  agents: z.record(z.string(), CustomAgentConfigSchema).optional(),
  defaults: z.object({
    model: z.string().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().optional(),
    tools: z.array(z.string()).optional(),
    disallowed_tools: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    max_turns: z.number().optional(),
    timeout_seconds: z.number().optional(),
  }).optional(),
});

export type AgentConfigYaml = z.infer<typeof AgentConfigYamlSchema>;

export function parseAgentConfigYaml(content: string): AgentConfigYaml {
  try {
    const parsed = JSON.parse(content);
    return AgentConfigYamlSchema.parse(parsed);
  } catch {
    throw new Error("Invalid agent config: must be valid YAML or JSON");
  }
}

export function mergeAgentConfigWithDefaults(
  agentName: string,
  agentConfig: CustomAgentConfig,
  defaults?: AgentConfigYaml["defaults"]
): Partial<AgentPackage> {
  const result: Partial<AgentPackage> = {
    name: agentName,
    description: agentConfig.description,
    systemPrompt: agentConfig.system_prompt,
  };

  if (agentConfig.tools !== undefined) {
    result.tools = agentConfig.tools;
  }
  if (defaults?.tools !== undefined) {
    result.tools = result.tools ?? defaults.tools;
  }

  if (agentConfig.model || defaults?.model) {
    result.model = agentConfig.model ?? defaults?.model;
  }

  if (agentConfig.skills !== undefined) {
    result.skills = agentConfig.skills;
  }
  if (defaults?.skills !== undefined) {
    result.skills = result.skills ?? defaults.skills;
  }

  if (agentConfig.disallowed_tools) {
    result.restrictedTools = agentConfig.disallowed_tools;
  }

  if (agentConfig.max_turns || defaults?.max_turns) {
    result.maxTurns = agentConfig.max_turns ?? defaults?.max_turns;
  }

  if (agentConfig.timeout_seconds || defaults?.timeout_seconds) {
    result.timeoutSeconds = agentConfig.timeout_seconds ?? defaults?.timeout_seconds;
  }

  if (agentConfig.temperature || defaults?.temperature) {
    result.temperature = agentConfig.temperature ?? defaults?.temperature;
  }

  if (agentConfig.max_tokens || defaults?.max_tokens) {
    result.maxTokens = agentConfig.max_tokens ?? defaults?.max_tokens;
  }

  return result;
}

export interface AgentPackage {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[] | null;
  restrictedTools?: string[];
  model?: string;
  skills?: string[] | null;
  maxTurns?: number;
  timeoutSeconds?: number;
  temperature?: number;
  maxTokens?: number;
  source?: string;
}
