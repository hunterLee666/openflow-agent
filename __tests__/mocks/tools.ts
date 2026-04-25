import type { ToolDefinition } from "../../src/tools/enhanced-registry.js";

export function createToolRegistryMock(tools?: ToolDefinition[]) {
  const toolMap = new Map<string, ToolDefinition>();
  if (tools) {
    for (const tool of tools) {
      toolMap.set(tool.name, tool);
    }
  }

  return {
    register: (tool: ToolDefinition) => {
      toolMap.set(tool.name, tool);
    },
    get: (name: string) => toolMap.get(name),
    list: () => Array.from(toolMap.values()),
    listByCategory: (category: string) =>
      Array.from(toolMap.values()).filter(
        (t) => t.metadata?.category === category
      ),
    isLoaded: (name: string) => toolMap.has(name),
    has: (name: string) => toolMap.has(name),
    unregister: (name: string) => toolMap.delete(name),
    clear: () => toolMap.clear(),
    getStats: () => ({
      total: toolMap.size,
      loaded: toolMap.size,
      conditional: 0,
      byCategory: {
        file: 0,
        agent: 0,
        shell: 0,
        network: 0,
        memory: 0,
        task: 0,
        search: 0,
        mcp: 0,
        experimental: 0,
      },
    })),
    _getTools: () => toolMap,
  };
}

export type MockToolRegistry = ReturnType<typeof createToolRegistryMock>;

export function createMockTool(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: "object" },
    handler: async () => ({ success: true }),
    metadata: {
      name,
      description,
      category: "shell",
    },
  };
}
