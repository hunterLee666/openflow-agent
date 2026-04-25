import type { CapabilityPlugin, CapabilityContext, ToolDefinition } from "../types/index.js";
import { CapabilityType } from "../types/index.js";

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServerManifest {
  name: string;
  version: string;
  description: string;
  servers: MCPServerConfig[];
  toolFilter?: string[];
}

export class MCPPluginAdapter implements CapabilityPlugin {
  private serverConfigs: MCPServerConfig[];
  private toolFilter?: string[];

  constructor(manifest: MCPServerManifest) {
    this.serverConfigs = manifest.servers;
    this.toolFilter = manifest.toolFilter;
  }

  manifest = {
    name: "mcp-server",
    version: "1.0.0",
    type: CapabilityType.TOOL as CapabilityType,
    description: "MCP server plugin for extended tool capabilities",
    triggers: ["mcp"],
  };

  async activate(ctx: CapabilityContext): Promise<unknown> {
    const registeredTools: string[] = [];

    for (const serverConfig of this.serverConfigs) {
      try {
        const tools = await this.discoverMCPServerTools(serverConfig);

        for (const tool of tools) {
          if (this.toolFilter && !this.toolFilter.includes(tool.name)) {
            continue;
          }

          const adaptedTool: ToolDefinition = {
            name: `mcp_${tool.name}`,
            description: tool.description,
            inputSchema: tool.inputSchema,
            isReadOnly: true,
            handler: async (input: unknown) => {
              return this.callMCPTool(serverConfig, tool.name, input);
            },
          };

          ctx.tools.register(adaptedTool);
          registeredTools.push(`mcp_${tool.name}`);
        }
      } catch (error) {
        ctx.telemetry.log("mcp:server_error", {
          server: serverConfig.command,
          error: (error as Error).message,
        });
      }
    }

    return {
      dispose: () => {
        for (const toolName of registeredTools) {
          ctx.tools.unregister(toolName);
        }
      },
    };
  }

  async deactivate(): Promise<void> {
    // Cleanup handled by dispose in activate return
  }

  private async discoverMCPServerTools(_config: MCPServerConfig): Promise<MCPToolInfo[]> {
    // MCP protocol discovery - simplified implementation
    // Full implementation would use @modelcontextprotocol/sdk
    return [];
  }

  private async callMCPTool(
    _config: MCPServerConfig,
    _toolName: string,
    _input: unknown
  ): Promise<unknown> {
    // MCP protocol call - simplified implementation
    // Full implementation would use @modelcontextprotocol/sdk
    return { result: "MCP tool call not yet implemented" };
  }
}

export function createMCPPlugin(manifest: MCPServerManifest): CapabilityPlugin {
  return new MCPPluginAdapter(manifest);
}

export function adaptMCPServersToPlugins(
  servers: MCPServerManifest[]
): CapabilityPlugin[] {
  return servers.map(createMCPPlugin);
}
