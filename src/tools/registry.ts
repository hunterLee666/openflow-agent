import type { Tool, ToolUseContext, ValidationResult } from '../core/tools/tool';
import { getToolDescription } from './descriptions';

// In-memory global registry (raw tools without UI extras)
const tools: Tool[] = [];

export function registerTool(tool: Tool) {
  tools.push(tool);
}

export function getAllTools(): Tool[] {
  return tools;
}

export async function getTools(): Promise<Tool[]> {
  // Lazy registration: if no tools registered yet, register SDK tools now
  if (tools.length === 0 && !(globalThis as any).__openflowSdkToolsRegistered) {
    // Import here to avoid circular dependencies
    const { getAllBaseTools } = await import('@codeany/open-agent-sdk');
    const { installDefaultToolDescriptions, getToolDescription } = await import('./descriptions');
    const sdkTools = getAllBaseTools();
    installDefaultToolDescriptions();
    for (const sdkTool of sdkTools) {
      // Ensure inputSchema has safeParse method
      const rawSchema = sdkTool.inputSchema;
      const inputSchema = {
        ...rawSchema,
        safeParse: (input: any) => {
          // If original schema has safeParse, use it
          if (rawSchema && typeof rawSchema.safeParse === 'function') {
            return rawSchema.safeParse(input);
          }
          // Fallback: accept any input
          return { success: true, data: input };
        },
      };

      // Convert and register
      const openflowTool: any = {
        name: sdkTool.name,
        description: sdkTool.description,
        inputSchema,
        call: sdkTool.call,
        isEnabled: sdkTool.isEnabled || (() => true),
        isReadOnly: sdkTool.isReadOnly || (() => false),
        userFacingName: (input?: any) => {
          const desc = getToolDescription(sdkTool.name);
          if (desc?.userFacingName) return desc.userFacingName(input);
          return typeof sdkTool.description === 'function' ? sdkTool.description(input) : (sdkTool.description || sdkTool.name);
        },
        renderToolUseMessage: (input: any, options?: { verbose?: boolean }) => {
          const desc = getToolDescription(sdkTool.name);
          if (desc?.renderToolUseMessage) return desc.renderToolUseMessage(input, options);
          if (options?.verbose) return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
          return `${sdkTool.name}: ${JSON.stringify(input)}`;
        },
        renderToolUseRejectedMessage: () => {
          const desc = getToolDescription(sdkTool.name);
          if (desc?.renderToolUseRejectedMessage) return desc.renderToolUseRejectedMessage();
          return `❌ ${sdkTool.name} was not executed.`;
        },
        renderToolResultMessage: (output: any, options?: { verbose?: boolean }) => {
          const desc = getToolDescription(sdkTool.name);
          if (desc?.renderToolResultMessage) return desc.renderToolResultMessage(output, options);
          if (typeof output === 'string') return output;
          if (options?.verbose) return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
          return `${sdkTool.name} completed.`;
        },
        needsPermissions: () => false,
        requiresUserInteraction: () => false,
      };
      registerTool(openflowTool);
    }
    (globalThis as any).__openflowSdkToolsRegistered = true;
  }

  // Register custom tools not provided by SDK (e.g., Task)
  if (!(globalThis as any).__openflowCustomToolsRegistered) {
    try {
      const { TaskTool } = await import('./agent/TaskTool/TaskTool');
      registerTool(TaskTool);
    } catch (e) {
      // ignore, tool may be unavailable
    }
    (globalThis as any).__openflowCustomToolsRegistered = true;
  }

  const filtered = tools.filter(t => (t.isEnabled?.() ?? true));
  return filtered.map(enrichTool);
}

export async function getReadOnlyTools(): Promise<Tool[]> {
  return (await getTools()).filter(t => t.isReadOnly?.() === true);
}

// Enrich a tool with UI helper methods
function enrichTool(tool: Tool): Tool {
  const enriched: Tool = {
    ...tool,
    userFacingName: tool.userFacingName || ((input?: any) => {
      if (typeof tool.description === 'function') return tool.description(input);
      return tool.description || tool.name;
    }),
    renderToolUseMessage: tool.renderToolUseMessage || ((input: any, options?: { verbose?: boolean }) => {
      if (options?.verbose) {
        return `\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\``;
      }
      return `${tool.name}: ${JSON.stringify(input)}`;
    }),
    renderToolUseRejectedMessage: tool.renderToolUseRejectedMessage || (() => `❌ ${tool.name} was not executed.`),
    renderToolResultMessage: tool.renderToolResultMessage || ((output: any, options?: { verbose?: boolean }) => {
      if (typeof output === 'string') return output;
      if (options?.verbose) {
        return `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\``;
      }
      return `${tool.name} completed.`;
    }),
    needsPermissions: tool.needsPermissions || (() => false),
    requiresUserInteraction: tool.requiresUserInteraction || (() => false),
  };
  return enriched;
}

export { getToolDescription };

export type { Tool, ToolUseContext, ValidationResult };
