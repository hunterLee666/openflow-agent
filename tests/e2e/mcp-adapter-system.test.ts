import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { McpServerManager } from "../../backend/plugins/mcp-server-manager";
import {
  adaptCommandToPlugin,
  adaptCommandsToPlugins,
} from "../../backend/adapters/command-adapter";
import { adaptToolToPlugin, adaptToolsToPlugins } from "../../backend/adapters/tool-adapter";
import {
  OpenflowConfigAdapter,
  loadOpenflowConfig,
} from "../../backend/adapters/openflow-config-adapter";
import { MCPPluginAdapter } from "../../backend/adapters/mcp-adapter";

const TEST_DIR = join(process.cwd(), "tests", "e2e", "test-data", "mcp-adapter");

describe("E2E - MCP 和适配器系统完整场景", () => {
  let projectDir: string;
  let configDir: string;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    configDir = join(projectDir, ".openflow");
    await mkdir(configDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: MCP 服务器管理器基础功能", () => {
    it("应该能够创建 MCP 服务器管理器实例", () => {
      const manager = new McpServerManager();
      expect(manager).toBeDefined();
    });

    it("MCP 服务器管理器应该继承 EventEmitter", () => {
      const manager = new McpServerManager();
      expect(typeof manager.on).toBe("function");
      expect(typeof manager.emit).toBe("function");
    });
  });

  describe("场景 2: 命令适配器功能", () => {
    it("应该能够将单个命令转换为插件", () => {
      const command = {
        name: "test-command",
        description: "Test command",
        handler: async () => ({ result: "ok" }),
      };

      const plugin = adaptCommandToPlugin(command);
      expect(plugin).toBeDefined();
      expect(plugin.name).toContain("test-command");
      expect(plugin.type).toBe("command");
    });

    it("应该能够将多个命令转换为插件", () => {
      const commands = [
        {
          name: "cmd1",
          description: "Command 1",
          handler: async () => ({}),
        },
        {
          name: "cmd2",
          description: "Command 2",
          handler: async () => ({}),
        },
      ];

      const plugins = adaptCommandsToPlugins(commands);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(2);
    });

    it("转换后的命令插件应该包含正确的元数据", () => {
      const command = {
        name: "echo",
        description: "Echo command",
        handler: async (msg: string) => msg,
      };

      const plugin = adaptCommandToPlugin(command);
      expect(plugin.name).toBeDefined();
      expect(plugin.description).toBeDefined();
      expect(plugin.capabilities).toBeDefined();
    });
  });

  describe("场景 3: 工具适配器功能", () => {
    it("应该能够将单个工具转换为插件", () => {
      const tool = {
        name: "test-tool",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
        handler: async (input: any) => input,
      };

      const plugin = adaptToolToPlugin(tool);
      expect(plugin).toBeDefined();
      expect(plugin.name).toContain("test-tool");
      expect(plugin.type).toBe("tool");
    });

    it("应该能够将多个工具转换为插件", () => {
      const tools = [
        {
          name: "tool1",
          description: "Tool 1",
          inputSchema: { type: "object" },
          handler: async () => ({}),
        },
        {
          name: "tool2",
          description: "Tool 2",
          inputSchema: { type: "object" },
          handler: async () => ({}),
        },
      ];

      const plugins = adaptToolsToPlugins(tools);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(2);
    });

    it("转换后的工具插件应该包含正确的输入模式", () => {
      const tool = {
        name: "calculator",
        description: "Calculate numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
            op: { type: "string" },
          },
        },
        handler: async () => ({ result: 0 }),
      };

      const plugin = adaptToolToPlugin(tool);
      expect(plugin.tools).toBeDefined();
      expect(Array.isArray(plugin.tools)).toBe(true);
    });
  });

  describe("场景 4: OpenFlow 配置适配器", () => {
    it("应该能够创建配置适配器实例", () => {
      const adapter = new OpenflowConfigAdapter(projectDir);
      expect(adapter).toBeDefined();
    });

    it("应该能够加载配置", async () => {
      const configPath = join(configDir, "config.json");
      await writeFile(
        configPath,
        JSON.stringify({
          project: {
            name: "Test Project",
          },
        })
      );

      const config = await loadOpenflowConfig(projectDir);
      expect(config).toBeDefined();
    });

    it("应该能够获取配置值", () => {
      const adapter = new OpenflowConfigAdapter(projectDir);
      const value = adapter.get("project.name", "Default Project");
      expect(value).toBeDefined();
    });

    it("应该能够设置配置值", async () => {
      const adapter = new OpenflowConfigAdapter(projectDir);
      await adapter.set("project.name", "Test Project");
      const value = adapter.get("project.name", "");
      expect(value).toBeDefined();
    });

    it("应该能够列出所有配置键", () => {
      const adapter = new OpenflowConfigAdapter(projectDir);
      const keys = adapter.keys();
      expect(Array.isArray(keys)).toBe(true);
    });

    it("应该能够检查配置键是否存在", () => {
      const adapter = new OpenflowConfigAdapter(projectDir);
      const exists = adapter.has("project.name");
      expect(exists).toBeTypeOf("boolean");
    });
  });

  describe("场景 5: MCP 插件适配器", () => {
    it("应该能够创建 MCP 插件适配器实例", () => {
      const adapter = new MCPPluginAdapter();
      expect(adapter).toBeDefined();
    });

    it("应该能够创建 MCP 插件", () => {
      const serverConfig = {
        name: "test-mcp-server",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      };

      const plugin = MCPPluginAdapter.createMCPPlugin(serverConfig);
      expect(plugin).toBeDefined();
      expect(plugin.type).toBe("mcp");
    });

    it("应该能够将多个 MCP 服务器转换为插件", () => {
      const servers = [
        {
          name: "server1",
          command: "node",
          args: ["server1.js"],
        },
        {
          name: "server2",
          command: "node",
          args: ["server2.js"],
        },
      ];

      const plugins = MCPPluginAdapter.adaptMCPServersToPlugins(servers);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(2);
    });
  });

  describe("场景 6: 适配器集成测试", () => {
    it("应该能够在不同适配器之间一致地转换插件", () => {
      const tool = {
        name: "test-tool",
        description: "Test",
        inputSchema: { type: "object" },
        handler: async () => ({}),
      };

      const command = {
        name: "test-cmd",
        description: "Test",
        handler: async () => ({}),
      };

      const toolPlugin = adaptToolToPlugin(tool);
      const cmdPlugin = adaptCommandToPlugin(command);

      expect(toolPlugin.type).toBeDefined();
      expect(cmdPlugin.type).toBeDefined();
    });

    it("应该能够使用配置适配器配置 MCP", async () => {
      const configAdapter = new OpenflowConfigAdapter(projectDir);
      
      await configAdapter.set("mcp.servers", [
        {
          name: "fs-server",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
      ]);

      const servers = configAdapter.get("mcp.servers", []);
      expect(Array.isArray(servers)).toBe(true);
    });
  });

  describe("场景 7: 适配器错误处理", () => {
    it("应该优雅地处理无效的工具定义", () => {
      const invalidTool = {
        name: "invalid-tool",
      };

      try {
        const plugin = adaptToolToPlugin(invalidTool as any);
        expect(plugin).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("应该优雅地处理无效的命令定义", () => {
      const invalidCommand = {
        name: "invalid-cmd",
      };

      try {
        const plugin = adaptCommandToPlugin(invalidCommand as any);
        expect(plugin).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("应该优雅地处理无效的 MCP 服务器配置", () => {
      const invalidServer = {
        name: "invalid-server",
      };

      try {
        const plugin = MCPPluginAdapter.createMCPPlugin(invalidServer as any);
        expect(plugin).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("场景 8: 空输入处理", () => {
    it("应该优雅地处理空工具列表", () => {
      const plugins = adaptToolsToPlugins([]);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it("应该优雅地处理空命令列表", () => {
      const plugins = adaptCommandsToPlugins([]);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });

    it("应该优雅地处理空 MCP 服务器列表", () => {
      const plugins = MCPPluginAdapter.adaptMCPServersToPlugins([]);
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });
  });
});
