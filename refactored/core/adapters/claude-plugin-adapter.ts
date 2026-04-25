import type { CapabilityPlugin, CapabilityContext } from "../types/index.js";
import { CapabilityType } from "../types/index.js";

export interface ClaudeCodeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: unknown) => Promise<unknown>;
}

export interface ClaudeCodePluginManifest {
  name: string;
  version: string;
  description: string;
  tools: ClaudeCodeTool[];
  skills?: string[];
  commands?: string[];
}

export interface ClaudeCodePlugin extends CapabilityPlugin {
  manifest: ClaudeCodePluginManifest & {
    type: CapabilityType;
    triggers: string[];
  };
}

export function createClaudeCodePlugin(
  manifest: ClaudeCodePluginManifest,
  tools: ClaudeCodeTool[]
): ClaudeCodePlugin {
  return {
    manifest: {
      name: manifest.name,
      version: manifest.version,
      type: CapabilityType.TOOL,
      description: manifest.description,
      triggers: tools.map((t) => t.name),
      tools,
      skills: manifest.skills,
      commands: manifest.commands,
    },

    async activate(ctx: CapabilityContext): Promise<unknown> {
      const registeredTools: string[] = [];

      for (const tool of tools) {
        ctx.tools.register({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
          isReadOnly: true,
          handler: tool.handler,
        });
        registeredTools.push(tool.name);
      }

      return {
        dispose: () => {
          for (const toolName of registeredTools) {
            ctx.tools.unregister(toolName);
          }
        },
      };
    },

    async deactivate(): Promise<void> {
      // Cleanup handled by dispose
    },
  };
}

export function adaptClaudeCodeToolsToPlugin(
  name: string,
  description: string,
  tools: ClaudeCodeTool[]
): ClaudeCodePlugin {
  return createClaudeCodePlugin(
    { name, version: "1.0.0", description, tools },
    tools
  );
}
